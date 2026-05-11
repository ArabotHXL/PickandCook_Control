import { query } from "../routes/ops/db.js";
import { logger } from "../lib/logger.js";

/**
 * Idempotent boot-time schema bootstrap for the embedded worker. Adds a partial
 * unique index that lets `startJob` use `INSERT ... ON CONFLICT DO NOTHING` to
 * atomically claim a "single running row per job_name" lock without races
 * between the cron tick and a manual trigger arriving simultaneously.
 *
 * Safe to call repeatedly: `CREATE UNIQUE INDEX IF NOT EXISTS` is a no-op
 * after the first successful run.
 */
export async function ensureJobSchema(): Promise<void> {
  try {
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS job_runs_one_running_per_name
         ON job_runs (job_name)
         WHERE status = 'running'`
    );
  } catch (err) {
    // If duplicate "running" rows exist for the same job_name from a prior
    // crash, the index creation will fail. Reap stale rows (locked_until
    // expired or older than 1h) and retry once.
    logger.warn({ err }, "[worker] index create failed; reaping stale rows then retry");
    await query(
      `UPDATE job_runs
         SET status = 'failed',
             error_message = 'Reaped at boot (stale lock)',
             finished_at = NOW(),
             locked_until = NULL,
             updated_at = NOW()
       WHERE status = 'running'
         AND (locked_until IS NULL OR locked_until < NOW() OR started_at < NOW() - INTERVAL '1 hour')`
    );
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS job_runs_one_running_per_name
         ON job_runs (job_name)
         WHERE status = 'running'`
    );
  }
}

/**
 * Schema bootstrap for the ops dashboard's staging-promotion + alerting
 * features. Adds:
 *  - `imported_recipes_staging.promoted_recipe_id` so we can trace which
 *    `recipes.id` a staging row produced after promotion (and prevent
 *    double-promotion via a unique constraint).
 *  - `system_flags` row for `alert_webhook_url` (idempotent insert).
 *  - `user_role` enum extension for `read_only_admin` if the column is
 *    text-typed (most installs are) we just rely on application-level
 *    validation; nothing to add here.
 *  - `user_totp` table for admin 2FA opt-in.
 *
 * Safe to call repeatedly. Each statement is `IF NOT EXISTS` or upsert.
 */
export async function ensureOpsSchema(): Promise<void> {
  // Staging → Recipes traceability
  await query(
    `ALTER TABLE imported_recipes_staging
       ADD COLUMN IF NOT EXISTS promoted_recipe_id varchar`
  );
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS imported_recipes_staging_promoted_unique
       ON imported_recipes_staging (promoted_recipe_id)
       WHERE promoted_recipe_id IS NOT NULL`
  );

  // Admin TOTP 2FA (opt-in per admin)
  await query(
    `CREATE TABLE IF NOT EXISTS admin_totp (
       user_id varchar PRIMARY KEY,
       secret text NOT NULL,
       enabled_at timestamp,
       last_verified_at timestamp,
       created_at timestamp NOT NULL DEFAULT NOW()
     )`
  );

  // Generic outbound alert webhook config (Slack-compatible POST). Stored as
  // a `flags` key under the existing `system_flags` row with id='system' so
  // it's editable from the existing flags UI without a schema change.
  // Schema is `system_flags(id text PK, flags jsonb, updated_at, updated_by)`.
  // We seed defaults only if the system scope doesn't have the keys yet.
  await query(
    `INSERT INTO system_flags (id, flags, updated_at)
     VALUES ('system', $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE
       SET flags = system_flags.flags || (
             $1::jsonb - (
               SELECT COALESCE(array_agg(k), ARRAY[]::text[])
                 FROM jsonb_object_keys(system_flags.flags) k
                WHERE k = ANY (ARRAY['alert_webhook_url','alert_webhook_enabled'])
             )
           ),
           updated_at = NOW()`,
    [JSON.stringify({ alert_webhook_url: null, alert_webhook_enabled: false })]
  );
}

/**
 * Schema bootstrap for the Control → prod reverse-sync cron
 * (`opsReverseSync:periodic`). Adds:
 *
 *  - `recipes.updated_at` and `products.updated_at` columns (these tables
 *    have always had only `created_at`). The shared `touch_updated_at`
 *    trigger function bumps the column on every UPDATE so we have an
 *    honest `controlUpdatedAt` to send to prod's CAS predicate.
 *  - `ops_sync_cursor`: per-endpoint high-water-mark of the last
 *    successfully pushed audit-log timestamp. The cursor only advances
 *    when a push completes with zero per-row errors.
 *  - `ops_sync_runs`: append-only audit table for every reverse-sync run
 *    (including dry-runs and zero-row no-ops). Lets System Health prove
 *    "we ran on time, here's what we sent".
 *
 * Safe to call repeatedly. Each statement is `IF NOT EXISTS` or
 * `CREATE OR REPLACE`.
 */
export async function ensureReverseSyncSchema(): Promise<void> {
  // Shared touch trigger function. CREATE OR REPLACE is idempotent.
  await query(
    `CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
       LANGUAGE plpgsql AS $$
     BEGIN
       NEW.updated_at = NOW();
       RETURN NEW;
     END;
     $$`
  );

  // recipes.updated_at + trigger
  await query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT NOW()`);
  await query(
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_trigger WHERE tgname = 'recipes_touch_updated_at'
       ) THEN
         CREATE TRIGGER recipes_touch_updated_at
           BEFORE UPDATE ON recipes
           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
       END IF;
     END
     $$`
  );

  // products.updated_at + trigger
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT NOW()`);
  await query(
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_trigger WHERE tgname = 'products_touch_updated_at'
       ) THEN
         CREATE TRIGGER products_touch_updated_at
           BEFORE UPDATE ON products
           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
       END IF;
     END
     $$`
  );

  // Cursor table — endpoint is one of: 'recipes', 'moderation-decisions', 'products'
  await query(
    `CREATE TABLE IF NOT EXISTS ops_sync_cursor (
       endpoint        text PRIMARY KEY,
       last_pushed_at  timestamp NOT NULL,
       updated_at      timestamp NOT NULL DEFAULT NOW()
     )`
  );

  // Run audit table
  await query(
    `CREATE TABLE IF NOT EXISTS ops_sync_runs (
       id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       started_at      timestamp NOT NULL,
       finished_at     timestamp,
       endpoint        text NOT NULL,
       status          text NOT NULL,
       summary         jsonb NOT NULL,
       sample_results  jsonb,
       error_message   text
     )`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS ops_sync_runs_endpoint_started_idx
       ON ops_sync_runs (endpoint, started_at DESC)`
  );
}

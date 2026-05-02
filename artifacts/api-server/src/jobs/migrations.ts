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

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

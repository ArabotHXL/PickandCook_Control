import { query, queryOne } from "../routes/ops/db.js";
import { logger } from "../lib/logger.js";
import { sendAlert } from "../lib/alerts.js";

export type JobSummary = Record<string, unknown>;

export interface JobContext {
  jobName: string;
  jobRunId: string;
  triggeredBy: string;
  log: typeof logger;
}

export type JobHandler = (ctx: JobContext) => Promise<JobSummary>;

const DEFAULT_LOCK_MINUTES = 60;

export async function startJob(opts: {
  jobName: string;
  triggeredBy: string;
  lockMinutes?: number;
}): Promise<{ jobRunId: string } | { skipped: true; reason: string }> {
  const { jobName, triggeredBy, lockMinutes = DEFAULT_LOCK_MINUTES } = opts;

  // Reap stale "running" rows (process crashed between INSERT and finish) so
  // the partial unique index has room. Only reaps rows for THIS job_name to
  // minimize blast radius.
  await query(
    `UPDATE job_runs
       SET status = 'failed',
           error_message = COALESCE(error_message, 'Lock expired (process crashed?)'),
           finished_at = NOW(),
           locked_until = NULL,
           updated_at = NOW()
     WHERE job_name = $1 AND status = 'running'
       AND locked_until IS NOT NULL AND locked_until < NOW()`,
    [jobName]
  );

  // Atomic claim: the partial unique index `job_runs_one_running_per_name`
  // (created in migrations.ts) guarantees at most one running row per job_name.
  // If another runner already claimed it, INSERT silently no-ops and the
  // RETURNING clause yields zero rows.
  const row = await queryOne<{ id: string }>(
    `INSERT INTO job_runs (job_name, status, started_at, triggered_by, locked_until)
     VALUES ($1, 'running', NOW(), $2, NOW() + ($3 || ' minutes')::interval)
     ON CONFLICT (job_name) WHERE status = 'running' DO NOTHING
     RETURNING id`,
    [jobName, triggeredBy, String(lockMinutes)]
  );
  if (!row) {
    return { skipped: true, reason: "Already running (lock held by another runner)" };
  }
  return { jobRunId: row.id };
}

export async function finishJob(jobRunId: string, summary: JobSummary): Promise<void> {
  await query(
    `UPDATE job_runs
     SET status = 'success', finished_at = NOW(), summary = $2,
         duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
         locked_until = NULL, updated_at = NOW()
     WHERE id = $1`,
    [jobRunId, JSON.stringify(summary)]
  );
}

export async function failJob(jobRunId: string, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  await query(
    `UPDATE job_runs
     SET status = 'failed', finished_at = NOW(), error_message = $2,
         duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
         locked_until = NULL, updated_at = NOW()
     WHERE id = $1`,
    [jobRunId, msg.slice(0, 2000)]
  );
}

export async function runJob(
  jobName: string,
  handler: JobHandler,
  triggeredBy: string
): Promise<{ jobRunId?: string; skipped?: string; ok?: boolean; error?: string }> {
  const start = await startJob({ jobName, triggeredBy });
  if ("skipped" in start) {
    logger.warn({ jobName, reason: start.reason }, "[worker] skip start");
    return { skipped: start.reason };
  }
  const { jobRunId } = start;
  const childLog = logger.child({ jobName, jobRunId });
  childLog.info("[worker] start");
  try {
    const summary = await handler({ jobName, jobRunId, triggeredBy, log: childLog });
    await finishJob(jobRunId, summary);
    childLog.info({ summary }, "[worker] success");
    return { jobRunId, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    childLog.error({ err }, "[worker] failed");
    await failJob(jobRunId, err);
    // Fire-and-forget alert. sendAlert never throws.
    sendAlert({
      severity: "error",
      title: `Job failed: ${jobName}`,
      body: msg.slice(0, 500),
      fields: [
        { label: "Triggered by", value: triggeredBy },
        { label: "Run id", value: jobRunId },
      ],
    }).catch(() => undefined);
    return { jobRunId, error: msg };
  }
}

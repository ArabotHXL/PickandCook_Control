import type { Request, Response } from "express";
import { query, queryOne } from "./db.js";
import { parseLimit, parsePage } from "./queryParams.js";
import { writeAuditLog } from "./audit.js";
import type { AdminPayload } from "./auth.js";
import { HttpError } from "../../lib/httpError.js";
import { JOB_DEFINITIONS, getJob } from "../../jobs/registry.js";
import { triggerJobAsync } from "../../jobs/scheduler.js";

function getAdminUser(req: Request): AdminPayload {
  return (req as Request & { adminUser: AdminPayload }).adminUser;
}

async function getLatestJob(jobName: string): Promise<Record<string, unknown> | null> {
  return queryOne<Record<string, unknown>>(
    `SELECT id, job_name, status, started_at, finished_at, duration_ms, error_message, triggered_by, summary
     FROM job_runs WHERE job_name = $1 ORDER BY started_at DESC LIMIT 1`,
    [jobName]
  );
}

async function getLastSuccess(jobName: string): Promise<Record<string, unknown> | null> {
  return queryOne<Record<string, unknown>>(
    `SELECT id, job_name, status, started_at, finished_at, duration_ms
     FROM job_runs WHERE job_name = $1 AND status IN ('success','completed')
     ORDER BY started_at DESC LIMIT 1`,
    [jobName]
  );
}

const STALE_DAYS = 2; // anything older than this counts as stale data
const ZOMBIE_HOURS = 1; // running jobs older than this are zombies

export async function getSystemHealth(_req: Request, res: Response): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build the list of "key jobs" we want to track. Pull from any job that has
  // ever run (not just the legacy three) so the UI surfaces real pipeline state.
  const jobNames = await query<{ job_name: string }>(
    `SELECT DISTINCT job_name FROM job_runs ORDER BY job_name`
  );
  const trackedJobs = jobNames.map((r) => r.job_name);

  const [
    lastRecipeImport,
    lastBarcodeImport,
    lastNotificationJob,
    recentFailedJobs,
    jobCounts,
    llmCost,
    zombies,
    keyJobLatest,
    keyJobLastSuccess,
  ] = await Promise.all([
    getLatestJob("recipe_import"),
    getLatestJob("barcode_import"),
    getLatestJob("notification_send"),
    query<Record<string, unknown>>(
      `SELECT id, job_name, status, started_at, finished_at, duration_ms, error_message, triggered_by, summary
       FROM job_runs WHERE status = 'failed' ORDER BY started_at DESC LIMIT 5`
    ),
    query<{ total: string; failed: string }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
       FROM job_runs WHERE started_at >= $1`,
      [today]
    ),
    query<{ today_cost: string; week_cost: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN usage_date = $1 THEN cost_usd ELSE 0 END), 0)::text AS today_cost,
         COALESCE(SUM(cost_usd), 0)::text AS week_cost
       FROM llm_usage_daily
       WHERE usage_date >= $2`,
      [
        today.toISOString().slice(0, 10),
        new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10),
      ]
    ).catch(() => [{ today_cost: "0", week_cost: "0" }]),
    query<{ id: string; job_name: string; started_at: string; age_seconds: string }>(
      `SELECT id, job_name, started_at,
              EXTRACT(EPOCH FROM (NOW() - started_at))::text AS age_seconds
       FROM job_runs
       WHERE status = 'running'
         AND started_at < NOW() - INTERVAL '${ZOMBIE_HOURS} hour'
       ORDER BY started_at ASC`
    ),
    Promise.all(trackedJobs.map((n) => getLatestJob(n))),
    Promise.all(trackedJobs.map((n) => getLastSuccess(n))),
  ]);

  const mapJob = (j: Record<string, unknown> | null) =>
    j
      ? {
          id: j.id,
          jobName: j.job_name,
          status: j.status,
          startedAt: j.started_at,
          finishedAt: j.finished_at,
          durationMs: j.duration_ms,
          errorMessage: j.error_message,
          triggeredBy: j.triggered_by,
          summary: j.summary,
        }
      : null;

  const now = Date.now();
  const staleMs = STALE_DAYS * 86400_000;
  const trackedJobSummaries = trackedJobs.map((name, i) => {
    const latest = keyJobLatest[i];
    const lastSuccess = keyJobLastSuccess[i];
    const lastSuccessAt = lastSuccess?.started_at
      ? new Date(String(lastSuccess.started_at)).getTime()
      : null;
    const stale = lastSuccessAt === null || now - lastSuccessAt > staleMs;
    return {
      jobName: name,
      latest: mapJob(latest),
      lastSuccess: mapJob(lastSuccess),
      lastSuccessAt: lastSuccess?.started_at ?? null,
      stale,
      staleSinceDays:
        lastSuccessAt === null ? null : Math.floor((now - lastSuccessAt) / 86400_000),
    };
  });

  res.json({
    lastRecipeImport: mapJob(lastRecipeImport),
    lastBarcodeImport: mapJob(lastBarcodeImport),
    lastNotificationJob: mapJob(lastNotificationJob),
    recentFailedJobs: recentFailedJobs.map(mapJob),
    totalJobsToday: parseInt(jobCounts[0]?.total ?? "0", 10),
    failedJobsToday: parseInt(jobCounts[0]?.failed ?? "0", 10),
    llmCostToday: parseFloat(llmCost[0]?.today_cost ?? "0"),
    llmCostThisWeek: parseFloat(llmCost[0]?.week_cost ?? "0"),
    trackedJobs: trackedJobSummaries,
    zombies: zombies.map((z) => ({
      id: z.id,
      jobName: z.job_name,
      startedAt: z.started_at,
      ageSeconds: parseFloat(z.age_seconds),
    })),
    thresholds: { staleDays: STALE_DAYS, zombieHours: ZOMBIE_HOURS },
  });
}

export async function listJobRuns(req: Request, res: Response): Promise<void> {
  const jobName = req.query.jobName as string | undefined;
  const status = req.query.status as string | undefined;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, { def: 50, max: 100 });
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (jobName) {
    conditions.push(`job_name = $${pi}`);
    params.push(jobName);
    pi++;
  }
  if (status) {
    conditions.push(`status = $${pi}`);
    params.push(status);
    pi++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [jobs, countRows] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT id, job_name, status, started_at, finished_at, duration_ms, error_message, triggered_by, summary
       FROM job_runs ${where} ORDER BY started_at DESC LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM job_runs ${where}`,
      params
    ),
  ]);

  res.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      jobName: j.job_name,
      status: j.status,
      startedAt: j.started_at,
      finishedAt: j.finished_at,
      durationMs: j.duration_ms,
      errorMessage: j.error_message,
      triggeredBy: j.triggered_by,
      summary: j.summary,
    })),
    total: parseInt(countRows[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

export async function clearStuckJobs(req: Request, res: Response): Promise<void> {
  const admin = getAdminUser(req);

  // Only mark "running" jobs older than ZOMBIE_HOURS as failed. Anything fresher
  // might be a legitimate in-flight run we don't want to clobber.
  const cleared = await query<{ id: string; job_name: string; started_at: string }>(
    `UPDATE job_runs
     SET status = 'failed',
         finished_at = NOW(),
         error_message = COALESCE(error_message, 'Manually cleared by admin (worker absent)'),
         duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
     WHERE status = 'running'
       AND started_at < NOW() - INTERVAL '${ZOMBIE_HOURS} hour'
     RETURNING id, job_name, started_at`
  );

  if (cleared.length > 0) {
    await writeAuditLog({
      adminUserId: admin.userId,
      actionType: "system.clear_stuck_jobs",
      targetType: "job_runs",
      targetId: cleared.map((c) => c.id).join(","),
      newValue: { cleared: cleared.map((c) => ({ id: c.id, jobName: c.job_name })) },
      decisionNote: `Cleared ${cleared.length} stuck job(s)`,
    });
  }

  res.json({
    cleared: cleared.length,
    jobs: cleared.map((c) => ({
      id: c.id,
      jobName: c.job_name,
      startedAt: c.started_at,
    })),
  });
}

export async function listAvailableJobs(_req: Request, res: Response): Promise<void> {
  res.json({
    jobs: JOB_DEFINITIONS.map((j) => ({
      name: j.name,
      cronExpr: j.cronExpr,
      description: j.description,
    })),
  });
}

export async function triggerJob(req: Request, res: Response): Promise<void> {
  const admin = getAdminUser(req);
  const jobName = req.params["jobName"];
  if (!jobName || typeof jobName !== "string") {
    throw new HttpError(400, "jobName param required");
  }
  const def = getJob(jobName);
  if (!def) {
    throw new HttpError(404, `Unknown job: ${jobName}`);
  }

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "system.trigger_job",
    targetType: "job",
    targetId: jobName,
    decisionNote: `Manually triggered ${jobName}`,
  });

  // Fire-and-forget; runner already records success/failure into job_runs.
  // We still log launch errors here in case `startJob` itself blew up before
  // a job_runs row was written.
  triggerJobAsync(jobName, `manual:${admin.userId}`).catch((err: unknown) => {
    req.log.error({ err, jobName, adminUserId: admin.userId }, "manual trigger launch failed");
  });

  res.status(202).json({ accepted: true, jobName });
}

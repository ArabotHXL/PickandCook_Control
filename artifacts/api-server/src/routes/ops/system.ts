import type { Request, Response } from "express";
import { query, queryOne } from "./db.js";

async function getLatestJob(jobName: string): Promise<Record<string, unknown> | null> {
  return queryOne<Record<string, unknown>>(
    `SELECT id, job_name, status, started_at, finished_at, duration_ms, error_message, triggered_by, summary
     FROM job_runs WHERE job_name = $1 ORDER BY started_at DESC LIMIT 1`,
    [jobName]
  );
}

export async function getSystemHealth(_req: Request, res: Response): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    lastRecipeImport,
    lastBarcodeImport,
    lastNotificationJob,
    recentFailedJobs,
    jobCounts,
    llmCost,
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

  res.json({
    lastRecipeImport: mapJob(lastRecipeImport),
    lastBarcodeImport: mapJob(lastBarcodeImport),
    lastNotificationJob: mapJob(lastNotificationJob),
    recentFailedJobs: recentFailedJobs.map(mapJob),
    totalJobsToday: parseInt(jobCounts[0]?.total ?? "0", 10),
    failedJobsToday: parseInt(jobCounts[0]?.failed ?? "0", 10),
    llmCostToday: parseFloat(llmCost[0]?.today_cost ?? "0"),
    llmCostThisWeek: parseFloat(llmCost[0]?.week_cost ?? "0"),
  });
}

export async function listJobRuns(req: Request, res: Response): Promise<void> {
  const jobName = req.query.jobName as string | undefined;
  const status = req.query.status as string | undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
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

import type { Request, Response } from "express";
import { query, queryOne } from "./db.js";
import { parseLimit, parsePage } from "./queryParams.js";
import { writeAuditLog } from "./audit.js";
import type { AdminPayload } from "./auth.js";
import { HttpError } from "../../lib/httpError.js";
import { validateCronPolicy } from "../../lib/cronPolicy.js";
import cron from "node-cron";
import { JOB_DEFINITIONS, getJob } from "../../jobs/registry.js";
import {
  triggerJobAsync,
  getCronOverrides,
  rescheduleJob,
} from "../../jobs/scheduler.js";
import { sendAlert } from "../../lib/alerts.js";

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
       FROM job_runs
       WHERE status = 'failed'
         AND started_at >= NOW() - INTERVAL '7 days'
       ORDER BY started_at DESC LIMIT 5`
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

// Allowlist for /system/jobs sortable columns; unknown keys silently fall back
// to startedAt so the `sort` query param can never inject SQL.
export const JOB_RUNS_SORT_COLUMNS: Record<string, string> = {
  jobName: "job_name",
  status: "status",
  startedAt: "started_at",
  durationMs: "duration_ms",
};

export function resolveJobRunsOrderBy(
  sortKey: string | undefined,
  dirParam: string | undefined,
): string {
  const expr = JOB_RUNS_SORT_COLUMNS[sortKey ?? ""] ?? JOB_RUNS_SORT_COLUMNS.startedAt;
  const dir = dirParam === "asc" ? "ASC" : "DESC";
  return `${expr} ${dir} NULLS LAST, started_at DESC`;
}

export async function listJobRuns(req: Request, res: Response): Promise<void> {
  const jobName = req.query.jobName as string | undefined;
  const status = req.query.status as string | undefined;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, { def: 50, max: 100 });
  const offset = (page - 1) * limit;
  const orderBy = resolveJobRunsOrderBy(
    req.query.sort as string | undefined,
    req.query.dir as string | undefined,
  );

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
       FROM job_runs ${where} ORDER BY ${orderBy} LIMIT $${pi} OFFSET $${pi + 1}`,
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

export async function listJobSchedules(_req: Request, res: Response): Promise<void> {
  const overrides = await getCronOverrides();
  res.json({
    schedules: JOB_DEFINITIONS.map((j) => ({
      name: j.name,
      description: j.description,
      defaultCronExpr: j.cronExpr,
      effectiveCronExpr: overrides[j.name] ?? j.cronExpr,
      isOverride: Object.prototype.hasOwnProperty.call(overrides, j.name),
    })),
  });
}

export async function updateJobSchedule(req: Request, res: Response): Promise<void> {
  const admin = getAdminUser(req);
  const jobName = req.params["jobName"];
  if (!jobName || typeof jobName !== "string") {
    throw new HttpError(400, "jobName param required");
  }
  const def = getJob(jobName);
  if (!def) {
    throw new HttpError(404, `Unknown job: ${jobName}`);
  }

  const body = (req.body ?? {}) as { cronExpr?: string | null };
  let next = body.cronExpr;
  if (typeof next === "string") next = next.trim();
  const clearing = next === null || next === undefined || next === "";

  if (!clearing) {
    if (!cron.validate(next as string)) {
      throw new HttpError(400, `Invalid cron expression: ${String(next)}`);
    }
    const policy = validateCronPolicy(next as string);
    if (!policy.ok) {
      throw new HttpError(400, `Cron expression rejected by policy: ${policy.reason}`);
    }
  }

  // Snapshot prior value for audit only — the actual write below is atomic
  // at the JSON-key level so two admins editing different jobs cannot clobber
  // each other.
  const existing = await query<{ flags: Record<string, unknown> }>(
    `SELECT flags FROM system_flags WHERE id = 'job_schedules' LIMIT 1`
  );
  const before = (existing[0]?.flags ?? {}) as Record<string, unknown>;

  if (clearing) {
    // `flags - 'jobName'` removes only the one key; other admins' concurrent
    // edits to different jobs are preserved. Upsert in case the row doesn't
    // exist yet (no-op delete).
    await query(
      `INSERT INTO system_flags (id, flags, updated_at, updated_by)
       VALUES ('job_schedules', '{}'::jsonb, NOW(), $1)
       ON CONFLICT (id) DO UPDATE
         SET flags = system_flags.flags - $2::text,
             updated_at = NOW(),
             updated_by = $1`,
      [admin.userId, jobName]
    );
  } else {
    // `flags || jsonb_build_object(...)` merges only this one key.
    await query(
      `INSERT INTO system_flags (id, flags, updated_at, updated_by)
       VALUES ('job_schedules', jsonb_build_object($2::text, $3::text), NOW(), $1)
       ON CONFLICT (id) DO UPDATE
         SET flags = system_flags.flags || jsonb_build_object($2::text, $3::text),
             updated_at = NOW(),
             updated_by = $1`,
      [admin.userId, jobName, next as string]
    );
  }

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "system.update_job_schedule",
    targetType: "job_schedule",
    targetId: jobName,
    oldValue: { cronExpr: (before[jobName] as string | undefined) ?? null },
    newValue: { cronExpr: clearing ? null : (next as string) },
    decisionNote: clearing
      ? `Reverted ${jobName} to default cron (${def.cronExpr})`
      : `Set ${jobName} cron to "${next as string}"`,
  });

  // Hot-reload: stop + restart this job's cron task in-process so the new
  // expression takes effect without a server restart.
  const effective = await rescheduleJob(jobName);

  res.json({
    name: jobName,
    description: def.description,
    defaultCronExpr: def.cronExpr,
    effectiveCronExpr: effective ?? def.cronExpr,
    isOverride: !clearing,
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

// In-memory cache for the external-health probe response. Without this,
// every /system page load fan-outs to all downstreams and OpenFoodFacts in
// particular rate-limits us (429). 30s is plenty fresh for a status panel
// and keeps us well under any reasonable rate limit even with multiple
// admins refreshing.
//
// `externalHealthInflight` coalesces concurrent cache-miss callers onto a
// single underlying probe. Without it, N admins refreshing during a miss
// would each fire their own fan-out (the classic cache-stampede problem)
// and partially defeat the rate-limit protection we put this here for.
const EXTERNAL_HEALTH_TTL_MS = 30_000;
type ExternalHealthPayload = { checkedAt: string; targets: unknown[] };
let externalHealthCache: { at: number; payload: ExternalHealthPayload } | null = null;
let externalHealthInflight: Promise<ExternalHealthPayload> | null = null;

/**
 * Liveness check for downstream services we depend on. Pings each with a
 * short HEAD/GET timeout and returns the status grid. Never fails — each
 * downstream is reported individually. Cached for 30s and stampede-safe.
 */
export async function getExternalHealth(_req: Request, res: Response): Promise<void> {
  if (externalHealthCache && Date.now() - externalHealthCache.at < EXTERNAL_HEALTH_TTL_MS) {
    res.json(externalHealthCache.payload);
    return;
  }
  if (externalHealthInflight) {
    // Coalesce: another caller is already probing — just await their result.
    const payload = await externalHealthInflight;
    res.json(payload);
    return;
  }
  externalHealthInflight = probeExternalHealth().finally(() => {
    externalHealthInflight = null;
  });
  try {
    const payload = await externalHealthInflight;
    res.json(payload);
  } catch (err) {
    // probeExternalHealth itself never throws (each target is wrapped),
    // but be defensive so a bug here doesn't take the request down silently.
    res.status(500).json({ error: err instanceof Error ? err.message : "external health failed" });
  }
}

async function probeExternalHealth(): Promise<ExternalHealthPayload> {
  const targets = [
    {
      name: "TheMealDB",
      url: "https://www.themealdb.com/api/json/v1/1/categories.php",
      usedBy: "recipes:nightly",
    },
    {
      name: "OpenFoodFacts",
      url: "https://world.openfoodfacts.org/api/v2/product/737628064502.json",
      usedBy: "products lookup",
    },
    {
      name: "Wikibooks API",
      url: "https://en.wikibooks.org/w/api.php?action=query&meta=siteinfo&format=json",
      usedBy: "wikibooks:weekly",
    },
    ...(process.env["FDC_API_KEY"]
      ? [
          {
            name: "USDA FDC",
            url: `https://api.nal.usda.gov/fdc/v1/foods/search?query=apple&pageSize=1&api_key=${process.env["FDC_API_KEY"]}`,
            usedBy: "products nutrition",
          },
        ]
      : []),
  ];

  const results = await Promise.all(
    targets.map(async (t) => {
      const start = Date.now();
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), 5000);
      try {
        const r = await fetch(t.url, { signal: ctl.signal });
        return {
          name: t.name,
          usedBy: t.usedBy,
          ok: r.ok,
          status: r.status,
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        return {
          name: t.name,
          usedBy: t.usedBy,
          ok: false,
          status: 0,
          latencyMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        };
      } finally {
        clearTimeout(tm);
      }
    })
  );

  const payload = { checkedAt: new Date().toISOString(), targets: results };
  externalHealthCache = { at: Date.now(), payload };
  return payload;
}

export async function sendTestAlert(req: Request, res: Response): Promise<void> {
  const admin = getAdminUser(req);
  const result = await sendAlert({
    severity: "info",
    title: "Test alert from Pick & Cook Ops",
    body: "If you can read this, your alert webhook is wired up correctly.",
    fields: [{ label: "Triggered by", value: `admin:${admin.userId.slice(0, 8)}` }],
  });
  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "system.send_test_alert",
    targetType: "alert_webhook",
    newValue: result,
  });
  res.json(result);
}

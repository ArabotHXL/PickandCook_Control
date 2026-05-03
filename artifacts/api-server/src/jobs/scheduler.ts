import cron, { type ScheduledTask } from "node-cron";
import { JOB_DEFINITIONS } from "./registry.js";
import { runJob } from "./runner.js";
import { ensureJobSchema, ensureOpsSchema } from "./migrations.js";
import { logger } from "../lib/logger.js";
import { query } from "../routes/ops/db.js";
import { validateCronPolicy } from "../lib/cronPolicy.js";

let started = false;
const tasks = new Map<string, ScheduledTask>();

const SCOPE_ID = "job_schedules";

function isWorkerEnabled(): boolean {
  return process.env.WORKER_ENABLED !== "false" && process.env.NODE_ENV !== "test";
}

export async function getCronOverrides(): Promise<Record<string, string>> {
  try {
    const rows = await query<{ flags: Record<string, unknown> }>(
      `SELECT flags FROM system_flags WHERE id = $1 LIMIT 1`,
      [SCOPE_ID]
    );
    const flags = (rows[0]?.flags ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(flags)) {
      if (typeof v === "string" && v.trim() && cron.validate(v.trim())) {
        const policy = validateCronPolicy(v.trim());
        if (!policy.ok) {
          logger.warn({ jobName: k, cronExpr: v.trim(), reason: policy.reason }, "[worker] cron override rejected by policy; using default");
          continue;
        }
        out[k] = v.trim();
      }
    }
    return out;
  } catch (err) {
    logger.warn({ err }, "[worker] failed to load cron overrides; using defaults");
    return {};
  }
}

export async function getEffectiveCron(jobName: string): Promise<string | null> {
  const def = JOB_DEFINITIONS.find((j) => j.name === jobName);
  if (!def) return null;
  const overrides = await getCronOverrides();
  return overrides[jobName] ?? def.cronExpr;
}

function scheduleOne(jobName: string, cronExpr: string): void {
  const def = JOB_DEFINITIONS.find((j) => j.name === jobName);
  if (!def) return;
  if (!cron.validate(cronExpr)) {
    logger.error({ jobName, cronExpr }, "[worker] refusing to schedule invalid cron");
    return;
  }
  const policy = validateCronPolicy(cronExpr);
  if (!policy.ok) {
    logger.error({ jobName, cronExpr, reason: policy.reason }, "[worker] refusing to schedule cron expression that violates policy");
    return;
  }
  const existing = tasks.get(jobName);
  if (existing) {
    existing.stop();
    tasks.delete(jobName);
  }
  const t = cron.schedule(
    cronExpr,
    () => {
      runJob(def.name, def.handler, "cron").catch((err) => {
        logger.error({ err, name: def.name }, "[worker] runJob threw");
      });
    },
    { timezone: "UTC" }
  );
  tasks.set(jobName, t);
}

/**
 * Re-read the effective cron for `jobName` and (if the worker is active)
 * stop+restart its scheduled task to pick up the new expression. Returns the
 * effective cron expression that is now in force, or null if the job is
 * unknown.
 */
export async function rescheduleJob(jobName: string): Promise<string | null> {
  const eff = await getEffectiveCron(jobName);
  if (!eff) return null;
  if (!isWorkerEnabled()) {
    return eff;
  }
  scheduleOne(jobName, eff);
  logger.info({ jobName, cronExpr: eff }, "[worker] rescheduled job");
  return eff;
}

export function startScheduler(): void {
  if (started) return;
  if (process.env.WORKER_ENABLED === "false") {
    logger.info("[worker] scheduler disabled via WORKER_ENABLED=false");
    return;
  }
  if (process.env.NODE_ENV === "test") {
    logger.info("[worker] scheduler disabled in test env");
    return;
  }

  // Bootstrap the partial unique index that backs `startJob`'s atomic lock.
  // Don't await — we don't want to block server startup on this. If it fails
  // the worst case is `startJob` falls back to its non-atomic SELECT path.
  ensureJobSchema().catch((err) => {
    logger.error({ err }, "[worker] ensureJobSchema failed (lock race possible)");
  });
  ensureOpsSchema().catch((err) => {
    logger.error({ err }, "[worker] ensureOpsSchema failed (staging/totp/alerts may be broken)");
  });

  // Load DB overrides, then schedule each job with the effective cron.
  // Fire-and-forget; failures fall back to registry defaults below.
  (async () => {
    const overrides = await getCronOverrides();
    for (const def of JOB_DEFINITIONS) {
      const eff = overrides[def.name] ?? def.cronExpr;
      scheduleOne(def.name, eff);
    }
    logger.info(
      {
        count: tasks.size,
        jobs: Array.from(tasks.keys()),
        overrideCount: Object.keys(overrides).length,
      },
      "[worker] scheduler started"
    );
  })().catch((err) => {
    logger.error({ err }, "[worker] scheduler bootstrap failed; falling back to defaults");
    // Don't clobber jobs that may have been scheduled in the meantime by a
    // concurrent rescheduleJob() call (admin PATCH arriving during bootstrap).
    for (const def of JOB_DEFINITIONS) {
      if (!tasks.has(def.name)) {
        scheduleOne(def.name, def.cronExpr);
      }
    }
  });

  started = true;
}

export async function triggerJobAsync(jobName: string, triggeredBy: string): Promise<void> {
  const def = JOB_DEFINITIONS.find((j) => j.name === jobName);
  if (!def) throw new Error(`Unknown job: ${jobName}`);
  await runJob(def.name, def.handler, triggeredBy);
}

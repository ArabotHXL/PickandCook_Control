import cron from "node-cron";
import { JOB_DEFINITIONS } from "./registry.js";
import { runJob } from "./runner.js";
import { ensureJobSchema } from "./migrations.js";
import { logger } from "../lib/logger.js";

let started = false;

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

  for (const def of JOB_DEFINITIONS) {
    if (!cron.validate(def.cronExpr)) {
      logger.error({ name: def.name, cronExpr: def.cronExpr }, "[worker] invalid cron");
      continue;
    }
    cron.schedule(
      def.cronExpr,
      () => {
        runJob(def.name, def.handler, "cron").catch((err) => {
          logger.error({ err, name: def.name }, "[worker] runJob threw");
        });
      },
      { timezone: "UTC" }
    );
  }
  started = true;
  logger.info(
    { count: JOB_DEFINITIONS.length, jobs: JOB_DEFINITIONS.map((j) => j.name) },
    "[worker] scheduler started"
  );
}

export async function triggerJobAsync(jobName: string, triggeredBy: string): Promise<void> {
  const def = JOB_DEFINITIONS.find((j) => j.name === jobName);
  if (!def) throw new Error(`Unknown job: ${jobName}`);
  await runJob(def.name, def.handler, triggeredBy);
}

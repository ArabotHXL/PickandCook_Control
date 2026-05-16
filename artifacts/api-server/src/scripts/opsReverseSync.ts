/**
 * CLI entry for the reverse-sync job. Operator-driven only — never
 * scheduled.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run ops-sync -- --dry-run
 *   pnpm --filter @workspace/api-server run ops-sync -- --since=2026-05-01 --table=recipes
 *   pnpm --filter @workspace/api-server run ops-sync -- --once
 *   pnpm --filter @workspace/api-server run ops-sync -- --omit-control-updated-at --table=products --dry-run
 */
import { logger } from "../lib/logger.js";
import { runReverseSync, type Endpoint, ENDPOINT_ORDER } from "../jobs/handlers/opsReverseSync.js";
import { ensureReverseSyncSchema, ensureDeadLetterSchema } from "../jobs/migrations.js";
import { opsPool } from "../routes/ops/db.js";

interface CliArgs {
  dryRun: boolean;
  since?: string;
  table?: Endpoint;
  omitControlUpdatedAt: boolean;
  once: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { dryRun: false, omitControlUpdatedAt: false, once: false };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--once") out.once = true;
    else if (a === "--omit-control-updated-at") out.omitControlUpdatedAt = true;
    else if (a.startsWith("--since=")) out.since = a.slice("--since=".length);
    else if (a.startsWith("--table=")) {
      const t = a.slice("--table=".length);
      const valid: Endpoint[] = ["recipes", "products", "moderation-decisions"];
      // Friendly aliases
      const alias: Record<string, Endpoint> = {
        moderation: "moderation-decisions",
        decisions: "moderation-decisions",
      };
      const resolved = (alias[t] ?? (valid.includes(t as Endpoint) ? (t as Endpoint) : undefined));
      if (!resolved) {
        console.error(`Unknown --table=${t}. Valid: ${valid.join(", ")}`);
        process.exit(2);
      }
      out.table = resolved;
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: ops-sync [--dry-run] [--once] [--since=ISO] [--table=recipes|products|moderation-decisions] [--omit-control-updated-at]\n\n  --once  accepted for spec parity; CLI always runs exactly one pass.`);
      process.exit(0);
    } else {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env["OPS_REVERSE_SYNC_TOKEN"]) {
    console.error("OPS_REVERSE_SYNC_TOKEN is not set. Aborting.");
    process.exit(1);
  }
  if (!process.env["PROD_API_BASE"]) {
    console.error("PROD_API_BASE is not set. Aborting.");
    process.exit(1);
  }

  const ctx = {
    jobName: "opsReverseSync:cli",
    jobRunId: `cli-${Date.now()}`,
    triggeredBy: "cli",
    log: logger.child({ jobName: "opsReverseSync:cli" }),
  };

  const endpoints = args.table ? [args.table] : ENDPOINT_ORDER;
  try {
    // The scheduler normally calls this on api-server boot, but the CLI
    // can be invoked from a fresh DB / one-off operator host where the
    // scheduler has never run, so we ensure tables/columns/triggers exist.
    await ensureReverseSyncSchema();
    // Dead-letter table must exist before pushEndpoint runs — otherwise
    // INSERTs fail and we'd pin the cursor with `dead_letter_persist_failed`
    // errors on every CLI invocation. Idempotent CREATE IF NOT EXISTS.
    await ensureDeadLetterSchema();
    const summary = await runReverseSync(ctx, {
      dryRun: args.dryRun,
      since: args.since,
      endpoints,
      omitControlUpdatedAt: args.omitControlUpdatedAt,
    });
    console.log(JSON.stringify(summary, null, 2));
    // `--once` is the default for the CLI (we always run once and exit).
    // The flag is accepted for documentation symmetry with the spec.
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Reverse sync failed: ${msg}`);
    process.exit(1);
  } finally {
    await opsPool.end().catch(() => undefined);
  }
}

main();

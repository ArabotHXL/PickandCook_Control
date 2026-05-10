import pg from "pg";
import { opsPool } from "../../routes/ops/db.js";
import type { JobContext, JobSummary } from "../runner.js";

/**
 * NEON daily sync.
 *
 * Pulls data from the upstream NEON Postgres (`NEON_DATABASE_URL`) into the
 * local app DB (the same one `opsPool` is bound to). Additive only — never
 * deletes local rows. Per-table conflict policy lives in `TABLE_POLICY`
 * below so it stays auditable in one place.
 *
 * Modes:
 *   - "upsert"  : ON CONFLICT (pk) DO UPDATE — NEON wins for catalog/reference data.
 *   - "skip"    : ON CONFLICT (pk) DO NOTHING — preserve local writes for user data.
 *
 * Tables matching `BACKUP_TABLE_RE` are always skipped. Any NEON table not
 * listed in TABLE_POLICY defaults to "skip" and is flagged in the summary
 * so the next NEON schema change is visible.
 *
 * If `NEON_DATABASE_URL` is unset, the job is a no-op (NOT a failure).
 */

const { Client } = pg;

type SyncMode = "upsert" | "skip";

const TABLE_POLICY: Record<string, SyncMode> = {
  // Reference / catalog tables — NEON is the upstream source of truth.
  products: "upsert",
  barcode_meta: "upsert",
  product_barcodes: "upsert",
  recipes: "upsert",
  recipe_provider_cache: "upsert",
  produce_shelf_life: "upsert",
  produce_shelf_life_products: "upsert",
  notification_templates: "upsert",
  app_state: "upsert",
  recipe_sync_state: "upsert",
  // User / transactional tables — preserve local writes.
  users: "skip",
  profiles: "skip",
  user_segments: "skip",
  receipt_headers: "skip",
  receipt_items: "skip",
  pantry_item_events: "skip",
};

const BACKUP_TABLE_RE = /^products_dept_backup/;

const BATCH_SIZE = 500;

interface PerTableResult {
  table: string;
  mode: SyncMode | "skipped";
  srcCount: number;
  /** New rows inserted (PK did not exist on destination). */
  copied: number;
  /** Existing rows updated by an upsert because content actually changed.
   *  Always 0 for skip-mode tables. Idempotent re-runs over unchanged data
   *  produce 0 here thanks to `WHERE target IS DISTINCT FROM EXCLUDED`. */
  updated: number;
  /** Rows whose PK already existed and either DO NOTHING fired or the
   *  IS DISTINCT FROM filter elided the update. */
  skipped: number;
  error?: string;
  note?: string;
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
}

interface NeonDailySummary extends JobSummary {
  skipped?: string;
  tablesProcessed: number;
  tablesSkipped: number;
  /** New rows inserted across all tables (idempotent — 0 on a no-op rerun). */
  totalCopied: number;
  /** Existing rows that were actually changed by an upsert (excludes no-op
   *  updates thanks to `IS DISTINCT FROM`). 0 for skip-mode tables. */
  totalUpdated: number;
  unknownTables: string[];
  perTable: PerTableResult[];
  durationMs: number;
}

/** Quote a Postgres identifier (table or column name) safely. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Decide what to do with a NEON table. */
export function classifyTable(table: string): SyncMode | "skipped" {
  if (BACKUP_TABLE_RE.test(table)) return "skipped";
  return TABLE_POLICY[table] ?? "skip";
}

/** Build the conflict clause for a multi-row INSERT.
 *  - skip mode (or PK-only table) → DO NOTHING (preserves local writes).
 *  - upsert mode → DO UPDATE SET ... WHERE <table> IS DISTINCT FROM EXCLUDED
 *    so unchanged rows produce zero affected rows on a rerun. This is what
 *    makes `neon:daily` truly idempotent for upsert tables.
 */
export function buildConflictClause(
  table: string,
  pkCols: string[],
  nonPkCols: string[],
  mode: SyncMode,
): string {
  const pks = pkCols.map(quoteIdent).join(", ");
  if (mode === "skip" || nonPkCols.length === 0) {
    return `ON CONFLICT (${pks}) DO NOTHING`;
  }
  const sets = nonPkCols
    .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
    .join(", ");
  // Compare *only* the synced non-PK columns (not table.*) so destination-
  // only columns don't cause false-positive updates on a rerun. This keeps
  // idempotency tight even when source/destination schemas diverge.
  const t = quoteIdent(table);
  const lhs = nonPkCols.map((c) => `${t}.${quoteIdent(c)}`).join(", ");
  const rhs = nonPkCols.map((c) => `EXCLUDED.${quoteIdent(c)}`).join(", ");
  return `ON CONFLICT (${pks}) DO UPDATE SET ${sets} WHERE (${lhs}) IS DISTINCT FROM (${rhs})`;
}

/** Bind value for a single column — JSON/JSONB must be stringified. */
export function bindValue(value: unknown, dataType: string): unknown {
  if (value === null || value === undefined) return null;
  if (dataType === "json" || dataType === "jsonb") {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  return value;
}

async function listSourceTables(src: Queryable): Promise<string[]> {
  const r = await src.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  return r.rows.map((row) => row.table_name);
}

type Queryable = Pick<pg.Client, "query">;

async function getColumns(client: Queryable, table: string): Promise<ColumnInfo[]> {
  const r = await client.query<ColumnInfo>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return r.rows;
}

async function getPrimaryKey(client: Queryable, table: string): Promise<string[]> {
  const r = await client.query<{ column_name: string }>(
    `SELECT a.attname AS column_name
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = ('public.' || quote_ident($1))::regclass
       AND i.indisprimary
     ORDER BY array_position(i.indkey, a.attnum)`,
    [table],
  );
  return r.rows.map((row) => row.column_name);
}

async function getRowCount(client: Queryable, table: string): Promise<number> {
  const r = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ${quoteIdent(table)}`,
  );
  return parseInt(r.rows[0]?.n ?? "0", 10);
}

export async function syncTable(
  src: Queryable,
  dst: Queryable,
  table: string,
  mode: SyncMode,
  log: JobContext["log"],
): Promise<PerTableResult> {
  const result: PerTableResult = { table, mode, srcCount: 0, copied: 0, updated: 0, skipped: 0 };

  // Verify the table also exists locally; if not, skip with a note.
  const dstCols = await getColumns(dst, table);
  if (dstCols.length === 0) {
    result.note = "table missing on destination";
    return result;
  }
  const srcCols = await getColumns(src, table);
  if (srcCols.length === 0) {
    result.note = "table missing on source";
    return result;
  }

  const dstColSet = new Set(dstCols.map((c) => c.column_name));
  const commonCols = srcCols.filter((c) => dstColSet.has(c.column_name));
  if (commonCols.length === 0) {
    result.note = "no overlapping columns";
    return result;
  }

  const pk = await getPrimaryKey(dst, table);
  if (pk.length === 0) {
    result.note = "no primary key on destination — skipping";
    return result;
  }
  const pkSet = new Set(pk);
  // Ensure every PK column is in commonCols (otherwise we can't do ON CONFLICT).
  for (const p of pk) {
    if (!dstColSet.has(p) || !commonCols.some((c) => c.column_name === p)) {
      result.note = `PK column "${p}" missing on source — skipping`;
      return result;
    }
  }

  result.srcCount = await getRowCount(src, table);
  if (result.srcCount === 0) {
    return result;
  }

  const colNames = commonCols.map((c) => c.column_name);
  const colDataTypes = new Map(commonCols.map((c) => [c.column_name, c.data_type]));
  const nonPkCols = colNames.filter((c) => !pkSet.has(c));
  const conflictClause = buildConflictClause(table, pk, nonPkCols, mode);
  const colList = colNames.map(quoteIdent).join(", ");
  const orderBy = pk.map(quoteIdent).join(", ");
  // RETURNING (xmax = 0) lets us tell brand-new inserts (xmax = 0) from
  // upsert-driven updates (xmax != 0). For DO NOTHING this is still correct
  // — only inserted rows are returned, all with xmax = 0.
  const returning = `RETURNING (xmax = 0) AS inserted`;

  // Stream in batches with a deterministic ORDER BY pk so we can paginate.
  // We can't use cursors easily across pg.Client without WITH HOLD; offset
  // pagination on a stable PK ordering is fine for our table sizes (<200k).
  let offset = 0;
  while (true) {
    const page = await src.query<Record<string, unknown>>(
      `SELECT ${colList} FROM ${quoteIdent(table)}
       ORDER BY ${orderBy} LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset],
    );
    if (page.rows.length === 0) break;

    // Build a multi-row INSERT: VALUES ($1,$2,...),($n+1,...)
    const placeholders: string[] = [];
    const params: unknown[] = [];
    let pi = 1;
    for (const row of page.rows) {
      const tuple: string[] = [];
      for (const col of colNames) {
        tuple.push(`$${pi}`);
        params.push(bindValue(row[col], colDataTypes.get(col) ?? "text"));
        pi++;
      }
      placeholders.push(`(${tuple.join(",")})`);
    }

    const sql = `INSERT INTO ${quoteIdent(table)} (${colList})
                 VALUES ${placeholders.join(",")}
                 ${conflictClause}
                 ${returning}`;

    try {
      const res = await dst.query<{ inserted: boolean }>(sql, params);
      let inserts = 0;
      let updates = 0;
      for (const row of res.rows) {
        if (row.inserted) inserts++;
        else updates++;
      }
      result.copied += inserts;
      result.updated += updates;
      result.skipped += page.rows.length - inserts - updates;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ table, offset, err: msg }, "[neon:daily] batch insert failed");
      result.error = msg.slice(0, 500);
      return result;
    }

    offset += page.rows.length;
    if (page.rows.length < BATCH_SIZE) break;
  }

  return result;
}

async function resetSequences(dst: Queryable, log: JobContext["log"]): Promise<void> {
  // For every owned sequence in the public schema, reset its value to MAX(col)
  // so subsequent local INSERTs don't collide on serial PKs.
  const r = await dst.query<{
    sequence_name: string;
    table_name: string;
    column_name: string;
  }>(
    `SELECT
       s.relname AS sequence_name,
       t.relname AS table_name,
       a.attname AS column_name
     FROM pg_class s
     JOIN pg_depend d ON d.objid = s.oid AND d.deptype IN ('a','i')
     JOIN pg_class t ON t.oid = d.refobjid
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
     JOIN pg_namespace n ON n.oid = s.relnamespace
     WHERE s.relkind = 'S' AND n.nspname = 'public'`,
  );
  for (const row of r.rows) {
    try {
      await dst.query(
        `SELECT setval($1::regclass,
                       GREATEST(COALESCE((SELECT MAX(${quoteIdent(row.column_name)})
                                          FROM ${quoteIdent(row.table_name)}), 0), 1))`,
        [`public.${row.sequence_name}`],
      );
    } catch (err) {
      log.warn(
        { sequence: row.sequence_name, err: err instanceof Error ? err.message : String(err) },
        "[neon:daily] setval failed",
      );
    }
  }
}

export async function neonDaily(ctx: JobContext): Promise<JobSummary> {
  const startedAt = Date.now();
  const url = process.env["NEON_DATABASE_URL"];
  if (!url) {
    ctx.log.info("[neon:daily] NEON_DATABASE_URL not set — skipping");
    const summary: NeonDailySummary = {
      skipped: "NEON_DATABASE_URL not set",
      tablesProcessed: 0,
      tablesSkipped: 0,
      totalCopied: 0,
      totalUpdated: 0,
      unknownTables: [],
      perTable: [],
      durationMs: Date.now() - startedAt,
    };
    return summary;
  }

  const src = new Client({ connectionString: url });
  const dst = await opsPool.connect();
  const perTable: PerTableResult[] = [];
  const unknownTables: string[] = [];
  let totalCopied = 0;
  let totalUpdated = 0;
  let tablesProcessed = 0;
  let tablesSkipped = 0;

  try {
    await src.connect();
    // Pin the source to a REPEATABLE READ snapshot so all per-table SELECTs in
    // this run see a consistent view. Without this, OFFSET pagination over
    // tables receiving concurrent writes could drift (rows skipped between
    // pages). Held open until the finally block.
    await src.query(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    // Disable FK triggers on the destination session so we can insert in any
    // order. Scoped to this connection only (does NOT touch other workers).
    await dst.query(`SET session_replication_role = 'replica'`);

    const tables = await listSourceTables(src);
    ctx.log.info({ tableCount: tables.length }, "[neon:daily] starting sync");

    for (const table of tables) {
      const cls = classifyTable(table);
      if (cls === "skipped") {
        perTable.push({ table, mode: "skipped", srcCount: 0, copied: 0, updated: 0, skipped: 0, note: "backup table" });
        tablesSkipped++;
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(TABLE_POLICY, table)) {
        unknownTables.push(table);
      }
      try {
        const r = await syncTable(src, dst, table, cls, ctx.log);
        perTable.push(r);
        if (r.error || r.note) tablesSkipped++;
        else tablesProcessed++;
        totalCopied += r.copied;
        totalUpdated += r.updated;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.log.warn({ table, err: msg }, "[neon:daily] table failed");
        perTable.push({ table, mode: cls, srcCount: 0, copied: 0, updated: 0, skipped: 0, error: msg.slice(0, 500) });
        tablesSkipped++;
      }
    }

    await resetSequences(dst, ctx.log);

    if (tablesProcessed === 0 && tablesSkipped === 0) {
      throw new Error("No tables found in NEON public schema");
    }
  } finally {
    try {
      await dst.query(`RESET session_replication_role`);
    } catch {
      // ignore — connection may be in a bad state
    }
    dst.release();
    try {
      await src.query(`COMMIT`);
    } catch {
      // ignore — txn may already be aborted or never started
    }
    try {
      await src.end();
    } catch {
      // ignore
    }
  }

  const summary: NeonDailySummary = {
    tablesProcessed,
    tablesSkipped,
    totalCopied,
    totalUpdated,
    unknownTables,
    perTable,
    durationMs: Date.now() - startedAt,
  };
  ctx.log.info(
    { tablesProcessed, tablesSkipped, totalCopied, totalUpdated, unknownTables: unknownTables.length },
    "[neon:daily] done",
  );
  return summary;
}

import { query, queryOne } from "../../routes/ops/db.js";
import type { JobContext, JobSummary } from "../runner.js";

/**
 * opsReverseSync — push operator-approved Control content to deployed prod.
 *
 * Three target endpoints on prod, all token-gated with `OPS_REVERSE_SYNC_TOKEN`:
 *   POST {PROD_API_BASE}/api/admin/ops-sync/recipes
 *   POST {PROD_API_BASE}/api/admin/ops-sync/moderation-decisions
 *   POST {PROD_API_BASE}/api/admin/ops-sync/products
 *
 * Cursor source: `ops_audit_log`. Why not `updated_at`?
 *  - We need to distinguish operator edits from automatic ones (e.g. the
 *    nightly OFF scraper bumps barcode_meta.updated_at — that's NOT
 *    something we should push back to prod).
 *  - The audit log records every admin write with action_type, target_type,
 *    target_id, decision_note, admin_user_id, created_at — exactly the
 *    routing dimensions we need.
 *
 * `recipes.updated_at` and `products.updated_at` (added by
 * `ensureReverseSyncSchema` with a BEFORE UPDATE trigger) are sent as
 * `controlUpdatedAt` so prod can apply its CAS predicate
 * (`WHERE updated_at <= controlUpdatedAt`).
 *
 * Cursor advancement (spec point 5): only when summary.errors === 0 for
 * that endpoint. On any per-row error the cursor stays put and the next
 * run replays — safe because every prod endpoint is fully idempotent.
 *
 * Push order (spec point 3): moderation-decisions → recipes → products.
 *
 * If `OPS_REVERSE_SYNC_TOKEN` is unset, the handler fails fast (returns
 * a failed JobSummary). We deliberately don't crash the api-server
 * process — that would kill the API + dashboard for unrelated reasons.
 * The CLI (operator-driven) does process.exit(1) on missing token.
 */

const BACKFILL_DAYS = 7;
const BATCH_SIZE = 100;
const RETRY_DELAYS_MS = [500, 1500, 4500];
const HTTP_TIMEOUT_MS = 30_000;
const SAMPLE_RESULTS_CAP = 20;

export type Endpoint = "recipes" | "moderation-decisions" | "products";

export const ENDPOINT_ORDER: readonly Endpoint[] = [
  "moderation-decisions",
  "recipes",
  "products",
];

/**
 * Audit action_type → endpoint routing. Single source of truth so future
 * action types are easy to wire (or surfaced as `unknownActionTypes`).
 *
 * Verified against `SELECT DISTINCT action_type, target_type FROM
 * ops_audit_log` and the `writeAuditLog(...)` call sites in
 * `routes/ops/{moderation,products,recipeDetail,recipesStaging}.ts`.
 */
export const AUDIT_TO_ENDPOINT: Record<string, Endpoint> = {
  // recipes endpoint — direct catalog edits
  update_recipe: "recipes",
  restore_recipe_revision: "recipes",
  // recipes endpoint — promotion of staging row produces a new catalog recipe
  staging_recipe_promote: "recipes",
  // NOTE: `manual_recipe_created` is intentionally NOT routed here. It fires
  // with target_type='imported_recipe_staging' (a staging-only manual create);
  // the row never enters the catalog `recipes` table directly. If/when an
  // operator promotes that staging row, `staging_recipe_promote` carries it
  // across via imported_recipes_staging.promoted_recipe_id. See KNOWN_NOOP_ACTIONS.
  // moderation-decisions endpoint — abuse_report decisions
  moderation_approved: "moderation-decisions",
  moderation_bulk_approved: "moderation-decisions",
  // products endpoint — direct product edits (no surface today; future-proofing)
  update_product: "products",
};

export function classifyAction(actionType: string): Endpoint | "unknown" {
  return AUDIT_TO_ENDPOINT[actionType] ?? "unknown";
}

// ── Result shapes ──────────────────────────────────────────────────────────

export interface PerRowResult {
  id: string;
  action: "inserted" | "updated" | "skipped" | "error";
  reason?: string;
}

export interface EndpointSummary {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface EndpointRunResult {
  endpoint: Endpoint;
  status: "success" | "partial" | "failed" | "dry_run" | "no_op";
  summary: EndpointSummary;
  results: PerRowResult[];
  cursorAdvancedTo?: string;
  errorMessage?: string;
}

interface ReverseSyncSummary extends JobSummary {
  skipped?: string;
  dryRun: boolean;
  perEndpoint: Array<Omit<EndpointRunResult, "results"> & { sampleResults: PerRowResult[] }>;
  unknownActionTypes: string[];
  durationMs: number;
}

// ── HTTP helper with retry/backoff ─────────────────────────────────────────

interface PostResult {
  ok: true;
  body: PushResponse;
}

interface PostFatal {
  ok: false;
  fatal: true;
  status: number;
  message: string;
}

interface PostSkip {
  ok: false;
  fatal: false;
  status: number;
  message: string;
}

interface PushResponse {
  ok: boolean;
  dryRun: boolean;
  summary: EndpointSummary;
  results: PerRowResult[];
}

export type PostOutcome = PostResult | PostFatal | PostSkip;

/** sleep with cancel-on-abort. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      });
    }
  });
}

export async function postBatch(opts: {
  url: string;
  token: string;
  body: unknown;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: readonly number[];
  timeoutMs?: number;
}): Promise<PostOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const delays = opts.retryDelaysMs ?? RETRY_DELAYS_MS;
  const timeoutMs = opts.timeoutMs ?? HTTP_TIMEOUT_MS;

  // 1 initial attempt + delays.length retries on retryable errors. 4xx
  // (except 401/403/503) returns a non-fatal skip. 401/403/503 returns a
  // fatal stop. With the default RETRY_DELAYS_MS = [500, 1500, 4500] this
  // makes 4 total attempts with the full 500/1500/4500 backoff sequence.
  let lastErr: { status: number; message: string } = { status: 0, message: "no attempt" };
  const totalAttempts = delays.length + 1;
  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(opts.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.token}`,
        },
        body: JSON.stringify(opts.body),
        signal: ctl.signal,
      });
      const text = await res.text();
      if (res.ok) {
        try {
          const parsed = JSON.parse(text) as PushResponse;
          return { ok: true, body: parsed };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { ok: false, fatal: false, status: res.status, message: `parse_error: ${msg}` };
        }
      }
      // Token / auth / availability problems → fatal stop for the whole run.
      if (res.status === 401 || res.status === 403 || res.status === 503) {
        return {
          ok: false,
          fatal: true,
          status: res.status,
          message: text.slice(0, 500) || `HTTP ${res.status}`,
        };
      }
      // 5xx → retry with backoff.
      if (res.status >= 500) {
        lastErr = { status: res.status, message: text.slice(0, 500) || `HTTP ${res.status}` };
      } else {
        // Other 4xx → log and skip this batch (defense in depth — we already
        // cap batch sizes at 100 so 400 batch_too_large shouldn't happen).
        return { ok: false, fatal: false, status: res.status, message: text.slice(0, 500) || `HTTP ${res.status}` };
      }
    } catch (err) {
      // Network error / abort → retry with backoff.
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = { status: 0, message: msg };
    } finally {
      clearTimeout(timer);
    }

    // Don't sleep after the last attempt.
    if (attempt < delays.length) {
      await sleep(delays[attempt]!);
    }
  }
  return { ok: false, fatal: false, status: lastErr.status, message: `retries_exhausted: ${lastErr.message}` };
}

// ── Cursor / audit helpers ─────────────────────────────────────────────────

/** Composite keyset cursor: (created_at, audit_id). The second component
 *  disambiguates rows sharing an identical `created_at` (e.g. multiple audit
 *  inserts in one postgres transaction, where `now()` is fixed for the whole
 *  txn). On a fresh bootstrap `id` is null and the loaders treat it as the
 *  empty string so any real audit id is `>` it. */
export interface CursorPos {
  ts: Date;
  id: string | null;
}

/** Read or bootstrap the cursor for an endpoint. */
export async function getCursor(endpoint: Endpoint, opts?: { sinceOverride?: string }): Promise<CursorPos> {
  if (opts?.sinceOverride) {
    return { ts: new Date(opts.sinceOverride), id: null };
  }
  const row = await queryOne<{ last_pushed_at: string; last_pushed_audit_id: string | null }>(
    `SELECT last_pushed_at::text, last_pushed_audit_id FROM ops_sync_cursor WHERE endpoint = $1`,
    [endpoint]
  );
  if (row) return { ts: new Date(row.last_pushed_at), id: row.last_pushed_audit_id };
  // First run: walk back BACKFILL_DAYS so we sweep up the recent history.
  const backfill = new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);
  return { ts: backfill, id: null };
}

async function setCursor(endpoint: Endpoint, ts: string, id: string | null): Promise<void> {
  await query(
    `INSERT INTO ops_sync_cursor (endpoint, last_pushed_at, last_pushed_audit_id, updated_at)
     VALUES ($1, $2::timestamp, $3, NOW())
     ON CONFLICT (endpoint) DO UPDATE
       SET last_pushed_at = EXCLUDED.last_pushed_at,
           last_pushed_audit_id = EXCLUDED.last_pushed_audit_id,
           updated_at = NOW()`,
    [endpoint, ts, id]
  );
}

async function recordRun(args: {
  endpoint: Endpoint;
  startedAt: Date;
  finishedAt: Date;
  status: EndpointRunResult["status"];
  summary: EndpointSummary;
  sampleResults: PerRowResult[];
  errorMessage?: string;
}): Promise<void> {
  await query(
    `INSERT INTO ops_sync_runs
       (started_at, finished_at, endpoint, status, summary, sample_results, error_message)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
    [
      args.startedAt.toISOString(),
      args.finishedAt.toISOString(),
      args.endpoint,
      args.status,
      JSON.stringify(args.summary),
      JSON.stringify(args.sampleResults),
      args.errorMessage ?? null,
    ]
  );
}

// ── Row → payload mappers ──────────────────────────────────────────────────

export interface RecipeRow {
  id: string;
  title: string;
  cuisine_tags: unknown;
  moods: unknown;
  constraints: unknown;
  estimated_time_min: number | null;
  default_servings: number | null;
  difficulty: string | null;
  nutrition_summary: unknown;
  instructions_summary: string | null;
  quality_tier: string | null;
  image_url: string | null;
  updated_at: string | null;
}

export interface RecipePayload {
  id: string;
  title: string;
  cuisineTags?: unknown;
  moodTags?: unknown;
  dietaryTags?: unknown;
  estimatedTimeMin?: number;
  servings?: number;
  difficulty?: string;
  nutritionSummary?: unknown;
  instructionsSummary?: string;
  qualityTier?: string;
  imageUrl?: string;
  controlUpdatedAt?: string;
}

/** Map a `recipes` row to the payload shape prod's `/recipes` endpoint accepts.
 *  Only fields we have a value for are included — prod treats omitted fields
 *  as "don't change" (per spec). camelCase only. */
export function mapRecipeRow(row: RecipeRow): RecipePayload {
  const out: RecipePayload = { id: row.id, title: row.title };
  if (Array.isArray(row.cuisine_tags) && row.cuisine_tags.length) out.cuisineTags = row.cuisine_tags;
  if (Array.isArray(row.moods) && row.moods.length) out.moodTags = row.moods;
  if (Array.isArray(row.constraints) && row.constraints.length) out.dietaryTags = row.constraints;
  if (typeof row.estimated_time_min === "number") out.estimatedTimeMin = row.estimated_time_min;
  if (typeof row.default_servings === "number") out.servings = row.default_servings;
  if (row.difficulty) out.difficulty = row.difficulty;
  if (row.nutrition_summary && typeof row.nutrition_summary === "object") out.nutritionSummary = row.nutrition_summary;
  if (row.instructions_summary) out.instructionsSummary = row.instructions_summary;
  if (row.quality_tier && row.quality_tier !== "unrated") out.qualityTier = row.quality_tier;
  if (row.image_url) out.imageUrl = row.image_url;
  if (row.updated_at) out.controlUpdatedAt = new Date(row.updated_at).toISOString();
  return out;
}

export interface ProductRow {
  id: string;
  name: string;
  synonyms: unknown;
  department: string;
  default_unit: string;
  culture_tags: unknown;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  sodium: number | null;
  fiber: number | null;
  sugar: number | null;
  brand: string | null;
  allergens: unknown;
  ingredients_text: string | null;
  serving_size: string | null;
  branded_food_category: string | null;
  updated_at: string | null;
}

export interface ProductPayload {
  id: string;
  name: string;
  synonyms?: unknown;
  department?: string;
  defaultUnit?: string;
  cultureTags?: unknown;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  sodium?: number;
  fiber?: number;
  sugar?: number;
  brand?: string;
  allergens?: unknown;
  ingredientsText?: string;
  servingSize?: string;
  brandedFoodCategory?: string;
  controlUpdatedAt?: string;
}

export function mapProductRow(row: ProductRow, opts?: { omitControlUpdatedAt?: boolean }): ProductPayload {
  const out: ProductPayload = { id: row.id, name: row.name };
  if (Array.isArray(row.synonyms) && row.synonyms.length) out.synonyms = row.synonyms;
  if (row.department) out.department = row.department;
  if (row.default_unit) out.defaultUnit = row.default_unit;
  if (Array.isArray(row.culture_tags) && row.culture_tags.length) out.cultureTags = row.culture_tags;
  if (typeof row.kcal === "number") out.kcal = row.kcal;
  if (typeof row.protein === "number") out.protein = row.protein;
  if (typeof row.carbs === "number") out.carbs = row.carbs;
  if (typeof row.fat === "number") out.fat = row.fat;
  if (typeof row.sodium === "number") out.sodium = row.sodium;
  if (typeof row.fiber === "number") out.fiber = row.fiber;
  if (typeof row.sugar === "number") out.sugar = row.sugar;
  if (row.brand) out.brand = row.brand;
  if (Array.isArray(row.allergens) && row.allergens.length) out.allergens = row.allergens;
  if (row.ingredients_text) out.ingredientsText = row.ingredients_text;
  if (row.serving_size) out.servingSize = row.serving_size;
  if (row.branded_food_category) out.brandedFoodCategory = row.branded_food_category;
  if (row.updated_at && !opts?.omitControlUpdatedAt) {
    out.controlUpdatedAt = new Date(row.updated_at).toISOString();
  }
  return out;
}

export interface DecisionRow {
  /** audit log id (used as a stable per-row id in results). */
  audit_id: string;
  audit_created_at: string;
  action_type: string;
  decision_note: string | null;
  admin_user_id: string;
  content_type: string;
  content_id: string;
}

export interface DecisionPayload {
  contentType: "recipe" | "user_recipe" | "variation_comment";
  contentId: string;
  action: "remove" | "restore";
  reason?: string;
  moderatorId?: string;
}

const ALLOWED_CONTENT_TYPES = new Set(["recipe", "user_recipe", "variation_comment"]);

/** Map an audit-log row + abuse_report row to a Decision payload.
 *  Returns null when the content_type isn't on prod's enum (we never push
 *  decisions for content prod can't model). */
export function mapDecisionRow(row: DecisionRow): DecisionPayload | null {
  if (!ALLOWED_CONTENT_TYPES.has(row.content_type)) return null;
  // Today only `moderation_(bulk_)approved` gets routed to this endpoint —
  // both translate to `remove`. A future "restore from moderation"
  // surface would emit a new action_type that we'd map to `restore` here.
  const action: "remove" | "restore" = "remove";
  const out: DecisionPayload = {
    contentType: row.content_type as DecisionPayload["contentType"],
    contentId: row.content_id,
    action,
  };
  if (row.decision_note) out.reason = row.decision_note;
  if (row.admin_user_id) out.moderatorId = row.admin_user_id;
  return out;
}

// ── Cursor query loaders ───────────────────────────────────────────────────

export interface LoadedBatch<T> {
  items: T[];
  /** Composite keyset position of the last audit row consumed in this batch.
   *  Cursor advances to this exact (ts, id) pair so the next batch's predicate
   *  `(created_at, id) > (ts, id)` skips the consumed row but picks up any
   *  unconsumed siblings sharing the same `created_at`. */
  maxAuditTs: string | null;
  maxAuditId: string | null;
}

/** Recipes: paginate over the underlying audit rows (not aggregated targets)
 *  so a bulk transaction with >BATCH_SIZE audit rows at the same `created_at`
 *  cannot drop rows at the batch boundary. We then dedupe by recipe_id and
 *  push each recipe's *current* state once. The returned (maxAuditTs,
 *  maxAuditId) is the keyset position of the last audit row consumed —
 *  guaranteed to match the LAST row of the inner ordered_audit CTE because
 *  ordering is `(created_at, id) ASC`. */
export async function loadRecipesBatch(cursor: CursorPos, limit = BATCH_SIZE): Promise<LoadedBatch<{ row: RecipeRow; auditTs: string; auditId: string }>> {
  const rows = await query<RecipeRow & { audit_ts: string; audit_id: string }>(
    `WITH ordered_audit AS (
       SELECT
         CASE
           WHEN al.target_type = 'recipe' THEN al.target_id::varchar
           WHEN al.target_type = 'imported_recipe_staging' THEN s.promoted_recipe_id
         END AS recipe_id,
         al.created_at,
         al.id::text AS audit_id
       FROM ops_audit_log al
       LEFT JOIN imported_recipes_staging s
         ON s.id::text = al.target_id
        AND al.target_type = 'imported_recipe_staging'
       WHERE (al.created_at, al.id::text) > ($1::timestamp, COALESCE($2::text, ''))
         AND (
           (al.target_type = 'recipe'
              AND al.action_type IN ('update_recipe','restore_recipe_revision')
              AND al.target_id IS NOT NULL)
           OR (al.target_type = 'imported_recipe_staging'
                 AND al.action_type = 'staging_recipe_promote'
                 AND s.promoted_recipe_id IS NOT NULL)
         )
       ORDER BY al.created_at ASC, al.id::text ASC
       LIMIT $3
     ),
     deduped AS (
       SELECT recipe_id,
              MAX(created_at) AS audit_ts,
              MAX(audit_id)   AS audit_id
         FROM ordered_audit
        WHERE recipe_id IS NOT NULL
        GROUP BY recipe_id
     )
     SELECT r.id, r.title, r.cuisine_tags, r.moods, r.constraints,
            r.estimated_time_min, r.default_servings, r.difficulty,
            r.nutrition_summary, r.instructions_summary, r.quality_tier,
            r.image_url, r.updated_at::text AS updated_at,
            d.audit_ts::text AS audit_ts,
            d.audit_id       AS audit_id
       FROM deduped d
       JOIN recipes r ON r.id = d.recipe_id
      ORDER BY d.audit_ts ASC, d.audit_id ASC`,
    [cursor.ts.toISOString(), cursor.id, limit]
  );
  const items = rows.map((r) => ({ row: r, auditTs: r.audit_ts, auditId: r.audit_id }));
  const last = items[items.length - 1];
  return { items, maxAuditTs: last?.auditTs ?? null, maxAuditId: last?.auditId ?? null };
}

export async function loadProductsBatch(cursor: CursorPos, limit = BATCH_SIZE): Promise<LoadedBatch<{ row: ProductRow; auditTs: string; auditId: string }>> {
  const rows = await query<ProductRow & { audit_ts: string; audit_id: string }>(
    `WITH ordered_audit AS (
       SELECT al.target_id::varchar AS product_id,
              al.created_at,
              al.id::text AS audit_id
         FROM ops_audit_log al
        WHERE (al.created_at, al.id::text) > ($1::timestamp, COALESCE($2::text, ''))
          AND al.target_type = 'product'
          AND al.action_type IN ('update_product')
          AND al.target_id IS NOT NULL
        ORDER BY al.created_at ASC, al.id::text ASC
        LIMIT $3
     ),
     deduped AS (
       SELECT product_id,
              MAX(created_at) AS audit_ts,
              MAX(audit_id)   AS audit_id
         FROM ordered_audit
        GROUP BY product_id
     )
     SELECT p.id, p.name, p.synonyms, p.department, p.default_unit,
            p.culture_tags, p.kcal, p.protein, p.carbs, p.fat, p.sodium,
            p.fiber, p.sugar, p.brand, p.allergens, p.ingredients_text,
            p.serving_size, p.branded_food_category,
            p.updated_at::text AS updated_at,
            d.audit_ts::text AS audit_ts,
            d.audit_id       AS audit_id
       FROM deduped d
       JOIN products p ON p.id = d.product_id
      ORDER BY d.audit_ts ASC, d.audit_id ASC`,
    [cursor.ts.toISOString(), cursor.id, limit]
  );
  const items = rows.map((r) => ({ row: r, auditTs: r.audit_ts, auditId: r.audit_id }));
  const last = items[items.length - 1];
  return { items, maxAuditTs: last?.auditTs ?? null, maxAuditId: last?.auditId ?? null };
}

export async function loadDecisionsBatch(cursor: CursorPos, limit = BATCH_SIZE): Promise<LoadedBatch<DecisionRow>> {
  const rows = await query<DecisionRow>(
    `SELECT al.id::text AS audit_id,
            al.created_at::text AS audit_created_at,
            al.action_type,
            al.decision_note,
            al.admin_user_id,
            ar.content_type,
            ar.content_id::text AS content_id
       FROM ops_audit_log al
       JOIN abuse_reports ar ON ar.id::text = al.target_id
      WHERE (al.created_at, al.id::text) > ($1::timestamp, COALESCE($2::text, ''))
        AND al.target_type = 'abuse_report'
        AND al.action_type IN ('moderation_approved','moderation_bulk_approved')
      ORDER BY al.created_at ASC, al.id::text ASC
      LIMIT $3`,
    [cursor.ts.toISOString(), cursor.id, limit]
  );
  const last = rows[rows.length - 1];
  return {
    items: rows,
    maxAuditTs: last?.audit_created_at ?? null,
    maxAuditId: last?.audit_id ?? null,
  };
}

// ── Per-endpoint pushers ──────────────────────────────────────────────────

interface PushOpts {
  baseUrl: string;
  token: string;
  dryRun: boolean;
  fetchImpl?: typeof fetch;
  log: JobContext["log"];
  /** For tests / `--since` override. */
  sinceOverride?: string;
  /** For end-to-end verification scenario (spec section 4): omit
   *  controlUpdatedAt from product payloads. CLI flag only. */
  omitControlUpdatedAt?: boolean;
}

function emptySummary(): EndpointSummary {
  return { inserted: 0, updated: 0, skipped: 0, errors: 0 };
}

function mergeSummary(a: EndpointSummary, b: EndpointSummary): EndpointSummary {
  return {
    inserted: a.inserted + b.inserted,
    updated: a.updated + b.updated,
    skipped: a.skipped + b.skipped,
    errors: a.errors + b.errors,
  };
}

async function pushEndpoint<TItem>(args: {
  endpoint: Endpoint;
  load: (cursor: CursorPos) => Promise<LoadedBatch<TItem>>;
  toPayload: (items: TItem[]) => unknown;
  toBatchKey: (items: TItem[]) => string;
  opts: PushOpts;
}): Promise<EndpointRunResult> {
  const startedAt = new Date();
  const cursor = await getCursor(args.endpoint, { sinceOverride: args.opts.sinceOverride });

  const url = `${args.opts.baseUrl.replace(/\/$/, "")}/api/admin/ops-sync/${args.endpoint}${args.opts.dryRun ? "?dryRun=1" : ""}`;
  const summary = emptySummary();
  const allResults: PerRowResult[] = [];
  let lastAuditTs: string | null = null;
  let lastAuditId: string | null = null;

  // Single-batch-per-run loop. Spec caps ≤100/batch and the cron runs every
  // 15 min; if a backlog builds, each subsequent run drains another batch.
  // We keep this loop bounded so a slow prod doesn't hold the job lock for
  // too long (default lockMinutes = 60).
  const MAX_BATCHES_PER_RUN = 5;
  for (let batchIdx = 0; batchIdx < MAX_BATCHES_PER_RUN; batchIdx++) {
    const cursorForBatch: CursorPos = lastAuditTs
      ? { ts: new Date(lastAuditTs), id: lastAuditId }
      : cursor;
    const batch = await args.load(cursorForBatch);
    if (batch.items.length === 0) break;

    const body = args.toPayload(batch.items);
    args.opts.log.info(
      { endpoint: args.endpoint, count: batch.items.length, batchIdx, dryRun: args.opts.dryRun },
      "[ops-sync] posting batch"
    );

    const post = await postBatch({
      url,
      token: args.opts.token,
      body,
      fetchImpl: args.opts.fetchImpl,
    });

    if (!post.ok) {
      args.opts.log.error(
        { endpoint: args.endpoint, status: post.status, message: post.message, fatal: post.fatal },
        "[ops-sync] batch failed"
      );
      // Record one error row per item in the failing batch so the cursor
      // doesn't advance (cursor only moves when summary.errors === 0) and
      // the next run replays them. Every prod endpoint is idempotent.
      const errRows: PerRowResult[] = batch.items.map((i) => ({
        id: args.toBatchKey([i]),
        action: "error",
        reason: post.message,
      }));
      summary.errors += batch.items.length;
      allResults.push(...errRows);
      // 401/403/503 → stop the whole endpoint (token broken / prod down).
      // Other 4xx (e.g. 400 from a malformed payload) → log + skip this
      // batch + advance audit cursor past it for THIS run so the next
      // batch loop iteration loads later rows. Persistent error rows in
      // summary keep the persisted cursor pinned so the bad batch is
      // retried on the next scheduled run (after we've fixed the bug).
      if (post.fatal) {
        return {
          endpoint: args.endpoint,
          status: "failed",
          summary,
          results: allResults,
          errorMessage: `HTTP ${post.status}: ${post.message}`,
        };
      }
      // Non-fatal: continue draining subsequent batches. Bump in-memory
      // cursor so we don't re-load the same rows in this run's loop.
      lastAuditTs = batch.maxAuditTs;
      lastAuditId = batch.maxAuditId;
      if (batch.items.length < BATCH_SIZE) break; // drained
      continue;
    }

    // Merge per-row results from prod's response.
    for (const r of post.body.results) {
      allResults.push(r);
    }
    summary.inserted += post.body.summary.inserted;
    summary.updated += post.body.summary.updated;
    summary.skipped += post.body.summary.skipped;
    summary.errors += post.body.summary.errors;

    lastAuditTs = batch.maxAuditTs;
    lastAuditId = batch.maxAuditId;
    if (batch.items.length < BATCH_SIZE) break; // drained
  }

  if (allResults.length === 0) {
    // Successful zero-row run: advance the cursor to the run start so
    // the next run doesn't re-scan the 7-day backfill window. Any audit
    // row written DURING this run (after `startedAt`) is still picked
    // up on the next pass because the keyset predicate uses `>`. We
    // null out the audit_id component so any audit row at exactly that
    // timestamp is included (`> (ts, '')` matches any real id).
    let cursorAdvancedTo: string | undefined;
    if (!args.opts.dryRun) {
      const ts = startedAt.toISOString();
      await setCursor(args.endpoint, ts, null);
      cursorAdvancedTo = ts;
    }
    return {
      endpoint: args.endpoint,
      status: "no_op",
      summary,
      results: allResults,
      cursorAdvancedTo,
    };
  }

  // Cursor advancement (spec point 5): only when summary.errors === 0.
  let cursorAdvancedTo: string | undefined;
  if (!args.opts.dryRun && summary.errors === 0 && lastAuditTs) {
    await setCursor(args.endpoint, lastAuditTs, lastAuditId);
    cursorAdvancedTo = lastAuditTs;
  }

  const status: EndpointRunResult["status"] = args.opts.dryRun
    ? "dry_run"
    : summary.errors > 0
      ? "partial"
      : "success";
  return { endpoint: args.endpoint, status, summary, results: allResults, cursorAdvancedTo };
}

async function pushRecipes(opts: PushOpts): Promise<EndpointRunResult> {
  return pushEndpoint({
    endpoint: "recipes",
    load: (c) => loadRecipesBatch(c),
    toPayload: (items) => ({ items: items.map((i) => mapRecipeRow(i.row)) }),
    toBatchKey: (items) => items[0]?.row.id ?? "(unknown)",
    opts,
  });
}

async function pushProducts(opts: PushOpts): Promise<EndpointRunResult> {
  return pushEndpoint({
    endpoint: "products",
    load: (c) => loadProductsBatch(c),
    toPayload: (items) => ({
      products: items.map((i) => mapProductRow(i.row, { omitControlUpdatedAt: opts.omitControlUpdatedAt })),
    }),
    toBatchKey: (items) => items[0]?.row.id ?? "(unknown)",
    opts,
  });
}

async function pushDecisions(opts: PushOpts): Promise<EndpointRunResult> {
  return pushEndpoint({
    endpoint: "moderation-decisions",
    load: (c) => loadDecisionsBatch(c),
    toPayload: (items) => ({
      decisions: items.map(mapDecisionRow).filter((d): d is DecisionPayload => d !== null),
    }),
    toBatchKey: (items) => items[0]?.audit_id ?? "(unknown)",
    opts,
  });
}

const PUSHERS: Record<Endpoint, (opts: PushOpts) => Promise<EndpointRunResult>> = {
  "moderation-decisions": pushDecisions,
  recipes: pushRecipes,
  products: pushProducts,
};

// ── Main job entrypoint + shared runner used by CLI ───────────────────────

export interface RunOptions {
  dryRun?: boolean;
  /** Override which endpoints to run (default: all in ENDPOINT_ORDER). */
  endpoints?: readonly Endpoint[];
  /** ISO timestamp — overrides the persisted cursor for this run only. */
  since?: string;
  /** CLI scenario: omit controlUpdatedAt from product payloads to
   *  reproduce prod's `missing_control_updated_at` skip path. */
  omitControlUpdatedAt?: boolean;
  fetchImpl?: typeof fetch;
}

export async function runReverseSync(ctx: JobContext, runOpts: RunOptions = {}): Promise<JobSummary> {
  const startedAt = Date.now();
  const token = process.env["OPS_REVERSE_SYNC_TOKEN"];
  const baseUrl = process.env["PROD_API_BASE"];

  if (!token) {
    const msg = "OPS_REVERSE_SYNC_TOKEN is not set — aborting reverse sync";
    ctx.log.error(msg);
    throw new Error(msg); // surfaces as a failed job in the runner
  }
  if (!baseUrl) {
    const msg = "PROD_API_BASE is not set — aborting reverse sync";
    ctx.log.error(msg);
    throw new Error(msg);
  }

  const dryRun = runOpts.dryRun ?? false;
  const endpoints = runOpts.endpoints ?? ENDPOINT_ORDER;

  const perEndpoint: ReverseSyncSummary["perEndpoint"] = [];
  const unknownActionTypes = await collectUnknownActionTypes();

  for (const endpoint of endpoints) {
    const pusher = PUSHERS[endpoint];
    const epStart = new Date();
    const opts: PushOpts = {
      baseUrl,
      token,
      dryRun,
      fetchImpl: runOpts.fetchImpl,
      log: ctx.log,
      sinceOverride: runOpts.since,
      omitControlUpdatedAt: runOpts.omitControlUpdatedAt,
    };
    let res: EndpointRunResult;
    try {
      res = await pusher(opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log.error({ endpoint, err: msg }, "[ops-sync] endpoint threw");
      res = {
        endpoint,
        status: "failed",
        summary: emptySummary(),
        results: [],
        errorMessage: msg.slice(0, 500),
      };
    }
    const epEnd = new Date();
    await recordRun({
      endpoint,
      startedAt: epStart,
      finishedAt: epEnd,
      status: res.status,
      summary: res.summary,
      sampleResults: res.results.slice(0, SAMPLE_RESULTS_CAP),
      errorMessage: res.errorMessage,
    });
    perEndpoint.push({
      endpoint: res.endpoint,
      status: res.status,
      summary: res.summary,
      cursorAdvancedTo: res.cursorAdvancedTo,
      sampleResults: res.results.slice(0, SAMPLE_RESULTS_CAP),
      errorMessage: res.errorMessage,
    });
    // Run-level fail-fast: a `failed` status means either a fatal HTTP
    // response (401/403/503 — token broken or prod down) or an unhandled
    // exception in the pusher. Either way, continuing to subsequent
    // endpoints would just produce more failures (same token, same prod
    // base URL) and pollute ops_sync_runs. Abort the run.
    if (res.status === "failed") {
      ctx.log.error(
        { endpoint, errorMessage: res.errorMessage },
        "[ops-sync] fatal endpoint failure — aborting remaining endpoints"
      );
      break;
    }
  }

  const summary: ReverseSyncSummary = {
    dryRun,
    perEndpoint,
    unknownActionTypes,
    durationMs: Date.now() - startedAt,
  };
  ctx.log.info(
    {
      perEndpoint: perEndpoint.map((e) => ({ endpoint: e.endpoint, status: e.status, summary: e.summary })),
      unknownActionTypes,
    },
    "[ops-sync] done"
  );
  return summary;
}

/** Surface unrouted action_type values written since yesterday. Helps catch
 *  audit drift when a new admin route lands without a routing entry. */
async function collectUnknownActionTypes(): Promise<string[]> {
  try {
    const rows = await query<{ action_type: string }>(
      `SELECT DISTINCT action_type FROM ops_audit_log
        WHERE created_at > NOW() - INTERVAL '1 day'`
    );
    const knownPrefixes = ["set_user_role", "system.", "staging_recipes_", "staging_recipe_edit",
      "staging_recipe_reject", "proposal_", "moderation_rejected", "moderation_needs_more_info",
      "moderation_escalated", "moderation_bulk_rejected", "moderation_bulk_needs_more_info",
      "moderation_bulk_escalated",
      // Recognized but deliberately not pushed (see AUDIT_TO_ENDPOINT comment):
      "manual_recipe_created"];
    return rows
      .map((r) => r.action_type)
      .filter((a) => !AUDIT_TO_ENDPOINT[a] && !knownPrefixes.some((p) => a === p || a.startsWith(p)));
  } catch {
    return [];
  }
}

export async function opsReverseSync(ctx: JobContext): Promise<JobSummary> {
  return runReverseSync(ctx);
}


import type { Request, Response } from "express";
import { query } from "./db.js";
import { maybeSendExport, buildOrderBy } from "./csv.js";
import { parseLimit, parsePage } from "./queryParams.js";

const SESSION_SORTS: Record<string, string> = {
  recipeTitle: "r.title",
  userEmail: "u.email",
  status: "cs.status",
  progressPct: "(CASE WHEN cs.total_steps > 0 THEN cs.completed_steps::float / cs.total_steps ELSE 0 END)",
  servings: "cs.servings",
  startedAt: "cs.started_at",
  finishedAt: "cs.finished_at",
};

export async function listCookSessions(req: Request, res: Response): Promise<void> {
  const status = req.query.status as string | undefined;
  const userId = req.query.userId as string | undefined;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, { def: 50, max: 100 });
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (status) {
    conditions.push(`cs.status = $${pi++}`);
    params.push(status);
  }
  if (userId) {
    conditions.push(`cs.user_id = $${pi++}`);
    params.push(userId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderBy = buildOrderBy(req.query.sort, req.query.dir, SESSION_SORTS, "cs.started_at", "cs.id");

  const [rows, count, summary] = await Promise.all([
    query<{
      id: string;
      user_id: string;
      user_email: string | null;
      recipe_id: string;
      recipe_title: string | null;
      started_at: string;
      finished_at: string | null;
      total_steps: number;
      completed_steps: number;
      status: string;
      servings: number | null;
      review_status: string | null;
      review_id: string | null;
    }>(
      // Use a LATERAL join so multiple deduction reviews per session
      // never duplicate the cook session row. Picks the most recent review.
      `SELECT cs.id, cs.user_id, u.email AS user_email, cs.recipe_id,
              r.title AS recipe_title, cs.started_at, cs.finished_at,
              cs.total_steps, cs.completed_steps, cs.status, cs.servings,
              pdr.status AS review_status, pdr.id AS review_id
         FROM cook_sessions cs
         LEFT JOIN users u ON u.id = cs.user_id
         LEFT JOIN recipes r ON r.id = cs.recipe_id
         LEFT JOIN LATERAL (
           SELECT id, status FROM pantry_deduction_reviews
            WHERE cook_session_id = cs.id
            ORDER BY created_at DESC
            LIMIT 1
         ) pdr ON true
         ${where}
         ${orderBy}
         LIMIT $${pi++} OFFSET $${pi}`,
      [...params, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM cook_sessions cs ${where}`,
      params
    ),
    query<{
      total: string;
      in_progress: string;
      completed: string;
      abandoned: string;
      pending_reviews: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status = 'in_progress')::text AS in_progress,
         COUNT(*) FILTER (WHERE status = 'completed')::text AS completed,
         COUNT(*) FILTER (WHERE status = 'abandoned')::text AS abandoned,
         (SELECT COUNT(*)::text FROM pantry_deduction_reviews WHERE status = 'pending') AS pending_reviews
       FROM cook_sessions`
    ),
  ]);

  const sessions = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userEmail: r.user_email,
    recipeId: r.recipe_id,
    recipeTitle: r.recipe_title,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    totalSteps: r.total_steps,
    completedSteps: r.completed_steps,
    progressPct:
      r.total_steps > 0
        ? Math.round((r.completed_steps / r.total_steps) * 100)
        : 0,
    status: r.status,
    servings: r.servings,
    reviewId: r.review_id,
    reviewStatus: r.review_status,
  }));

  if (
    await maybeSendExport(
      res,
      req.query.format,
      `cook-sessions-${new Date().toISOString().slice(0, 10)}`,
      sessions,
      [
        "id",
        "userEmail",
        "recipeTitle",
        "status",
        "progressPct",
        "totalSteps",
        "completedSteps",
        "servings",
        "startedAt",
        "finishedAt",
      ]
    )
  ) {
    return;
  }

  res.json({
    sessions,
    total: parseInt(count[0]?.n ?? "0", 10),
    page,
    limit,
    summary: {
      total: parseInt(summary[0]?.total ?? "0", 10),
      inProgress: parseInt(summary[0]?.in_progress ?? "0", 10),
      completed: parseInt(summary[0]?.completed ?? "0", 10),
      abandoned: parseInt(summary[0]?.abandoned ?? "0", 10),
      pendingReviews: parseInt(summary[0]?.pending_reviews ?? "0", 10),
    },
  });
}

// ---------------------------------------------------------------------------
// Itemized analysis: aggregates pantry-deduction items per ingredient across
// all reviews in a time window. Tells ops which ingredients users frequently
// skip / adjust / hit near-expiry on, plus volumes deducted.
// ---------------------------------------------------------------------------

export const ITEMIZED_SORT_COLUMNS: Record<string, string> = {
  ingredientName: "ingredient_name",
  suggestedCount: "suggested_count",
  confirmedCount: "confirmed_count",
  skippedCount: "skipped_count",
  adjustedCount: "adjusted_count",
  skipRate: "skip_rate",
  adjustRate: "adjust_rate",
  nearExpiryCount: "near_expiry_count",
  suggestedQtySum: "suggested_qty_sum",
  deductedQtySum: "deducted_qty_sum",
};

export const SINCE_WINDOWS: Record<string, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "100 years",
};

/**
 * Pure helper: resolves an itemized-analysis sort key + direction into a
 * fully-formed `ORDER BY ...` clause. Both inputs are validated against
 * allowlists, so the returned string is safe to splice into raw SQL.
 * Falls back to `suggested_count DESC` for unknown keys.
 */
export function resolveItemizedOrderBy(sortKey: unknown, dir: unknown): string {
  const col =
    (typeof sortKey === "string" && ITEMIZED_SORT_COLUMNS[sortKey]) ||
    ITEMIZED_SORT_COLUMNS.suggestedCount;
  const direction = dir === "asc" ? "ASC" : "DESC";
  return `ORDER BY ${col} ${direction} NULLS LAST, ingredient_name ASC`;
}

export function resolveSinceInterval(sinceKey: unknown): string {
  return (typeof sinceKey === "string" && SINCE_WINDOWS[sinceKey]) || SINCE_WINDOWS["30d"];
}

export async function listItemizedDeductions(req: Request, res: Response): Promise<void> {
  const sinceKey = (req.query.since as string) ?? "30d";
  const interval = resolveSinceInterval(sinceKey);
  const q = ((req.query.q as string) ?? "").trim();
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, { def: 50, max: 200 });
  const offset = (page - 1) * limit;

  const orderBy = resolveItemizedOrderBy(req.query.sort, req.query.dir);

  // CTE: explode each items column into rows tagged by bucket. Aggregating in
  // SQL keeps this O(rows in db) instead of pulling all reviews into Node.
  const params: unknown[] = [interval];
  let pi = 2;
  let qFilter = "";
  if (q) {
    qFilter = `WHERE ingredient_name ILIKE $${pi}`;
    params.push(`%${q}%`);
    pi++;
  }

  const aggSql = `
    WITH src AS (
      SELECT suggested_items, confirmed_items, skipped_items, adjusted_items
        FROM pantry_deduction_reviews
       WHERE created_at >= NOW() - $1::interval
    ),
    exploded AS (
      SELECT 'suggested'::text AS bucket, item
        FROM src, jsonb_array_elements(coalesce(suggested_items::jsonb, '[]'::jsonb)) AS item
      UNION ALL
      SELECT 'confirmed', item
        FROM src, jsonb_array_elements(coalesce(confirmed_items::jsonb, '[]'::jsonb)) AS item
      UNION ALL
      SELECT 'skipped', item
        FROM src, jsonb_array_elements(coalesce(skipped_items::jsonb, '[]'::jsonb)) AS item
      UNION ALL
      SELECT 'adjusted', item
        FROM src, jsonb_array_elements(coalesce(adjusted_items::jsonb, '[]'::jsonb)) AS item
    ),
    agg AS (
      SELECT
        coalesce(item->>'ingredientId', '') AS ingredient_id,
        coalesce(item->>'ingredientName', '(unnamed)') AS ingredient_name,
        COUNT(*) FILTER (WHERE bucket = 'suggested')::int AS suggested_count,
        COUNT(*) FILTER (WHERE bucket = 'confirmed')::int AS confirmed_count,
        COUNT(*) FILTER (WHERE bucket = 'skipped')::int AS skipped_count,
        COUNT(*) FILTER (WHERE bucket = 'adjusted')::int AS adjusted_count,
        COUNT(*) FILTER (
          WHERE bucket = 'suggested' AND (item->>'nearExpiry')::boolean
        )::int AS near_expiry_count,
        COALESCE(SUM(NULLIF(item->>'suggestedQty', '')::numeric)
          FILTER (WHERE bucket = 'suggested'), 0)::float AS suggested_qty_sum,
        COALESCE(SUM(
          COALESCE(
            NULLIF(item->>'finalQty', '')::numeric,
            NULLIF(item->>'suggestedQty', '')::numeric
          )
        ) FILTER (WHERE bucket IN ('confirmed', 'adjusted')), 0)::float AS deducted_qty_sum,
        MODE() WITHIN GROUP (ORDER BY item->>'suggestedUnit')
          FILTER (WHERE bucket = 'suggested') AS most_common_unit
      FROM exploded
      GROUP BY 1, 2
    ),
    rated AS (
      SELECT *,
        CASE WHEN suggested_count > 0
             THEN skipped_count::float / suggested_count
             ELSE 0 END AS skip_rate,
        CASE WHEN suggested_count > 0
             THEN adjusted_count::float / suggested_count
             ELSE 0 END AS adjust_rate
        FROM agg
    ),
    filtered AS (
      SELECT * FROM rated ${qFilter}
    )
    -- COUNT(*) OVER () gives total matching groups in one pass, so we never
    -- have to re-scan + re-explode the reviews table for pagination total.
    -- Group key is (ingredient_id, ingredient_name) — same as agg — so the
    -- total reflects the actual rows the UI will paginate through.
    SELECT *, COUNT(*) OVER ()::int AS total_rows
      FROM filtered
    ${orderBy}
    LIMIT $${pi} OFFSET $${pi + 1}
  `;

  const rows = await query<{
    ingredient_id: string;
    ingredient_name: string;
    suggested_count: number;
    confirmed_count: number;
    skipped_count: number;
    adjusted_count: number;
    near_expiry_count: number;
    suggested_qty_sum: number;
    deducted_qty_sum: number;
    most_common_unit: string | null;
    skip_rate: number;
    adjust_rate: number;
    total_rows: number;
  }>(aggSql, [...params, limit, offset]);
  const total = rows[0]?.total_rows ?? 0;

  if (
    await maybeSendExport(
      res,
      req.query.format,
      `cook-sessions-itemized-${sinceKey}-${new Date().toISOString().slice(0, 10)}`,
      rows.map((r) => ({
        ingredientId: r.ingredient_id,
        ingredientName: r.ingredient_name,
        suggestedCount: r.suggested_count,
        confirmedCount: r.confirmed_count,
        skippedCount: r.skipped_count,
        adjustedCount: r.adjusted_count,
        nearExpiryCount: r.near_expiry_count,
        skipRatePct: Math.round(r.skip_rate * 1000) / 10,
        adjustRatePct: Math.round(r.adjust_rate * 1000) / 10,
        suggestedQtySum: r.suggested_qty_sum,
        deductedQtySum: r.deducted_qty_sum,
        mostCommonUnit: r.most_common_unit ?? "",
      })),
      [
        "ingredientId",
        "ingredientName",
        "suggestedCount",
        "confirmedCount",
        "skippedCount",
        "adjustedCount",
        "nearExpiryCount",
        "skipRatePct",
        "adjustRatePct",
        "suggestedQtySum",
        "deductedQtySum",
        "mostCommonUnit",
      ]
    )
  ) {
    return;
  }

  res.json({
    items: rows.map((r) => ({
      ingredientId: r.ingredient_id,
      ingredientName: r.ingredient_name,
      suggestedCount: r.suggested_count,
      confirmedCount: r.confirmed_count,
      skippedCount: r.skipped_count,
      adjustedCount: r.adjusted_count,
      nearExpiryCount: r.near_expiry_count,
      skipRate: r.skip_rate,
      adjustRate: r.adjust_rate,
      suggestedQtySum: r.suggested_qty_sum,
      deductedQtySum: r.deducted_qty_sum,
      mostCommonUnit: r.most_common_unit,
    })),
    total,
    page,
    limit,
    since: sinceKey,
  });
}

export async function listPantryDeductionReviews(req: Request, res: Response): Promise<void> {
  const status = (req.query.status as string) ?? "pending";
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, { def: 50, max: 100 });
  const offset = (page - 1) * limit;

  const [rows, count] = await Promise.all([
    query<{
      id: string;
      user_id: string;
      user_email: string | null;
      cook_session_id: string | null;
      recipe_id_snapshot: string | null;
      status: string;
      suggested_items: unknown;
      confirmed_items: unknown;
      skipped_items: unknown;
      adjusted_items: unknown;
      confirmed_at: string | null;
      created_at: string;
    }>(
      `SELECT pdr.id, pdr.user_id, u.email AS user_email, pdr.cook_session_id,
              pdr.recipe_id_snapshot, pdr.status, pdr.suggested_items, pdr.confirmed_items,
              pdr.skipped_items, pdr.adjusted_items, pdr.confirmed_at, pdr.created_at
         FROM pantry_deduction_reviews pdr
         LEFT JOIN users u ON u.id = pdr.user_id
         WHERE pdr.status = $1
         ORDER BY pdr.created_at DESC
         LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM pantry_deduction_reviews WHERE status = $1`,
      [status]
    ),
  ]);

  const itemCount = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

  res.json({
    reviews: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userEmail: r.user_email,
      cookSessionId: r.cook_session_id,
      recipeId: r.recipe_id_snapshot,
      status: r.status,
      suggestedCount: itemCount(r.suggested_items),
      confirmedCount: itemCount(r.confirmed_items),
      skippedCount: itemCount(r.skipped_items),
      adjustedCount: itemCount(r.adjusted_items),
      confirmedAt: r.confirmed_at,
      createdAt: r.created_at,
    })),
    total: parseInt(count[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

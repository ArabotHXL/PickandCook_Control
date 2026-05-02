import type { Request, Response } from "express";
import { query } from "./db.js";
import { sendCsv, isCsvRequested } from "./csv.js";

export async function listCookSessions(req: Request, res: Response): Promise<void> {
  const status = req.query.status as string | undefined;
  const userId = req.query.userId as string | undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
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
         ORDER BY cs.started_at DESC
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

  if (isCsvRequested(req.query.format)) {
    sendCsv(res, `cook-sessions-${new Date().toISOString().slice(0, 10)}.csv`, sessions, [
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
    ]);
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

export async function listPantryDeductionReviews(req: Request, res: Response): Promise<void> {
  const status = (req.query.status as string) ?? "pending";
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
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

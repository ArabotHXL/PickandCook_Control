import type { Request, Response } from "express";
import { query } from "./db.js";
import { writeAuditLog } from "./audit.js";
import type { AdminPayload } from "./auth.js";

function getAdminUser(req: Request): AdminPayload {
  return (req as Request & { adminUser: AdminPayload }).adminUser;
}

export async function listRecipes(req: Request, res: Response): Promise<void> {
  const q = (req.query.q as string) ?? "";
  const qualityTier = req.query.qualityTier as string | undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (q) {
    conditions.push(`r.title ILIKE $${pi}`);
    params.push(`%${q}%`);
    pi++;
  }
  if (qualityTier) {
    conditions.push(`r.quality_tier = $${pi}`);
    params.push(qualityTier);
    pi++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [recipes, countRows] = await Promise.all([
    query<{
      id: string;
      title: string;
      quality_tier: string;
      quality_issues: unknown;
      difficulty: string;
      estimated_time_min: number;
      created_at: string;
    }>(
      `SELECT id, title, quality_tier, quality_issues, difficulty, estimated_time_min, created_at
       FROM recipes r
       ${where}
       ORDER BY created_at DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM recipes r ${where}`,
      params
    ),
  ]);

  res.json({
    recipes: recipes.map((r) => ({
      id: r.id,
      title: r.title,
      qualityTier: r.quality_tier,
      qualityIssues: Array.isArray(r.quality_issues) ? r.quality_issues : [],
      difficulty: r.difficulty,
      estimatedTimeMin: r.estimated_time_min,
      createdAt: r.created_at,
    })),
    total: parseInt(countRows[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

export async function setRecipeQuality(req: Request, res: Response): Promise<void> {
  const { recipeId } = req.params;
  const { qualityTier, note } = req.body ?? {};
  const admin = getAdminUser(req);

  const validTiers = ["good", "needs_rewrite", "duplicate", "unrated"];
  if (qualityTier && !validTiers.includes(qualityTier)) {
    res.status(400).json({ error: "Invalid quality tier" });
    return;
  }

  const existing = await query<{ quality_tier: string }>(
    `SELECT quality_tier FROM recipes WHERE id = $1`,
    [recipeId]
  );
  if (!existing.length) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  if (qualityTier) {
    await query(
      `UPDATE recipes SET quality_tier = $1 WHERE id = $2`,
      [qualityTier, recipeId]
    );
  }

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "set_recipe_quality",
    targetType: "recipe",
    targetId: recipeId,
    oldValue: { qualityTier: existing[0].quality_tier },
    newValue: { qualityTier: qualityTier ?? existing[0].quality_tier },
    decisionNote: note,
  });

  res.json({ ok: true });
}

export async function listUserCreatedRecipes(req: Request, res: Response): Promise<void> {
  const submissionStatus = (req.query.submissionStatus as string) ?? "pending";
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset = (page - 1) * limit;

  const [recipes, countRows] = await Promise.all([
    query<{
      id: string;
      user_id: string;
      email: string;
      title: string;
      status: string;
      submission_status: string;
      visibility_state: string;
      recipe_type: string;
      likes_count: number;
      report_count: number;
      created_at: string;
    }>(
      `SELECT ur.id, ur.user_id, u.email, ur.title, ur.status,
              ur.submission_status, ur.visibility_state, ur.recipe_type,
              ur.likes_count, ur.report_count, ur.created_at
       FROM user_recipes ur
       LEFT JOIN users u ON u.id = ur.user_id
       WHERE ur.submission_status = $1
       ORDER BY ur.created_at DESC
       LIMIT $2 OFFSET $3`,
      [submissionStatus, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM user_recipes WHERE submission_status = $1`,
      [submissionStatus]
    ),
  ]);

  res.json({
    recipes: recipes.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userEmail: r.email,
      title: r.title,
      status: r.status,
      submissionStatus: r.submission_status,
      visibilityState: r.visibility_state,
      recipeType: r.recipe_type,
      likesCount: r.likes_count,
      reportCount: r.report_count,
      createdAt: r.created_at,
    })),
    total: parseInt(countRows[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

export async function decideUserRecipe(req: Request, res: Response): Promise<void> {
  const { recipeId } = req.params;
  const { decision, note } = req.body ?? {};
  const admin = getAdminUser(req);

  const allowed = ["approved", "rejected", "needs_more_info"];
  if (!allowed.includes(decision)) {
    res.status(400).json({ error: "Invalid decision" });
    return;
  }

  const existing = await query<{ submission_status: string; title: string }>(
    `SELECT submission_status, title FROM user_recipes WHERE id = $1`,
    [recipeId]
  );
  if (!existing.length) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  let newSubmissionStatus = decision;
  let newVisibilityState: string | null = null;

  if (decision === "approved") {
    newVisibilityState = "public";
  } else if (decision === "rejected") {
    newVisibilityState = "private";
  }

  await query(
    `UPDATE user_recipes SET submission_status = $1${newVisibilityState ? `, visibility_state = '${newVisibilityState}'` : ""} WHERE id = $2`,
    [newSubmissionStatus, recipeId]
  );

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: `user_recipe_${decision}`,
    targetType: "user_recipe",
    targetId: recipeId,
    oldValue: { submissionStatus: existing[0].submission_status },
    newValue: { submissionStatus: decision, visibilityState: newVisibilityState },
    decisionNote: note,
  });

  res.json({ ok: true });
}

export async function listRecipeReports(req: Request, res: Response): Promise<void> {
  const status = (req.query.status as string) ?? "open";
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset = (page - 1) * limit;

  const [reports, countRows] = await Promise.all([
    query<{
      id: string;
      recipe_id: string;
      recipe_title: string;
      reporter_user_id: string;
      reporter_email: string;
      reason: string;
      details: string | null;
      status: string;
      created_at: string;
    }>(
      `SELECT rr.id, rr.recipe_id, ur.title AS recipe_title,
              rr.reporter_user_id, u.email AS reporter_email,
              rr.reason, rr.details, rr.status, rr.created_at
       FROM recipe_reports rr
       LEFT JOIN user_recipes ur ON ur.id = rr.recipe_id
       LEFT JOIN users u ON u.id = rr.reporter_user_id
       WHERE rr.status = $1
       ORDER BY rr.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM recipe_reports WHERE status = $1`,
      [status]
    ),
  ]);

  res.json({
    reports: reports.map((r) => ({
      id: r.id,
      recipeId: r.recipe_id,
      recipeTitle: r.recipe_title,
      reporterUserId: r.reporter_user_id,
      reporterEmail: r.reporter_email,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.created_at,
    })),
    total: parseInt(countRows[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

import type { Request, Response } from "express";
import { query, queryOne } from "./db.js";
import { writeAuditLog } from "./audit.js";
import type { AdminPayload } from "./auth.js";

function getAdmin(req: Request): AdminPayload {
  return (req as Request & { adminUser: AdminPayload }).adminUser;
}

interface RecipeRow {
  id: string;
  title: string;
  cuisine_tags: unknown;
  moods: unknown;
  constraints: unknown;
  budget: string;
  required_ingredient_ids: unknown;
  optional_ingredient_ids: unknown;
  estimated_time_min: number;
  difficulty: string;
  nutrition_summary: unknown;
  instructions_summary: string;
  source_url: string | null;
  image_url: string | null;
  serving_temperature: string | null;
  sweet_savory_profile: string | null;
  dish_type: unknown;
  convenience_tags: unknown;
  quality_tier: string;
  quality_issues: unknown;
  required_quantities: unknown;
  default_servings: number | null;
  created_at: string;
}

function rowToDto(r: RecipeRow): Record<string, unknown> {
  return {
    id: r.id,
    title: r.title,
    cuisineTags: r.cuisine_tags ?? [],
    moods: r.moods ?? [],
    constraints: r.constraints ?? [],
    budget: r.budget,
    requiredIngredientIds: r.required_ingredient_ids ?? [],
    optionalIngredientIds: r.optional_ingredient_ids ?? [],
    estimatedTimeMin: r.estimated_time_min,
    difficulty: r.difficulty,
    nutritionSummary: r.nutrition_summary,
    instructionsSummary: r.instructions_summary ?? "",
    sourceUrl: r.source_url,
    imageUrl: r.image_url,
    servingTemperature: r.serving_temperature,
    sweetSavoryProfile: r.sweet_savory_profile,
    dishType: r.dish_type ?? [],
    convenienceTags: r.convenience_tags ?? [],
    qualityTier: r.quality_tier,
    qualityIssues: r.quality_issues ?? [],
    requiredQuantities: r.required_quantities ?? {},
    defaultServings: r.default_servings,
    createdAt: r.created_at,
  };
}

const EDITABLE_FIELDS: Record<string, string> = {
  title: "title",
  instructionsSummary: "instructions_summary",
  imageUrl: "image_url",
  difficulty: "difficulty",
  estimatedTimeMin: "estimated_time_min",
  budget: "budget",
  servingTemperature: "serving_temperature",
  sweetSavoryProfile: "sweet_savory_profile",
  defaultServings: "default_servings",
  sourceUrl: "source_url",
};

const EDITABLE_JSONB: Record<string, string> = {
  cuisineTags: "cuisine_tags",
  moods: "moods",
  constraints: "constraints",
  dishType: "dish_type",
  convenienceTags: "convenience_tags",
  qualityIssues: "quality_issues",
  requiredIngredientIds: "required_ingredient_ids",
  optionalIngredientIds: "optional_ingredient_ids",
  requiredQuantities: "required_quantities",
  nutritionSummary: "nutrition_summary",
};

async function snapshotRevision(opts: {
  recipeId: string;
  recipeKind: "official" | "user";
  snapshot: unknown;
  adminUserId: string;
  note?: string;
}): Promise<string> {
  const email = await queryOne<{ email: string }>(
    `SELECT email FROM users WHERE id = $1`,
    [opts.adminUserId]
  );
  const rows = await query<{ id: string }>(
    `INSERT INTO recipe_revisions
       (recipe_kind, recipe_id, snapshot, edited_by_user_id, edited_by_email, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      opts.recipeKind,
      opts.recipeId,
      JSON.stringify(opts.snapshot),
      opts.adminUserId,
      email?.email ?? null,
      opts.note ?? null,
    ]
  );
  return rows[0]?.id ?? "";
}

export async function getRecipeDetail(req: Request, res: Response): Promise<void> {
  const { recipeId } = req.params;
  const recipe = await queryOne<RecipeRow>(
    `SELECT * FROM recipes WHERE id = $1`,
    [recipeId]
  );
  if (!recipe) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }
  const revisionCount = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM recipe_revisions WHERE recipe_kind = 'official' AND recipe_id = $1`,
    [recipeId]
  );
  res.json({
    recipe: rowToDto(recipe),
    revisionCount: parseInt(revisionCount?.n ?? "0", 10),
  });
}

export async function updateRecipe(req: Request, res: Response): Promise<void> {
  const { recipeId } = req.params;
  const admin = getAdmin(req);
  const body = (req.body ?? {}) as Record<string, unknown> & { note?: string };
  const note = typeof body.note === "string" ? body.note : undefined;

  const existing = await queryOne<RecipeRow>(`SELECT * FROM recipes WHERE id = $1`, [recipeId]);
  if (!existing) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  let pi = 1;
  const changedFields: string[] = [];

  for (const [bodyKey, dbCol] of Object.entries(EDITABLE_FIELDS)) {
    if (bodyKey in body) {
      sets.push(`${dbCol} = $${pi++}`);
      params.push(body[bodyKey]);
      changedFields.push(bodyKey);
    }
  }
  for (const [bodyKey, dbCol] of Object.entries(EDITABLE_JSONB)) {
    if (bodyKey in body) {
      sets.push(`${dbCol} = $${pi++}::jsonb`);
      params.push(JSON.stringify(body[bodyKey] ?? null));
      changedFields.push(bodyKey);
    }
  }

  if (sets.length === 0) {
    res.status(400).json({ error: "No editable fields provided" });
    return;
  }

  // Snapshot BEFORE update
  await snapshotRevision({
    recipeId,
    recipeKind: "official",
    snapshot: rowToDto(existing),
    adminUserId: admin.userId,
    note: note ? `pre-edit: ${note}` : "pre-edit snapshot",
  });

  params.push(recipeId);
  await query(
    `UPDATE recipes SET ${sets.join(", ")} WHERE id = $${pi}`,
    params
  );

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "update_recipe",
    targetType: "recipe",
    targetId: recipeId,
    oldValue: { fields: changedFields },
    newValue: changedFields.reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = body[k];
      return acc;
    }, {}),
    decisionNote: note,
  });

  const updated = await queryOne<RecipeRow>(`SELECT * FROM recipes WHERE id = $1`, [recipeId]);
  res.json({ recipe: updated ? rowToDto(updated) : null });
}

export async function listRecipeRevisions(req: Request, res: Response): Promise<void> {
  const { recipeId } = req.params;
  const kind = (req.query.kind as string) ?? "official";
  const rows = await query<{
    id: string;
    snapshot: unknown;
    edited_by_email: string | null;
    note: string | null;
    created_at: string;
  }>(
    `SELECT id, snapshot, edited_by_email, note, created_at
       FROM recipe_revisions
      WHERE recipe_kind = $1 AND recipe_id = $2
      ORDER BY created_at DESC
      LIMIT 30`,
    [kind, recipeId]
  );
  res.json({
    revisions: rows.map((r) => ({
      id: r.id,
      snapshot: r.snapshot,
      editedByEmail: r.edited_by_email,
      note: r.note,
      createdAt: r.created_at,
    })),
  });
}

export async function restoreRecipeRevision(req: Request, res: Response): Promise<void> {
  const { recipeId, revisionId } = req.params;
  const admin = getAdmin(req);

  const rev = await queryOne<{ snapshot: Record<string, unknown>; recipe_kind: string }>(
    `SELECT snapshot, recipe_kind FROM recipe_revisions
       WHERE id = $1 AND recipe_id = $2`,
    [revisionId, recipeId]
  );
  if (!rev) {
    res.status(404).json({ error: "Revision not found" });
    return;
  }
  if (rev.recipe_kind !== "official") {
    res.status(400).json({ error: "Only official-recipe revisions can be restored here" });
    return;
  }

  const current = await queryOne<RecipeRow>(`SELECT * FROM recipes WHERE id = $1`, [recipeId]);
  if (!current) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  // Snapshot CURRENT before restore
  await snapshotRevision({
    recipeId,
    recipeKind: "official",
    snapshot: rowToDto(current),
    adminUserId: admin.userId,
    note: `pre-restore from ${revisionId}`,
  });

  // Apply snapshot
  const snap = rev.snapshot;
  const sets: string[] = [];
  const params: unknown[] = [];
  let pi = 1;
  for (const [bodyKey, dbCol] of Object.entries(EDITABLE_FIELDS)) {
    if (bodyKey in snap) {
      sets.push(`${dbCol} = $${pi++}`);
      params.push(snap[bodyKey]);
    }
  }
  for (const [bodyKey, dbCol] of Object.entries(EDITABLE_JSONB)) {
    if (bodyKey in snap) {
      sets.push(`${dbCol} = $${pi++}::jsonb`);
      params.push(JSON.stringify(snap[bodyKey] ?? null));
    }
  }
  if (sets.length > 0) {
    params.push(recipeId);
    await query(`UPDATE recipes SET ${sets.join(", ")} WHERE id = $${pi}`, params);
  }

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "restore_recipe_revision",
    targetType: "recipe",
    targetId: recipeId,
    newValue: { revisionId },
  });

  res.json({ ok: true });
}

// ── User-Created Recipe Detail ────────────────────────────────────────────

export async function getUserRecipeDetail(req: Request, res: Response): Promise<void> {
  const { recipeId } = req.params;
  const recipe = await queryOne<{
    id: string;
    user_id: string;
    title: string;
    servings: number;
    template: string | null;
    tags: unknown;
    ingredients: unknown;
    steps: unknown;
    notes: string | null;
    status: string;
    submission_status: string;
    visibility_state: string;
    cover_image_url: string | null;
    likes_count: number;
    save_count: number;
    comment_count: number;
    report_count: number;
    recipe_type: string;
    parent_recipe_id: string | null;
    variation_summary: string | null;
    what_changed_text: string | null;
    why_changed_text: string | null;
    pantry_benefit_text: string | null;
    time_or_budget_benefit_text: string | null;
    show_author: boolean;
    author_display: string | null;
    created_at: string;
    updated_at: string;
    published_at: string | null;
  }>(
    `SELECT * FROM user_recipes WHERE id = $1`,
    [recipeId]
  );
  if (!recipe) {
    res.status(404).json({ error: "User recipe not found" });
    return;
  }

  const author = await queryOne<{
    id: string;
    email: string;
    username: string;
    role: string;
    created_at: string;
    other_published: string;
    other_pending: string;
    total_reports: string;
  }>(
    `SELECT u.id, u.email, u.username, u.role, u.created_at,
            (SELECT COUNT(*)::text FROM user_recipes WHERE user_id = u.id AND submission_status = 'approved' AND id != $2) AS other_published,
            (SELECT COUNT(*)::text FROM user_recipes WHERE user_id = u.id AND submission_status = 'pending' AND id != $2) AS other_pending,
            (SELECT COALESCE(SUM(report_count), 0)::text FROM user_recipes WHERE user_id = u.id) AS total_reports
       FROM users u WHERE u.id = $1`,
    [recipe.user_id, recipeId]
  );

  const reports = await query<{
    id: string;
    reporter_user_id: string;
    reporter_email: string | null;
    reason: string;
    details: string | null;
    status: string;
    created_at: string;
  }>(
    `SELECT rr.id, rr.reporter_user_id, u.email AS reporter_email,
            rr.reason, rr.details, rr.status, rr.created_at
       FROM recipe_reports rr
       LEFT JOIN users u ON u.id = rr.reporter_user_id
      WHERE rr.recipe_id = $1
      ORDER BY rr.created_at DESC
      LIMIT 50`,
    [recipeId]
  );

  res.json({
    recipe: {
      id: recipe.id,
      userId: recipe.user_id,
      title: recipe.title,
      servings: recipe.servings,
      template: recipe.template,
      tags: recipe.tags ?? [],
      ingredients: recipe.ingredients ?? [],
      steps: recipe.steps ?? [],
      notes: recipe.notes,
      status: recipe.status,
      submissionStatus: recipe.submission_status,
      visibilityState: recipe.visibility_state,
      coverImageUrl: recipe.cover_image_url,
      likesCount: recipe.likes_count,
      saveCount: recipe.save_count,
      commentCount: recipe.comment_count,
      reportCount: recipe.report_count,
      recipeType: recipe.recipe_type,
      parentRecipeId: recipe.parent_recipe_id,
      variationSummary: recipe.variation_summary,
      whatChangedText: recipe.what_changed_text,
      whyChangedText: recipe.why_changed_text,
      pantryBenefitText: recipe.pantry_benefit_text,
      timeOrBudgetBenefitText: recipe.time_or_budget_benefit_text,
      showAuthor: recipe.show_author,
      authorDisplay: recipe.author_display,
      createdAt: recipe.created_at,
      updatedAt: recipe.updated_at,
      publishedAt: recipe.published_at,
    },
    author: author
      ? {
          id: author.id,
          email: author.email,
          username: author.username,
          role: author.role,
          joinedAt: author.created_at,
          otherPublishedCount: parseInt(author.other_published, 10),
          otherPendingCount: parseInt(author.other_pending, 10),
          totalReportCount: parseInt(author.total_reports, 10),
        }
      : null,
    reports: reports.map((r) => ({
      id: r.id,
      reporterUserId: r.reporter_user_id,
      reporterEmail: r.reporter_email,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.created_at,
    })),
  });
}

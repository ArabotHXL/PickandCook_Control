import type { Request, Response } from "express";
import { query, queryOne, withTransaction } from "./db.js";
import { writeAuditLog } from "./audit.js";
import type { AdminPayload } from "./auth.js";

/** Marker the reverse-sync handler looks for in `ops_audit_log.decision_note`
 *  to set `forceOverrideOrigin: true` on outbound recipe push rows.
 *  Public so the test and reverse-sync handler can share the literal. */
export const APPROVE_FLOW_MARKER = "[approve-flow]";

/**
 * Pure validator that mirrors the dashboard's ApproveButton blockers — the
 * API is the source of truth, so a 422 from `/approve` carries the same
 * messages the operator sees inline. Exported for unit tests.
 */
export function validateRecipeForApproval(r: {
  title?: string | null;
  image_url?: string | null;
  required_ingredient_ids?: unknown;
  instructions_steps?: unknown;
  instructions_summary?: string | null;
  quality_issues?: unknown;
}): string[] {
  const errs: string[] = [];
  if (!r.title || !r.title.trim()) errs.push("Title is required");
  if (!r.image_url) errs.push("Image is required");
  const required = Array.isArray(r.required_ingredient_ids) ? r.required_ingredient_ids : [];
  if (required.length < 1) errs.push("At least one required ingredient is required");
  const steps = Array.isArray(r.instructions_steps) ? r.instructions_steps : [];
  if (steps.length < 1) errs.push("At least one instruction step is required");
  const summary = (r.instructions_summary ?? "").trim();
  if (summary.length < MIN_INSTRUCTIONS_SUMMARY_CHARS) {
    errs.push(`Instructions summary must be at least ${MIN_INSTRUCTIONS_SUMMARY_CHARS} characters`);
  }
  const issues = Array.isArray(r.quality_issues) ? r.quality_issues : [];
  if (issues.length > 0) errs.push("Resolve all quality issues before approving");
  return errs;
}

/** Minimum trimmed length for `instructions_summary` to count as "real".
 *  Recipes shorter than this can't be approved — they're almost certainly
 *  scraper stubs ("See source.", empty strings, etc.). */
const MIN_INSTRUCTIONS_SUMMARY_CHARS = 40;
/** Per-step text length cap to keep payloads sane. */
const MAX_STEP_CHARS = 2000;
const MAX_STEPS_PER_RECIPE = 60;

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
  instructions_steps: unknown;
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
    instructionsSteps: Array.isArray(r.instructions_steps) ? r.instructions_steps : [],
    createdAt: r.created_at,
  };
}

/** Validate an incoming `instructionsSteps` field. Returns the normalized
 *  array on success or an error message on failure. Exported for unit tests. */
export function validateInstructionsSteps(value: unknown): { steps: string[] } | { error: string } {
  if (!Array.isArray(value)) return { error: "instructionsSteps must be an array" };
  if (value.length > MAX_STEPS_PER_RECIPE) {
    return { error: `instructionsSteps must have at most ${MAX_STEPS_PER_RECIPE} steps` };
  }
  const steps: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const v = value[i];
    if (typeof v !== "string") return { error: `instructionsSteps[${i}] must be a string` };
    const trimmed = v.trim();
    if (!trimmed) return { error: `instructionsSteps[${i}] must be non-empty` };
    if (trimmed.length > MAX_STEP_CHARS) {
      return { error: `instructionsSteps[${i}] exceeds ${MAX_STEP_CHARS} characters` };
    }
    steps.push(trimmed);
  }
  return { steps };
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

export const EDITABLE_JSONB: Record<string, string> = {
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
  instructionsSteps: "instructions_steps",
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
      // instructionsSteps gets dedicated validation — reject malformed payloads
      // up-front so we don't persist `[null, 7, ""]` style garbage and so the
      // dashboard can show a useful error.
      if (bodyKey === "instructionsSteps") {
        const result = validateInstructionsSteps(body[bodyKey]);
        if ("error" in result) {
          res.status(400).json({ error: result.error });
          return;
        }
        sets.push(`${dbCol} = $${pi++}::jsonb`);
        params.push(JSON.stringify(result.steps));
        changedFields.push(bodyKey);
        continue;
      }
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
    recipeId: String(recipeId),
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
    targetId: String(recipeId),
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
    recipeId: String(recipeId),
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
    targetId: String(recipeId),
    newValue: { revisionId },
  });

  res.json({ ok: true });
}

// ── Approve catalog recipe (task #31) ─────────────────────────────────────

/**
 * Approve a catalog recipe for publication on prod.
 *
 * This is the Control-side counterpart to the `forceOverrideOrigin` flag
 * downstream: a prod-origin recipe (id like `rec_NNN`, sourced from prod's
 * own backfill) is normally rejected by the reverse-sync endpoint with
 * `origin_locked` because prod assumes its own data is authoritative.
 * After an operator approves it here, the next reverse-sync pass picks
 * up the `[approve-flow]` decision note on the audit row and forwards
 * the payload with the override flag set, so prod accepts the rewrite.
 *
 * Validations:
 *  - title trimmed and non-empty
 *  - image_url present
 *  - ≥ 1 required ingredient
 *  - ≥ 1 instruction step
 *  - instructions_summary trimmed length ≥ MIN_INSTRUCTIONS_SUMMARY_CHARS
 *  - quality_issues array empty (operator must resolve them first)
 *
 * Side effects (one transaction):
 *  1. Snapshot a `recipe_revisions` row tagged "pre-approve".
 *  2. UPDATE recipes SET quality_tier='acceptable', quality_issues='[]'.
 *  3. Write two `ops_audit_log` rows (update_recipe + set_recipe_quality)
 *     with `decision_note` containing the `[approve-flow]` marker so the
 *     reverse-sync worker routes both via the forceOverrideOrigin path.
 *
 * Returns 422 with `{ error, validationErrors: string[] }` when the recipe
 * fails the pre-flight checks so the dashboard can show a clear list.
 */
export async function approveRecipe(req: Request, res: Response): Promise<void> {
  const { recipeId } = req.params;
  const admin = getAdmin(req);
  const body = (req.body ?? {}) as { note?: unknown };
  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : "";

  const current = await queryOne<RecipeRow>(
    `SELECT * FROM recipes WHERE id = $1`,
    [recipeId]
  );
  if (!current) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  const validationErrors = validateRecipeForApproval(current);
  if (validationErrors.length > 0) {
    res.status(422).json({ error: "Recipe not ready for approval", validationErrors });
    return;
  }

  const previousTier = current.quality_tier;
  const decisionNote = note
    ? `${APPROVE_FLOW_MARKER} ${note}`
    : `${APPROVE_FLOW_MARKER} approved by operator`;

  // Snapshot BEFORE the mutation — outside the transaction is fine; if the
  // tx rolls back the orphan revision is harmless and matches the existing
  // updateRecipe pattern (which also snapshots outside the UPDATE).
  await snapshotRevision({
    recipeId: String(recipeId),
    recipeKind: "official",
    snapshot: rowToDto(current),
    adminUserId: admin.userId,
    note: "pre-approve",
  });

  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE recipes
          SET quality_tier = 'acceptable',
              quality_issues = '[]'::jsonb
        WHERE id = $1`,
      [recipeId]
    );
    // Two audit rows: one for the recipe push, one for the quality tier
    // change. Reverse-sync routes update_recipe AND set_recipe_quality to
    // the recipes endpoint, so prod sees both via a single deduped push;
    // they share the marker so either alone is enough to flip the override.
    await tx.query(
      `INSERT INTO ops_audit_log
         (admin_user_id, action_type, target_type, target_id, old_value, new_value, decision_note)
       VALUES ($1, 'update_recipe', 'recipe', $2, NULL, $3::jsonb, $4)`,
      [admin.userId, recipeId, JSON.stringify({ approved: true }), decisionNote]
    );
    await tx.query(
      `INSERT INTO ops_audit_log
         (admin_user_id, action_type, target_type, target_id, old_value, new_value, decision_note)
       VALUES ($1, 'set_recipe_quality', 'recipe', $2, $3::jsonb, $4::jsonb, $5)`,
      [
        admin.userId,
        recipeId,
        JSON.stringify({ qualityTier: previousTier }),
        JSON.stringify({ qualityTier: "acceptable" }),
        decisionNote,
      ]
    );
  });

  res.json({ ok: true, qualityTier: "acceptable" });
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

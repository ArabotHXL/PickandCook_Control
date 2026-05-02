import type { Request, Response } from "express";
import { query, queryOne, withTransaction } from "./db.js";
import { writeAuditLog } from "./audit.js";
import type { AdminPayload } from "./auth.js";
import { parseLimit, parsePage } from "./queryParams.js";
import { randomUUID } from "node:crypto";
import { mapIngredientNames } from "../../services/ingredientMapping.js";

function getAdminUser(req: Request): AdminPayload {
  return (req as Request & { adminUser: AdminPayload }).adminUser;
}

const PENDING_STATUSES = ["imported", "ready", "needs_review"];
const FINAL_STATUSES = ["promoted", "rejected"];
const ALL_FILTERS = [...PENDING_STATUSES, ...FINAL_STATUSES, "all", "pending"];

interface StagingRow {
  id: string;
  source: string;
  source_recipe_id: string;
  title: string;
  status: string;
  cuisine_tags: unknown;
  estimated_time_min: number | null;
  difficulty: string | null;
  mapping_rate: number | null;
  unmapped_ingredient_names: unknown;
  required_ingredient_ids: unknown;
  image_url: string | null;
  source_url: string | null;
  notes: string | null;
  created_at: string;
  promoted_recipe_id: string | null;
}

function toDto(r: StagingRow) {
  return {
    id: r.id,
    source: r.source,
    sourceRecipeId: r.source_recipe_id,
    title: r.title,
    status: r.status,
    cuisineTags: Array.isArray(r.cuisine_tags) ? r.cuisine_tags : [],
    estimatedTimeMin: r.estimated_time_min,
    difficulty: r.difficulty,
    mappingRate: r.mapping_rate,
    unmappedIngredientNames: Array.isArray(r.unmapped_ingredient_names)
      ? r.unmapped_ingredient_names
      : [],
    mappedIngredientCount: Array.isArray(r.required_ingredient_ids)
      ? r.required_ingredient_ids.length
      : 0,
    imageUrl: r.image_url,
    sourceUrl: r.source_url,
    notes: r.notes,
    createdAt: r.created_at,
    promotedRecipeId: r.promoted_recipe_id,
  };
}

// Allowed sort columns -> safe SQL expressions. Anything outside this map is
// rejected so the `sort` query param can't be turned into SQL injection.
const SORT_COLUMNS: Record<string, string> = {
  title: "title",
  source: "source",
  status: "status",
  mappingRate: "mapping_rate",
  unmappedCount: "jsonb_array_length(coalesce(unmapped_ingredient_names, '[]'::jsonb))",
  createdAt: "created_at",
};

export async function listStagingRecipes(req: Request, res: Response): Promise<void> {
  const status = (req.query.status as string) ?? "pending";
  const source = req.query.source as string | undefined;
  const q = (req.query.q as string) ?? "";
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, { def: 50, max: 100 });
  const offset = (page - 1) * limit;

  const sortKey = (req.query.sort as string) ?? "createdAt";
  const dir = (req.query.dir as string) === "asc" ? "ASC" : "DESC";
  const sortExpr = SORT_COLUMNS[sortKey] ?? SORT_COLUMNS.createdAt;
  // Stable secondary sort so equal mapping_rate / status rows don't shuffle.
  const orderBy = `${sortExpr} ${dir} NULLS LAST, created_at DESC`;

  if (!ALL_FILTERS.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${ALL_FILTERS.join(", ")}` });
    return;
  }

  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (status === "pending") {
    conditions.push(`status = ANY($${pi}::text[])`);
    params.push(PENDING_STATUSES);
    pi++;
  } else if (status !== "all") {
    conditions.push(`status = $${pi}`);
    params.push(status);
    pi++;
  }

  if (source) {
    conditions.push(`source = $${pi}`);
    params.push(source);
    pi++;
  }

  if (q) {
    conditions.push(`title ILIKE $${pi}`);
    params.push(`%${q}%`);
    pi++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows, countRows, sourceCounts, statusCounts] = await Promise.all([
    query<StagingRow>(
      `SELECT id, source, source_recipe_id, title, status, cuisine_tags,
              estimated_time_min, difficulty, mapping_rate,
              unmapped_ingredient_names, required_ingredient_ids,
              image_url, source_url, notes, created_at, promoted_recipe_id
         FROM imported_recipes_staging
         ${where}
         ORDER BY ${orderBy}
         LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM imported_recipes_staging ${where}`,
      params
    ),
    query<{ source: string; n: string }>(
      `SELECT source, COUNT(*)::text AS n FROM imported_recipes_staging GROUP BY source ORDER BY n DESC`
    ),
    query<{ status: string; n: string }>(
      `SELECT status, COUNT(*)::text AS n FROM imported_recipes_staging GROUP BY status ORDER BY n DESC`
    ),
  ]);

  res.json({
    rows: rows.map(toDto),
    total: parseInt(countRows[0]?.n ?? "0", 10),
    page,
    limit,
    facets: {
      sources: sourceCounts.map((s) => ({ source: s.source, count: parseInt(s.n, 10) })),
      statuses: statusCounts.map((s) => ({ status: s.status, count: parseInt(s.n, 10) })),
    },
  });
}

export async function getStagingDetail(req: Request, res: Response): Promise<void> {
  const { stagingId } = req.params;
  const row = await queryOne<StagingRow & { raw_payload: unknown; instructions_summary: string | null; instructions_steps: unknown }>(
    `SELECT id, source, source_recipe_id, title, status, cuisine_tags,
            estimated_time_min, difficulty, mapping_rate,
            unmapped_ingredient_names, required_ingredient_ids,
            image_url, source_url, notes, created_at, promoted_recipe_id,
            raw_payload, instructions_summary, instructions_steps
       FROM imported_recipes_staging WHERE id = $1`,
    [stagingId]
  );
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    ...toDto(row),
    instructionsSummary: row.instructions_summary,
    instructionsSteps: Array.isArray(row.instructions_steps) ? row.instructions_steps : [],
    rawPayload: row.raw_payload,
  });
}

export async function updateStagingRecipe(req: Request, res: Response): Promise<void> {
  const { stagingId } = req.params;
  const admin = getAdminUser(req);
  const { title, requiredIngredientIds, unmappedIngredientNames, estimatedTimeMin, difficulty, notes } = req.body ?? {};

  const existing = await queryOne<{ status: string; title: string }>(
    `SELECT status, title FROM imported_recipes_staging WHERE id = $1`,
    [stagingId]
  );
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (FINAL_STATUSES.includes(existing.status)) {
    res.status(409).json({ error: `Cannot edit a ${existing.status} staging row` });
    return;
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (typeof title === "string" && title.trim()) {
    sets.push(`title = $${pi++}`);
    params.push(title.trim());
  }
  if (Array.isArray(requiredIngredientIds)) {
    sets.push(`required_ingredient_ids = $${pi++}::jsonb`);
    params.push(JSON.stringify(requiredIngredientIds));
  }
  if (Array.isArray(unmappedIngredientNames)) {
    sets.push(`unmapped_ingredient_names = $${pi++}::jsonb`);
    params.push(JSON.stringify(unmappedIngredientNames));
  }
  if (typeof estimatedTimeMin === "number") {
    sets.push(`estimated_time_min = $${pi++}`);
    params.push(estimatedTimeMin);
  }
  if (typeof difficulty === "string") {
    sets.push(`difficulty = $${pi++}`);
    params.push(difficulty);
  }
  if (typeof notes === "string") {
    sets.push(`notes = $${pi++}`);
    params.push(notes);
  }

  if (!sets.length) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  sets.push(`updated_at = NOW()`);
  params.push(stagingId);
  await query(
    `UPDATE imported_recipes_staging SET ${sets.join(", ")} WHERE id = $${pi}`,
    params
  );

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "staging_recipe_edit",
    targetType: "imported_recipe_staging",
    targetId: String(stagingId),
    oldValue: { title: existing.title },
    newValue: { fieldsTouched: sets.length - 1 },
  });

  res.json({ ok: true });
}

export async function promoteStagingRecipe(req: Request, res: Response): Promise<void> {
  const { stagingId } = req.params;
  const admin = getAdminUser(req);
  const { note } = req.body ?? {};

  // Both INSERT-into-recipes and UPDATE-staging happen in one transaction so
  // a process crash between the two cannot leave an orphan recipes row.
  // Concurrent promotes are blocked by SELECT … FOR UPDATE on the staging row
  // — the second attempt waits, then sees promoted_recipe_id set and 409s.
  const result = await withTransaction(async (tx) => {
    const row = await tx.queryOne<{
      id: string;
      title: string;
      status: string;
      cuisine_tags: unknown;
      moods: unknown;
      constraints: unknown;
      budget: string | null;
      required_ingredient_ids: unknown;
      optional_ingredient_ids: unknown;
      estimated_time_min: number | null;
      difficulty: string | null;
      nutrition_summary: unknown;
      instructions_summary: string | null;
      instructions_steps: unknown;
      source_url: string | null;
      image_url: string | null;
      serving_temperature: string | null;
      sweet_savory_profile: string | null;
      dish_type: unknown;
      convenience_tags: unknown;
      promoted_recipe_id: string | null;
    }>(
      `SELECT id, title, status, cuisine_tags, moods, constraints, budget,
              required_ingredient_ids, optional_ingredient_ids,
              estimated_time_min, difficulty, nutrition_summary,
              instructions_summary, instructions_steps,
              source_url, image_url,
              serving_temperature, sweet_savory_profile, dish_type, convenience_tags,
              promoted_recipe_id
         FROM imported_recipes_staging WHERE id = $1
         FOR UPDATE`,
      [stagingId]
    );
    if (!row) return { kind: "not_found" as const };
    if (row.promoted_recipe_id) {
      return { kind: "already_promoted" as const, promotedRecipeId: row.promoted_recipe_id };
    }
    if (FINAL_STATUSES.includes(row.status)) {
      return { kind: "bad_status" as const, status: row.status };
    }

    const newRecipeId = randomUUID();
    await tx.query(
      `INSERT INTO recipes
         (id, title, cuisine_tags, moods, constraints, budget,
          required_ingredient_ids, optional_ingredient_ids,
          estimated_time_min, difficulty, nutrition_summary,
          instructions_summary, instructions_steps,
          source_url, image_url,
          serving_temperature, sweet_savory_profile, dish_type, convenience_tags,
          quality_tier, created_at)
       VALUES ($1, $2, $3, $4, $5, $6,
               $7, $8,
               $9, $10, $11,
               $12, $13,
               $14, $15,
               $16, $17, $18, $19,
               'unrated', NOW())`,
      [
        newRecipeId,
        row.title,
        JSON.stringify(row.cuisine_tags ?? []),
        JSON.stringify(row.moods ?? []),
        JSON.stringify(row.constraints ?? []),
        row.budget,
        JSON.stringify(row.required_ingredient_ids ?? []),
        JSON.stringify(row.optional_ingredient_ids ?? []),
        row.estimated_time_min,
        row.difficulty,
        row.nutrition_summary ? JSON.stringify(row.nutrition_summary) : null,
        row.instructions_summary,
        JSON.stringify(Array.isArray(row.instructions_steps) ? row.instructions_steps : []),
        row.source_url,
        row.image_url,
        row.serving_temperature,
        row.sweet_savory_profile,
        JSON.stringify(row.dish_type ?? []),
        JSON.stringify(row.convenience_tags ?? []),
      ]
    );

    await tx.query(
      `UPDATE imported_recipes_staging
         SET status = 'promoted',
             promoted_recipe_id = $2,
             updated_at = NOW()
       WHERE id = $1`,
      [stagingId, newRecipeId]
    );

    return { kind: "ok" as const, recipeId: newRecipeId, oldStatus: row.status };
  });

  if (result.kind === "not_found") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (result.kind === "already_promoted") {
    res.status(409).json({ error: "Already promoted", promotedRecipeId: result.promotedRecipeId });
    return;
  }
  if (result.kind === "bad_status") {
    res.status(409).json({ error: `Cannot promote a ${result.status} row` });
    return;
  }

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "staging_recipe_promote",
    targetType: "imported_recipe_staging",
    targetId: String(stagingId),
    oldValue: { status: result.oldStatus },
    newValue: { status: "promoted", recipeId: result.recipeId },
    decisionNote: note,
  });

  res.json({ ok: true, recipeId: result.recipeId });
}

/**
 * Re-run ingredient mapping over staging rows that haven't been finalized.
 *
 * Useful after the products catalog grows or the normalizer improves: rows
 * imported with an old, weak mapping get a fresh pass without re-scraping.
 *
 * Bounded to `imported` / `needs_review` rows (we never touch promoted/rejected),
 * capped at MAX_REMAP per call to avoid runaway DB usage. Each row's
 * mapping_rate may go up (good) or down (if the catalog lost a synonym).
 * Status is recomputed: rate >= 0.5 -> 'ready', else -> 'needs_review'.
 *
 * Audited as a single rollup entry showing how many rows changed.
 */
const MAX_REMAP_PER_CALL = 200;

export async function remapStagingIngredients(
  req: Request,
  res: Response
): Promise<void> {
  const admin = getAdminUser(req);
  const sourceFilter = req.body?.source as string | undefined;
  const onlyNeedsReview = req.body?.onlyNeedsReview === true;

  const conditions: string[] = ["status = ANY($1::text[])"];
  const params: unknown[] = [
    onlyNeedsReview ? ["needs_review"] : ["imported", "needs_review"],
  ];
  let pi = 2;
  if (sourceFilter) {
    conditions.push(`source = $${pi++}`);
    params.push(sourceFilter);
  }

  const rows = await query<{
    id: string;
    unmapped_ingredient_names: unknown;
    required_ingredient_ids: unknown;
    mapping_rate: number | null;
    status: string;
  }>(
    `SELECT id, unmapped_ingredient_names, required_ingredient_ids,
            mapping_rate, status
       FROM imported_recipes_staging
      WHERE ${conditions.join(" AND ")}
      ORDER BY mapping_rate ASC NULLS FIRST
      LIMIT ${MAX_REMAP_PER_CALL}`,
    params
  );

  let touched = 0;
  let totalDelta = 0;
  let nowReady = 0;

  for (const row of rows) {
    const previouslyMapped = Array.isArray(row.required_ingredient_ids)
      ? (row.required_ingredient_ids as string[])
      : [];
    const previouslyUnmapped = Array.isArray(row.unmapped_ingredient_names)
      ? (row.unmapped_ingredient_names as string[])
      : [];
    // Only attempt re-mapping the previously-unmapped names. Already-mapped
    // ingredient IDs stay (they're product UUIDs we trust).
    if (previouslyUnmapped.length === 0) continue;

    const { mapped: newlyMapped, unmapped: stillUnmapped } =
      await mapIngredientNames(previouslyUnmapped);

    if (newlyMapped.length === 0) continue; // nothing changed

    const combinedMapped = [...previouslyMapped, ...newlyMapped];
    const totalAttempted = combinedMapped.length + stillUnmapped.length;
    const newRate = totalAttempted > 0 ? combinedMapped.length / totalAttempted : 0;
    const newStatus = newRate >= 0.5 ? "ready" : "needs_review";

    await query(
      `UPDATE imported_recipes_staging
          SET required_ingredient_ids = $2::jsonb,
              unmapped_ingredient_names = $3::jsonb,
              mapping_rate = $4,
              status = $5,
              updated_at = NOW()
        WHERE id = $1`,
      [
        row.id,
        JSON.stringify(combinedMapped),
        JSON.stringify(stillUnmapped),
        newRate,
        newStatus,
      ]
    );

    touched++;
    totalDelta += newlyMapped.length;
    if (newStatus === "ready" && row.status !== "ready") nowReady++;
  }

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "staging_recipes_remap",
    targetType: "imported_recipes_staging",
    targetId: "batch",
    newValue: {
      scanned: rows.length,
      touched,
      newlyMappedIngredients: totalDelta,
      promotedToReady: nowReady,
      sourceFilter: sourceFilter ?? null,
      onlyNeedsReview,
    },
  });

  res.json({
    ok: true,
    scanned: rows.length,
    touched,
    newlyMappedIngredients: totalDelta,
    promotedToReady: nowReady,
  });
}

export async function rejectStagingRecipe(req: Request, res: Response): Promise<void> {
  const { stagingId } = req.params;
  const admin = getAdminUser(req);
  const { note } = req.body ?? {};

  const row = await queryOne<{ status: string }>(
    `SELECT status FROM imported_recipes_staging WHERE id = $1`,
    [stagingId]
  );
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (FINAL_STATUSES.includes(row.status)) {
    res.status(409).json({ error: `Already ${row.status}` });
    return;
  }

  await query(
    `UPDATE imported_recipes_staging SET status = 'rejected', notes = $2, updated_at = NOW() WHERE id = $1`,
    [stagingId, note ?? null]
  );

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "staging_recipe_reject",
    targetType: "imported_recipe_staging",
    targetId: String(stagingId),
    oldValue: { status: row.status },
    newValue: { status: "rejected" },
    decisionNote: note,
  });

  res.json({ ok: true });
}

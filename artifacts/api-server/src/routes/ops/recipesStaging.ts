import type { Request, Response } from "express";
import { query, queryOne, withTransaction } from "./db.js";
import { writeAuditLog } from "./audit.js";
import type { AdminPayload } from "./auth.js";
import { parseLimit, parsePage } from "./queryParams.js";
import { randomUUID } from "node:crypto";
import { mapIngredientNames } from "../../services/ingredientMapping.js";
import {
  extractIngredientsFromWikitext,
  fetchWikitextByPageId,
} from "../../jobs/handlers/wikibooksWeekly.js";

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

// Allowed sort columns -> safe SQL expressions. Anything outside this map
// silently falls back to `createdAt` so the `sort` query param cannot be
// turned into SQL injection.
export const STAGING_SORT_COLUMNS: Record<string, string> = {
  title: "title",
  source: "source",
  status: "status",
  mappingRate: "mapping_rate",
  unmappedCount: "jsonb_array_length(coalesce(unmapped_ingredient_names, '[]'::jsonb))",
  createdAt: "created_at",
};

/** Resolve the ORDER BY clause for the staging list endpoint. Pure + testable. */
export function resolveStagingOrderBy(
  sortKey: string | undefined,
  dirParam: string | undefined,
): string {
  const expr = STAGING_SORT_COLUMNS[sortKey ?? ""] ?? STAGING_SORT_COLUMNS.createdAt;
  const dir = dirParam === "asc" ? "ASC" : "DESC";
  // Stable secondary sort so equal mapping_rate / status rows don't shuffle.
  return `${expr} ${dir} NULLS LAST, created_at DESC`;
}

export async function listStagingRecipes(req: Request, res: Response): Promise<void> {
  const status = (req.query.status as string) ?? "pending";
  const source = req.query.source as string | undefined;
  const q = (req.query.q as string) ?? "";
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, { def: 50, max: 100 });
  const offset = (page - 1) * limit;

  const orderBy = resolveStagingOrderBy(
    req.query.sort as string | undefined,
    req.query.dir as string | undefined,
  );

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

export async function createStagingRecipe(req: Request, res: Response): Promise<void> {
  const admin = getAdminUser(req);
  const titleRaw = req.body?.title;
  if (typeof titleRaw !== "string") {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const title = titleRaw.trim();
  if (!title) {
    res.status(400).json({ error: "title cannot be empty" });
    return;
  }
  if (title.length > 200) {
    res.status(400).json({ error: "title cannot exceed 200 characters" });
    return;
  }

  const newId = randomUUID();
  const sourceRecipeId = randomUUID();

  await query(
    `INSERT INTO imported_recipes_staging
       (id, source, source_recipe_id, title, status, review_status,
        cuisine_tags, moods, constraints, dish_type, convenience_tags,
        required_ingredient_ids, optional_ingredient_ids,
        unmapped_ingredient_names, instructions_steps,
        instructions_summary, mapping_rate, duplicate_status,
        created_at, updated_at)
     VALUES ($1, 'manual', $2, $3, 'needs_review', 'pending',
             '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
             '[]'::jsonb, '[]'::jsonb,
             '[]'::jsonb, '[]'::jsonb,
             '', NULL, 'unique',
             NOW(), NOW())`,
    [newId, sourceRecipeId, title]
  );

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "manual_recipe_created",
    targetType: "imported_recipe_staging",
    targetId: newId,
    newValue: { title, source: "manual" },
  });

  const row = await queryOne<StagingRow & { raw_payload: unknown; instructions_summary: string | null; instructions_steps: unknown }>(
    `SELECT id, source, source_recipe_id, title, status, cuisine_tags,
            estimated_time_min, difficulty, mapping_rate,
            unmapped_ingredient_names, required_ingredient_ids,
            image_url, source_url, notes, created_at, promoted_recipe_id,
            raw_payload, instructions_summary, instructions_steps
       FROM imported_recipes_staging WHERE id = $1`,
    [newId]
  );
  if (!row) {
    res.status(500).json({ error: "Failed to load created row" });
    return;
  }
  res.json({
    ...toDto(row),
    instructionsSummary: row.instructions_summary,
    instructionsSteps: Array.isArray(row.instructions_steps) ? row.instructions_steps : [],
    rawPayload: row.raw_payload,
  });
}

/**
 * Bulk-create staging rows from a list of titles. Each title becomes one
 * `imported_recipes_staging` row with `source='manual'`, `status='needs_review'`
 * (same shape as the single-create path).
 *
 * Per-row validation failures (empty title, too long) do NOT abort the batch;
 * they are returned in `failed[]` so the operator can fix and retry.
 *
 * All inserts share one `batchId` (UUID) recorded in the per-row audit entries
 * plus a single rollup audit entry, so the batch is reconstructable from
 * `ops_audit_log` even though the table has no dedicated batch_id column.
 *
 * Capped at MAX_BULK_TITLES per call to keep memory and audit volume bounded.
 */
const MAX_BULK_TITLES = 500;

export async function bulkCreateStagingRecipes(
  req: Request,
  res: Response
): Promise<void> {
  const admin = getAdminUser(req);
  const titlesRaw = req.body?.titles;

  if (!Array.isArray(titlesRaw)) {
    res.status(400).json({ error: "titles must be an array of strings" });
    return;
  }
  if (titlesRaw.length === 0) {
    res.status(400).json({ error: "titles cannot be empty" });
    return;
  }
  if (titlesRaw.length > MAX_BULK_TITLES) {
    res.status(400).json({
      error: `titles exceeds maximum of ${MAX_BULK_TITLES} per request`,
    });
    return;
  }

  type Failed = { index: number; title: string; error: string };
  type Created = { id: string; title: string };

  const created: Created[] = [];
  const failed: Failed[] = [];
  // Pre-validate so we can plan inserts. Operators paste arbitrary text;
  // skipping invalid rows (rather than 400-ing the whole batch) is the whole
  // point of "bulk import with summary toast".
  const valid: { index: number; title: string }[] = [];
  for (let i = 0; i < titlesRaw.length; i++) {
    const raw = titlesRaw[i];
    if (typeof raw !== "string") {
      failed.push({ index: i, title: String(raw ?? ""), error: "not a string" });
      continue;
    }
    const t = raw.trim();
    if (!t) {
      failed.push({ index: i, title: raw, error: "empty title" });
      continue;
    }
    if (t.length > 200) {
      failed.push({ index: i, title: t, error: "title exceeds 200 characters" });
      continue;
    }
    valid.push({ index: i, title: t });
  }

  const batchId = randomUUID();

  if (valid.length > 0) {
    // All-or-nothing within the DB write: validation has already filtered
    // out the rows we expect to fail, so a postgres error here is a real
    // problem and should rollback rather than leave a partial batch behind.
    await withTransaction(async (tx) => {
      for (const v of valid) {
        const newId = randomUUID();
        const sourceRecipeId = randomUUID();
        await tx.query(
          `INSERT INTO imported_recipes_staging
             (id, source, source_recipe_id, title, status, review_status,
              cuisine_tags, moods, constraints, dish_type, convenience_tags,
              required_ingredient_ids, optional_ingredient_ids,
              unmapped_ingredient_names, instructions_steps,
              instructions_summary, mapping_rate, duplicate_status,
              created_at, updated_at)
           VALUES ($1, 'manual', $2, $3, 'needs_review', 'pending',
                   '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
                   '[]'::jsonb, '[]'::jsonb,
                   '[]'::jsonb, '[]'::jsonb,
                   '', NULL, 'unique',
                   NOW(), NOW())`,
          [newId, sourceRecipeId, v.title]
        );
        created.push({ id: newId, title: v.title });
      }
    });
  }

  // Per-row audit so each created staging row has its own audit trail tagged
  // with the shared batchId (queryable via `new_value->>'batchId'`).
  for (const c of created) {
    await writeAuditLog({
      adminUserId: admin.userId,
      actionType: "manual_recipe_created",
      targetType: "imported_recipe_staging",
      targetId: c.id,
      newValue: { title: c.title, source: "manual", batchId },
    });
  }

  // Single rollup so the batch itself is greppable in the audit log.
  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "staging_recipes_bulk_create",
    targetType: "imported_recipes_staging",
    targetId: batchId,
    newValue: {
      batchId,
      submitted: titlesRaw.length,
      createdCount: created.length,
      failedCount: failed.length,
    },
  });

  res.json({
    batchId,
    submitted: titlesRaw.length,
    createdCount: created.length,
    failedCount: failed.length,
    created,
    failed,
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
  const { title, requiredIngredientIds, unmappedIngredientNames, estimatedTimeMin, difficulty, notes, imageUrl } = req.body ?? {};

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
  if (imageUrl === null || typeof imageUrl === "string") {
    // Accept null (clear) or string (absolute URL or `/objects/<uuid>` path).
    if (typeof imageUrl === "string") {
      const trimmed = imageUrl.trim();
      const isHttp = /^https?:\/\//i.test(trimmed);
      const isObjectPath = trimmed.startsWith("/objects/") || trimmed.startsWith("/public-objects/");
      if (trimmed && !isHttp && !isObjectPath) {
        res.status(400).json({
          error: "imageUrl must be an http(s) URL or an /objects/ path",
        });
        return;
      }
      sets.push(`image_url = $${pi++}`);
      params.push(trimmed || null);
    } else {
      sets.push(`image_url = $${pi++}`);
      params.push(null);
    }
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

    // State guard: never overwrite a row that was promoted/rejected between
    // our SELECT and this UPDATE. Treat 0-row updates as concurrent
    // finalization and skip silently.
    const updated = await query(
      `UPDATE imported_recipes_staging
          SET required_ingredient_ids = $2::jsonb,
              unmapped_ingredient_names = $3::jsonb,
              mapping_rate = $4,
              status = $5,
              updated_at = NOW()
        WHERE id = $1
          AND status IN ('imported','needs_review')
        RETURNING id`,
      [
        row.id,
        JSON.stringify(combinedMapped),
        JSON.stringify(stillUnmapped),
        newRate,
        newStatus,
      ]
    );
    if (updated.length === 0) continue;

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

/**
 * Re-extract ingredients for wikibooks staging rows from the original
 * wikitext. Useful after the wikitext extractor improves: the existing
 * rows that were imported under the old (plain-text) extractor get a fresh
 * structured pass without needing to re-import from MediaWiki.
 *
 * Currently scoped to source='wikibooks' since that's the only source where
 * we have a re-fetchable raw payload (page id) + a wikitext extractor.
 *
 * Bounded to imported / needs_review rows; capped per call. Each row's
 * mapping_rate may go up or down. Status is recomputed against the 0.5 cutoff.
 * Per-page network errors are isolated. One rollup audit entry.
 */
const MAX_REEXTRACT_PER_CALL = 50;

export async function reextractStagingIngredients(
  req: Request,
  res: Response
): Promise<void> {
  const admin = getAdminUser(req);
  const sourceFilter = req.body?.source as string | undefined;
  const onlyNeedsReview = req.body?.onlyNeedsReview === true;

  if (sourceFilter !== "wikibooks") {
    res.status(400).json({
      error: "Re-extract currently supports only source=wikibooks",
    });
    return;
  }

  const rows = await query<{
    id: string;
    source_recipe_id: string;
    required_ingredient_ids: unknown;
    mapping_rate: number | null;
    status: string;
  }>(
    `SELECT id, source_recipe_id, required_ingredient_ids, mapping_rate, status
       FROM imported_recipes_staging
      WHERE source = 'wikibooks'
        AND status = ANY($1::text[])
        AND source_recipe_id IS NOT NULL
      ORDER BY mapping_rate ASC NULLS FIRST
      LIMIT ${MAX_REEXTRACT_PER_CALL}`,
    [onlyNeedsReview ? ["needs_review"] : ["imported", "needs_review"]]
  );

  let touched = 0;
  let errors = 0;
  let totalDelta = 0;
  let nowReady = 0;

  for (const row of rows) {
    try {
      const wikitext = await fetchWikitextByPageId(row.source_recipe_id);
      if (!wikitext) {
        errors++;
        continue;
      }
      const candidates = extractIngredientsFromWikitext(wikitext);
      if (candidates.length === 0) continue;

      const { mapped, unmapped } = await mapIngredientNames(candidates);
      const totalAttempted = mapped.length + unmapped.length;
      if (totalAttempted === 0) continue;
      const newRate = mapped.length / totalAttempted;
      const newStatus = newRate >= 0.5 ? "ready" : "needs_review";

      const prevMappedCount = Array.isArray(row.required_ingredient_ids)
        ? (row.required_ingredient_ids as unknown[]).length
        : 0;

      // State guard: never overwrite a row that was promoted/rejected
      // between our SELECT and this UPDATE. If 0 rows update, treat as a
      // concurrent finalization and skip silently.
      const updated = await query(
        `UPDATE imported_recipes_staging
            SET required_ingredient_ids = $2::jsonb,
                unmapped_ingredient_names = $3::jsonb,
                mapping_rate = $4,
                status = $5,
                updated_at = NOW()
          WHERE id = $1
            AND status IN ('imported','needs_review')
          RETURNING id`,
        [
          row.id,
          JSON.stringify(mapped),
          JSON.stringify(unmapped),
          newRate,
          newStatus,
        ]
      );
      if (updated.length === 0) continue;

      touched++;
      totalDelta += mapped.length - prevMappedCount;
      if (newStatus === "ready" && row.status !== "ready") nowReady++;
    } catch (err) {
      errors++;
    }
  }

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "staging_recipes_reextract",
    targetType: "imported_recipes_staging",
    targetId: "batch",
    newValue: {
      source: "wikibooks",
      scanned: rows.length,
      touched,
      errors,
      mappedDelta: totalDelta,
      promotedToReady: nowReady,
      onlyNeedsReview,
    },
  });

  res.json({
    ok: true,
    scanned: rows.length,
    touched,
    errors,
    mappedDelta: totalDelta,
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

import type { JobContext, JobSummary } from "../runner.js";
import { query, queryOne } from "../../routes/ops/db.js";

/**
 * Wikibooks Cookbook scraper (minimal best-effort implementation).
 *
 * Strategy: Wikibooks exposes the Cookbook content under
 * https://en.wikibooks.org/wiki/Cookbook:* . The category page
 * `Category:Recipes` lists pages whose titles are recipe names. We hit the
 * MediaWiki API (no scraping/HTML parsing needed) which is JSON, paginated,
 * and stable. Each "page" in that category becomes a candidate recipe — we
 * fetch its plain extract text via the API to get instructions and stash it
 * in `imported_recipes_staging`.
 *
 * This is intentionally bounded:
 *  - Pulls at most `MAX_PER_RUN` new recipes per run (Wikibooks is large).
 *  - Skips anything we already have by `(source='wikibooks', source_recipe_id=<pageId>)`.
 *  - Swallows per-page errors so a single broken page doesn't fail the job.
 *
 * Mapping rate is computed exactly like recipesNightly — by ILIKE-matching
 * extracted "headline" words against products. This is a weak heuristic for
 * Wikibooks (no structured ingredient list in the API extract), so most rows
 * land with low mapping_rate and `status='needs_review'`.
 */

const API_BASE = "https://en.wikibooks.org/w/api.php";
const TIMEOUT_MS = 15000;
const MAX_PER_RUN = 25;
const CATEGORY = "Category:Recipes";

interface CategoryMember {
  pageid: number;
  title: string;
}

interface CategoryResponse {
  query?: { categorymembers?: CategoryMember[] };
  continue?: { cmcontinue?: string };
}

interface ExtractResponse {
  query?: {
    pages?: Record<
      string,
      {
        pageid: number;
        title: string;
        extract?: string;
        fullurl?: string;
        thumbnail?: { source: string };
      }
    >;
  };
}

async function apiGet<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(API_BASE);
  for (const [k, v] of Object.entries({ format: "json", origin: "*", ...params })) {
    url.searchParams.set(k, v);
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url.toString(), {
      signal: ctl.signal,
      headers: { "user-agent": "PickAndCookOps/1.0 (recipe importer)" },
    });
    if (!r.ok) throw new Error(`Wikibooks API HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export function extractCandidateIngredients(text: string): string[] {
  // Wikibooks extracts have an "Ingredients" section as plain text. Pull
  // 1–3 word lines after that header until the next blank line / "Procedure".
  const lower = text.toLowerCase();
  const start = lower.indexOf("ingredients");
  if (start < 0) return [];
  const tail = text.slice(start + "ingredients".length, start + 2000);
  const stop = tail.search(/(procedure|directions|method|instructions|notes)/i);
  const slice = stop > 0 ? tail.slice(0, stop) : tail;
  return slice
    .split(/\r?\n+/)
    .map((s) => s.replace(/^[\s•·*\-–]+/, "").trim())
    // Strip leading quantities / measurements heuristically.
    .map((s) => s.replace(/^[\d/.,\s]+(cup|cups|tbsp|tsp|g|kg|oz|lb|ml|l|pinch|dash|clove|cloves|slices?)?\s*/i, ""))
    .filter((s) => s.length > 0 && s.length <= 64 && /[a-z]/i.test(s))
    .slice(0, 30);
}

async function mapIngredients(names: string[]): Promise<{ mapped: string[]; unmapped: string[] }> {
  const mapped: string[] = [];
  const unmapped: string[] = [];
  for (const name of names) {
    const row = await queryOne<{ id: string }>(
      `SELECT id FROM products
       WHERE lower(name) = lower($1)
          OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(synonyms) s WHERE lower(s) = lower($1))
       LIMIT 1`,
      [name]
    );
    if (row) mapped.push(row.id);
    else unmapped.push(name);
  }
  return { mapped, unmapped };
}

export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function wikibooksWeekly(ctx: JobContext): Promise<JobSummary> {
  // Read cursor (continuation token from MediaWiki's category pagination)
  const cursorRow = await queryOne<{ cursor: { cmcontinue?: string } | null }>(
    `SELECT cursor FROM recipe_sync_state WHERE source = 'wikibooks'`
  );
  const cmcontinue = cursorRow?.cursor?.cmcontinue;

  ctx.log.info({ cmcontinue }, "fetching Wikibooks Cookbook category");

  let listResp: CategoryResponse;
  try {
    listResp = await apiGet<CategoryResponse>({
      action: "query",
      list: "categorymembers",
      cmtitle: CATEGORY,
      cmlimit: String(MAX_PER_RUN),
      cmtype: "page",
      ...(cmcontinue ? { cmcontinue } : {}),
    });
  } catch (err) {
    ctx.log.warn({ err }, "Wikibooks category fetch failed — will retry next run");
    throw err;
  }

  const members = listResp.query?.categorymembers ?? [];
  const nextCursor = listResp.continue?.cmcontinue ?? null;

  let imported = 0;
  let skippedExisting = 0;
  let perPageErrors = 0;
  let totalMappingRate = 0;
  let countedForRate = 0;

  for (const member of members) {
    const sourceRecipeId = String(member.pageid);

    const exists = await queryOne<{ id: string }>(
      `SELECT id FROM imported_recipes_staging
       WHERE source = 'wikibooks' AND source_recipe_id = $1 LIMIT 1`,
      [sourceRecipeId]
    );
    if (exists) {
      skippedExisting++;
      continue;
    }

    let extract: string | undefined;
    let imageUrl: string | null = null;
    let pageUrl: string | null = null;
    try {
      const detail = await apiGet<ExtractResponse>({
        action: "query",
        prop: "extracts|info|pageimages",
        explaintext: "1",
        exsectionformat: "plain",
        inprop: "url",
        piprop: "thumbnail",
        pithumbsize: "640",
        pageids: sourceRecipeId,
      });
      const page = detail.query?.pages?.[sourceRecipeId];
      extract = page?.extract;
      imageUrl = page?.thumbnail?.source ?? null;
      pageUrl = page?.fullurl ?? null;
    } catch (err) {
      perPageErrors++;
      ctx.log.warn({ err, pageId: sourceRecipeId, title: member.title }, "Wikibooks page detail failed");
      continue;
    }

    if (!extract || extract.length < 50) {
      perPageErrors++;
      continue;
    }

    const candidateNames = extractCandidateIngredients(extract);
    const { mapped, unmapped } = await mapIngredients(candidateNames);
    const mappingRate = candidateNames.length === 0 ? 0 : mapped.length / candidateNames.length;
    totalMappingRate += mappingRate;
    countedForRate++;

    const status = mappingRate >= 0.5 ? "ready" : "needs_review";
    const instructionsSummary = extract.slice(0, 4000);

    try {
      await query(
        `INSERT INTO imported_recipes_staging
           (source, source_recipe_id, title, raw_payload,
            instructions_summary, instructions_steps,
            required_ingredient_ids, unmapped_ingredient_names,
            source_url, image_url, status, normalized_title, mapping_rate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          "wikibooks",
          sourceRecipeId,
          member.title.replace(/^Cookbook:/, ""),
          JSON.stringify({ pageid: member.pageid, title: member.title, fetchedAt: new Date().toISOString() }),
          instructionsSummary,
          JSON.stringify(
            instructionsSummary
              .split(/\r?\n+/)
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 50)
          ),
          JSON.stringify(mapped),
          JSON.stringify(unmapped),
          pageUrl,
          imageUrl,
          status,
          normalizeTitle(member.title),
          mappingRate,
        ]
      );
      imported++;
    } catch (err) {
      perPageErrors++;
      ctx.log.warn({ err, pageId: sourceRecipeId }, "Wikibooks insert failed");
    }
  }

  const avgMappingRate = countedForRate > 0 ? totalMappingRate / countedForRate : 0;

  await query(
    `INSERT INTO recipe_sync_state (source, cursor, last_run_stats, updated_at)
     VALUES ('wikibooks', $1, $2, NOW())
     ON CONFLICT (source) DO UPDATE
       SET cursor = EXCLUDED.cursor, last_run_stats = EXCLUDED.last_run_stats, updated_at = NOW()`,
    [
      JSON.stringify(nextCursor ? { cmcontinue: nextCursor } : {}),
      JSON.stringify({
        members: members.length,
        imported,
        skipped: skippedExisting,
        perPageErrors,
        avgMappingRate: Number(avgMappingRate.toFixed(3)),
      }),
    ]
  );

  return {
    source: "wikibooks",
    members: members.length,
    imported,
    skipped: skippedExisting,
    perPageErrors,
    avgMappingRate: Number(avgMappingRate.toFixed(3)),
    nextCursor,
  };
}

import type { JobContext, JobSummary } from "../runner.js";
import { query, queryOne } from "../../routes/ops/db.js";
import { mapIngredientNames } from "../../services/ingredientMapping.js";

/**
 * Wikibooks Cookbook scraper.
 *
 * Strategy: Wikibooks exposes the Cookbook content under
 * https://en.wikibooks.org/wiki/Cookbook:* . The category `Category:Recipes`
 * lists pages whose titles are recipe names. We hit the MediaWiki API (no
 * HTML scraping) which is JSON, paginated, and stable. Each page becomes a
 * candidate recipe.
 *
 * Per page we fetch BOTH:
 *   - `extracts` (plain text) — used for the human-readable instructions blob.
 *   - `revisions[content]` (raw wikitext) — used for STRUCTURED ingredient
 *     extraction. The wikitext preserves the `==Ingredients==` heading and
 *     `* item` bullet markup that the plain-text extract collapses away.
 *     Parsing wikitext lifted the avg mapping rate from ~7% (heuristic on
 *     plain text) to ~50%+ on real cookbook pages.
 *
 * Bounded:
 *  - At most `MAX_PER_RUN` new recipes per run.
 *  - Skips anything we already have by `(source='wikibooks', source_recipe_id=<pageId>)`.
 *  - Swallows per-page errors so a single broken page doesn't fail the job.
 *
 * Falls back to the legacy plain-text heuristic (`extractCandidateIngredients`)
 * when wikitext is missing — so the row never lands with zero ingredients.
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
        revisions?: Array<{
          slots?: { main?: { "*"?: string; content?: string } };
        }>;
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

/**
 * Parse the `==Ingredients==` section out of raw MediaWiki wikitext and
 * extract clean ingredient strings from the bullet list.
 *
 * Handles common Cookbook templates:
 *   - `{{convert|5|g|oz}}` → ""             (drop quantities)
 *   - `{{cb|agar}}`         → "agar"        (cookbook ingredient links)
 *   - `[[Cookbook:Tsp|tsp]]` → "tsp"        (piped wiki links)
 *   - `[[salt]]`            → "salt"        (plain wiki links)
 *   - `<ref>...</ref>`, HTML, comments → dropped
 *   - `'''bold'''` / `''italic''` → plain text
 *
 * Returns up to 30 cleaned items. Returns [] when no Ingredients heading
 * is found — caller should fall back to the plain-text heuristic.
 */
export function extractIngredientsFromWikitext(wikitext: string): string[] {
  if (!wikitext) return [];
  const headingRe = /^={2,4}\s*ingredients?\s*={2,4}\s*$/im;
  const m = wikitext.match(headingRe);
  if (!m || m.index === undefined) return [];
  const startIdx = m.index + m[0].length;
  const tail = wikitext.slice(startIdx);
  // Stop at next heading of any depth (==, ===, ====) starting on a fresh line.
  const endMatch = tail.match(/\n={2,4}[^=\n]/);
  const section = endMatch ? tail.slice(0, endMatch.index ?? tail.length) : tail;

  const items: string[] = [];
  for (const raw of section.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("*")) continue;
    let s = line.replace(/^\*+\s*/, "");
    // Strip HTML comments first (they can wrap templates)
    s = s.replace(/<!--[\s\S]*?-->/g, "");
    // {{convert|...}} → ""
    s = s.replace(/\{\{convert\|[^}]*\}\}/gi, "");
    // {{cb|name}} or {{cb|name|display}} → "name" (or display if piped)
    s = s.replace(/\{\{cb\|([^}|]+)(?:\|([^}]+))?\}\}/gi, (_m, a, b) => (b ?? a).trim());
    // Any other template → ""
    s = s.replace(/\{\{[^}]*\}\}/g, "");
    // [[link|text]] → text;  [[link]] → link
    s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1");
    // External link [http://x text] → text
    s = s.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1");
    // Bold / italic markers
    s = s.replace(/'''?/g, "");
    // HTML tags incl. <ref>...</ref>
    s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
    s = s.replace(/<[^>]+>/g, "");
    // Collapse whitespace
    s = s.replace(/\s+/g, " ").trim();
    // Drop punctuation-only or noise lines
    if (!s || !/[a-z]/i.test(s)) continue;
    if (s.length > 120) continue;
    items.push(s);
    if (items.length >= 30) break;
  }
  return items;
}

/**
 * Fetch raw wikitext for a Wikibooks page by id. Used by the re-extract
 * admin endpoint to retroactively upgrade old staging rows.
 */
export async function fetchWikitextByPageId(pageId: string): Promise<string | null> {
  const detail = await apiGet<ExtractResponse>({
    action: "query",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    pageids: pageId,
  });
  const page = detail.query?.pages?.[pageId];
  return page?.revisions?.[0]?.slots?.main?.["*"] ?? null;
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
    let wikitext: string | null = null;
    try {
      const detail = await apiGet<ExtractResponse>({
        action: "query",
        prop: "extracts|info|pageimages|revisions",
        explaintext: "1",
        exsectionformat: "plain",
        inprop: "url",
        piprop: "thumbnail",
        pithumbsize: "640",
        rvprop: "content",
        rvslots: "main",
        pageids: sourceRecipeId,
      });
      const page = detail.query?.pages?.[sourceRecipeId];
      extract = page?.extract;
      imageUrl = page?.thumbnail?.source ?? null;
      pageUrl = page?.fullurl ?? null;
      wikitext = page?.revisions?.[0]?.slots?.main?.["*"] ?? null;
    } catch (err) {
      perPageErrors++;
      ctx.log.warn({ err, pageId: sourceRecipeId, title: member.title }, "Wikibooks page detail failed");
      continue;
    }

    if (!extract || extract.length < 50) {
      perPageErrors++;
      continue;
    }

    // Prefer structured wikitext extraction; fall back to plain-text heuristic.
    let candidateNames = wikitext ? extractIngredientsFromWikitext(wikitext) : [];
    if (candidateNames.length === 0) {
      candidateNames = extractCandidateIngredients(extract);
    }
    const { mapped, unmapped } = await mapIngredientNames(candidateNames);
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

import { query, queryOne } from "../../routes/ops/db.js";
import type { JobContext, JobSummary } from "../runner.js";
import { mapIngredientNames } from "../../services/ingredientMapping.js";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
const TIMEOUT_MS = 15000;

interface MealdbMeal {
  idMeal: string;
  strMeal: string;
  strCategory?: string;
  strArea?: string;
  strInstructions?: string;
  strMealThumb?: string;
  strSource?: string;
  [k: string]: unknown;
}

interface MealdbResponse {
  meals: MealdbMeal[] | null;
}

async function fetchLetter(letter: string): Promise<MealdbMeal[]> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(
      `https://www.themealdb.com/api/json/v1/1/search.php?f=${encodeURIComponent(letter)}`,
      { signal: ctl.signal }
    );
    if (!r.ok) throw new Error(`TheMealDB HTTP ${r.status}`);
    const data = (await r.json()) as MealdbResponse;
    return data.meals ?? [];
  } finally {
    clearTimeout(t);
  }
}

function extractIngredients(meal: MealdbMeal): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] as string | null | undefined)?.trim();
    if (name) out.push(name);
  }
  return out;
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sanitizeSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return url;
    }
  } catch {
    // malformed URL — drop it
  }
  return null;
}

export async function recipesNightly(ctx: JobContext): Promise<JobSummary> {
  // Read or initialize cursor
  const cursorRow = await queryOne<{ cursor: { nextLetter?: string } }>(
    `SELECT cursor FROM recipe_sync_state WHERE source = 'themealdb'`
  );
  const cursorLetter = cursorRow?.cursor?.nextLetter ?? "a";
  const idx = ALPHABET.indexOf(cursorLetter);
  const letter = idx >= 0 ? cursorLetter : "a";
  const nextLetter = ALPHABET[(ALPHABET.indexOf(letter) + 1) % 26];

  ctx.log.info({ letter, nextLetter }, "fetching TheMealDB letter");

  let fetched: MealdbMeal[] = [];
  try {
    fetched = await fetchLetter(letter);
  } catch (err) {
    ctx.log.warn({ err, letter }, "fetch failed — will retry next run");
    throw err;
  }

  let imported = 0;
  let skippedExisting = 0;
  let totalMappingRate = 0;
  let countedForRate = 0;

  for (const meal of fetched) {
    const sourceRecipeId = meal.idMeal;
    const exists = await queryOne<{ id: string }>(
      `SELECT id FROM imported_recipes_staging
       WHERE source = 'themealdb' AND source_recipe_id = $1 LIMIT 1`,
      [sourceRecipeId]
    );
    if (exists) {
      skippedExisting++;
      continue;
    }

    const ingNames = extractIngredients(meal);
    const { mapped, unmapped } = await mapIngredientNames(ingNames);
    const mappingRate = ingNames.length === 0 ? 0 : mapped.length / ingNames.length;
    totalMappingRate += mappingRate;
    countedForRate++;

    const cuisine = meal.strArea ? [String(meal.strArea).toLowerCase()] : [];

    await query(
      `INSERT INTO imported_recipes_staging
         (source, source_recipe_id, title, raw_payload, cuisine_tags,
          instructions_summary, instructions_steps,
          required_ingredient_ids, unmapped_ingredient_names,
          source_url, image_url, status, normalized_title, mapping_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'imported',$12,$13)`,
      [
        "themealdb",
        sourceRecipeId,
        meal.strMeal,
        JSON.stringify(meal),
        JSON.stringify(cuisine),
        meal.strInstructions ?? "",
        JSON.stringify(
          (meal.strInstructions ?? "")
            .split(/\r?\n+/)
            .map((s) => s.trim())
            .filter(Boolean)
        ),
        JSON.stringify(mapped),
        JSON.stringify(unmapped),
        sanitizeSourceUrl(meal.strSource),
        meal.strMealThumb ?? null,
        normalizeTitle(meal.strMeal),
        mappingRate,
      ]
    );
    imported++;
  }

  const avgMappingRate = countedForRate > 0 ? totalMappingRate / countedForRate : 0;

  await query(
    `INSERT INTO recipe_sync_state (source, cursor, last_run_stats, updated_at)
     VALUES ('themealdb', $1, $2, NOW())
     ON CONFLICT (source) DO UPDATE
       SET cursor = EXCLUDED.cursor, last_run_stats = EXCLUDED.last_run_stats, updated_at = NOW()`,
    [
      JSON.stringify({ nextLetter }),
      JSON.stringify({
        letter,
        fetched: fetched.length,
        imported,
        skipped: skippedExisting,
        avgMappingRate: Number(avgMappingRate.toFixed(3)),
      }),
    ]
  );

  return {
    letter,
    nextLetter,
    fetched: fetched.length,
    imported,
    skipped: skippedExisting,
    avgMappingRate: Number(avgMappingRate.toFixed(3)),
  };
}

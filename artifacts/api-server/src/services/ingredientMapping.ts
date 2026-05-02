import { query } from "../routes/ops/db.js";

/**
 * Shared ingredient → product matcher.
 *
 * Used by both the TheMealDB nightly scraper and the Wikibooks weekly scraper,
 * and by the staging "re-map ingredients" admin action.
 *
 * Why a shared module: previously each handler had its own one-tier
 * `WHERE lower(name) = lower($1)` lookup, which gave a ~7% mapping rate on
 * Wikibooks (free-form ingredient strings like "2 cups all-purpose flour"
 * don't equal the product catalog row "all-purpose flour, enriched"). This
 * module adds (a) a real normaliser that strips quantities, units, prep
 * adjectives and parentheticals, and (b) a word-boundary substring fallback
 * that lets the normalised noun phrase match longer canonical product names.
 */

const MEASURES = [
  "cup", "cups",
  "tbsp", "tbsps", "tablespoon", "tablespoons",
  "tsp", "tsps", "teaspoon", "teaspoons",
  "g", "gram", "grams",
  "kg", "kilogram", "kilograms",
  "oz", "ounce", "ounces",
  "lb", "lbs", "pound", "pounds",
  "ml", "milliliter", "milliliters",
  "l", "liter", "liters", "litre", "litres",
  "pinch", "pinches",
  "dash", "dashes",
  "clove", "cloves",
  "slice", "slices",
  "piece", "pieces",
  "can", "cans",
  "packet", "packets",
  "stick", "sticks",
  "sprig", "sprigs",
  "bunch", "bunches",
  "handful", "handfuls",
  "head", "heads",
  "stalk", "stalks",
];

// Adjectives that describe prep/state but not the ingredient itself.
const DESCRIPTORS = new Set([
  "fresh", "dried", "ground", "whole", "raw", "cooked",
  "chopped", "sliced", "minced", "diced", "grated", "shredded",
  "crushed", "boneless", "skinless", "ripe", "unripe",
  "small", "large", "medium", "extra", "virgin", "organic",
  "frozen", "canned", "smoked", "lean", "thin", "thick",
  "hot", "cold", "warm", "softened", "melted", "beaten",
  "peeled", "trimmed", "rinsed", "drained", "halved", "quartered",
  "young", "old", "stale", "toasted", "roasted", "uncooked",
]);

/**
 * Reduce a free-form ingredient string to a canonical noun phrase suitable
 * for matching against product catalog rows.
 *
 * Examples:
 *   "2 cups all-purpose flour"          -> "all-purpose flour"
 *   "3 tomatoes, diced"                 -> "tomato"
 *   "1 lb boneless skinless chicken"    -> "chicken"
 *   "Salt (to taste)"                   -> "salt"
 *   "Olive oil or vegetable oil"        -> "olive oil"
 */
export function normalizeIngredientName(raw: string): string {
  let s = String(raw ?? "").toLowerCase();

  // Strip parentheticals: "salt (to taste)" -> "salt "
  s = s.replace(/\([^)]*\)/g, " ");

  // Take first alternative if "X or Y": prefer the first noun
  s = s.split(/\s+or\s+/)[0] ?? s;

  // Take first comma-separated chunk: "tomatoes, diced" -> "tomatoes"
  s = s.split(",")[0] ?? s;

  // Strip leading quantity + measure pair, possibly with vulgar fractions
  const measurePattern = MEASURES.join("|");
  const qty = "[\\d/.\\s¼½¾⅓⅔⅛⅜⅝⅞-]+";
  s = s.replace(new RegExp(`^${qty}(?:(?:${measurePattern})\\b\\.?)?\\s*`, "i"), "");

  // Strip any remaining leading numbers / fractions
  s = s.replace(/^[\d/.\s¼½¾⅓⅔⅛⅜⅝⅞-]+/, "");

  // Strip leading descriptors (repeat: "fresh chopped basil" -> "basil")
  let changed = true;
  while (changed) {
    changed = false;
    const m = s.match(/^([a-z-]+)\s+/);
    if (m && DESCRIPTORS.has(m[1]!)) {
      s = s.slice(m[0].length);
      changed = true;
    }
  }

  // Strip trailing modifiers without a comma: "salt to taste"
  s = s.replace(/\s+(to taste|optional|for serving|for garnish|as needed|if desired)$/i, "");

  // Trim & collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  // Strip surrounding punctuation
  s = s.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");

  // Singularize the LAST word.
  //   berries -> berry, tomatoes/potatoes -> tomato/potato,
  //   eggs/oils -> egg/oil. Leave: ss / us / is endings (grass, hummus, basis).
  const words = s.split(" ").filter(Boolean);
  if (words.length > 0) {
    const i = words.length - 1;
    const last = words[i]!;
    if (last.length > 4 && /[^aeiou]ies$/.test(last)) {
      words[i] = last.slice(0, -3) + "y";
    } else if (last.length > 4 && /(?:oes|ses|xes|zes|ches|shes)$/.test(last)) {
      words[i] = last.slice(0, -2);
    } else if (last.length > 3 && /[a-z]s$/.test(last) && !/(?:ss|us|is)$/.test(last)) {
      words[i] = last.slice(0, -1);
    }
  }
  return words.join(" ").trim();
}

export interface IngredientMappingResult {
  mapped: string[];
  unmapped: string[];
}

/**
 * Resolve a list of free-form ingredient names to product IDs.
 *
 * Three-tier strategy per name:
 *   1. Exact case-insensitive match on `products.name` or any synonym
 *   2. Exact match against the normalized noun phrase
 *   3. Word-boundary substring match (PostgreSQL `~ '\\m<word>\\M'`),
 *      tie-broken by shortest product name (favours canonical rows)
 *
 * Tier 3 is gated to normalized forms ≥ 4 chars and ≤ 4 words to avoid
 * the obvious false positives ("salt" matching every "salted X" product).
 */
export async function mapIngredientNames(
  names: string[]
): Promise<IngredientMappingResult> {
  const mapped: string[] = [];
  const unmapped: string[] = [];

  for (const original of names) {
    const trimmed = original.trim();
    if (!trimmed) continue;
    const normalized = normalizeIngredientName(trimmed);
    const canSubstring =
      normalized.length >= 4 && normalized.split(" ").length <= 4;

    // Single round-trip per name. UNION ALL preserves the tier ordering;
    // an outer SELECT picks the best one (lowest tier, then shortest).
    const rows = await query<{ id: string; tier: number; name_len: number }>(
      `WITH candidates AS (
         SELECT id, 1 AS tier, length(name) AS name_len
           FROM products
          WHERE lower(name) = lower($1)
             OR EXISTS (
               SELECT 1 FROM jsonb_array_elements_text(synonyms) s
                WHERE lower(s) = lower($1)
             )
         UNION ALL
         SELECT id, 2 AS tier, length(name)
           FROM products
          WHERE $2 <> ''
            AND ( lower(name) = $2
                  OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements_text(synonyms) s
                     WHERE lower(s) = $2
                  ))
         UNION ALL
         SELECT id, 3 AS tier, length(name)
           FROM products
          WHERE $3
            AND $2 <> ''
            AND lower(name) ~ ('\\m' || $2 || '\\M')
       )
       SELECT id, tier, name_len
         FROM candidates
        ORDER BY tier ASC, name_len ASC
        LIMIT 1`,
      [trimmed, normalized, canSubstring]
    );

    if (rows.length > 0) {
      mapped.push(rows[0]!.id);
    } else {
      unmapped.push(trimmed);
    }
  }

  return { mapped, unmapped };
}

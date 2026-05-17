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

  // "1 head of cauliflower" → "head" gets eaten by the measure step above,
  // leaving "of cauliflower". Drop the connector so the descriptor loop
  // and singularizer see the real noun phrase.
  s = s.replace(/^of\s+/, "");

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

// ── Natural-language ingredient extraction (task #32) ────────────────────

/**
 * Keywords that, when present in the same sentence as an ingredient mention,
 * push that candidate into the "optional" bucket (garnish, to-taste, etc.).
 * Matched case-insensitively as whole-word/phrase substrings on the
 * containing sentence.
 */
const OPTIONAL_KEYWORDS = [
  "garnish",
  "to taste",
  "for serving",
  "for garnish",
  "optional",
  "sprinkle",
  "as needed",
  "if desired",
  "topping",
  "to top",
];

/**
 * Numeric tokens that introduce an ingredient mention. Matches plain
 * integers, decimals, simple fractions (`1/2`), ranges (`2-3`), and the
 * common vulgar fractions. The `g` flag lets the caller iterate over all
 * mentions in a sentence.
 */
const QTY_TOKEN_RE =
  /(\d+(?:[/.]\d+)?(?:\s*-\s*\d+(?:[/.]\d+)?)?|[¼½¾⅓⅔⅛⅜⅝⅞])/g;

/**
 * A quantity-led chunk whose payload is actually a temperature, time, or
 * yield count rather than an ingredient. We skip these instead of feeding
 * them to the normaliser (which would otherwise emit "minutes", "degrees",
 * etc. as candidate names).
 */
const NON_INGREDIENT_QTY_RE =
  /^\s*(?:\d+(?:[/.]\d+)?(?:\s*-\s*\d+(?:[/.]\d+)?)?|[¼½¾⅓⅔⅛⅜⅝⅞])\s*(?:°|degrees?\b|°?[fc]\b|deg\b|minutes?\b|mins?\b|hours?\b|hrs?\b|seconds?\b|secs?\b|servings?\b|people\b|portions?\b|inch(?:es)?\b|cm\b|mm\b)/i;

/** Sentence splitter — handles `.`, `!`, `;`, and newlines. */
function splitSentences(text: string): string[] {
  return text
    .split(/[.!;\n]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sentenceIsOptional(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return OPTIONAL_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Given a sentence, slice out one chunk per quantity-led ingredient mention.
 * A chunk runs from the quantity start to the nearest of: the next
 * quantity, a coordinating conjunction (`and`/`then`), or a comma/colon.
 * The chunks are then handed to `normalizeIngredientName` which already
 * knows how to strip units, parentheticals, and prep adjectives.
 */
function chunksFromSentence(sentence: string): string[] {
  const positions: number[] = [];
  QTY_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QTY_TOKEN_RE.exec(sentence))) positions.push(m.index);

  const out: string[] = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i]!;
    const nextQty = positions[i + 1] ?? sentence.length;
    const slice = sentence.slice(start, nextQty);
    // Find first conjunction or comma within the slice
    const conjMatch = slice.match(/\s+(?:and|then|plus|or)\s+/i);
    const commaMatch = slice.match(/[,:]/);
    // Stop the chunk when the ingredient noun is clearly over and a
    // procedural preposition begins ("…in a wok", "…on top", "…over rice").
    // Without this, "2 tbsp vegetable oil in a wok" normalises to "vegetable
    // oil in a wok" instead of "vegetable oil".
    const prepMatch = slice
      .slice(1) // skip the quantity digit itself
      .match(/\s+(?:in|into|on|onto|over|under|with|from|until|atop)\s+/i);
    const stops: number[] = [];
    if (conjMatch?.index !== undefined) stops.push(conjMatch.index);
    if (commaMatch?.index !== undefined) stops.push(commaMatch.index);
    if (prepMatch?.index !== undefined) stops.push(prepMatch.index + 1);
    const end = stops.length > 0 ? Math.min(...stops) : slice.length;
    const chunk = slice.slice(0, end).trim();
    if (!chunk) continue;
    if (NON_INGREDIENT_QTY_RE.test(chunk)) continue;
    out.push(chunk);
  }
  return out;
}

/**
 * Catch the common no-quantity mentions that still clearly name an
 * ingredient: "salt and pepper to taste", "cilantro for garnish",
 * "lime wedges for serving". We bound the captured phrase to ≤4 words to
 * keep false positives down — longer matches are almost always procedural.
 */
const NO_QTY_OPTIONAL_RE =
  /(?:^|[.,;]|\band\b|\bor\b|\bwith\b)\s*([a-z][a-z\s-]{1,40}?)\s+(?:to\s+taste|for\s+garnish|for\s+serving|as\s+needed|if\s+desired)\b/gi;

export interface IngredientCandidate {
  /** Normalised noun phrase (post-`normalizeIngredientName`). */
  phrase: string;
  /** True if the source sentence contained an optional-context keyword. */
  optional: boolean;
}

/**
 * Read free-form recipe instructions text and emit candidate ingredient
 * phrases, each tagged required vs optional. Used by the Recipe detail
 * page's "Auto-extract from instructions" preview endpoint (task #32).
 *
 *  - Inputs are the dashboard's `instructionsSummary` plus each
 *    `instructionsSteps` entry — both are scanned and merged.
 *  - Quantity-led extraction handles the bulk: "2 cups flour, 1/2 tsp
 *    salt" → ["flour", "salt"].
 *  - A second pass catches no-quantity mentions qualified by garnish /
 *    to-taste / for-serving wording.
 *  - Candidates are deduplicated by normalised phrase. If the same name
 *    appears once as required and once as optional, required wins (a
 *    measured ingredient outranks a sprinkle).
 *
 * The output feeds straight into `mapIngredientNames`.
 */
export function extractIngredientCandidates(
  summary: string,
  steps: string[]
): IngredientCandidate[] {
  const sources: string[] = [];
  if (summary) sources.push(summary);
  for (const s of steps ?? []) {
    if (typeof s === "string" && s.trim()) sources.push(s);
  }

  // phrase -> optional flag (true if every occurrence was optional)
  const byPhrase = new Map<string, boolean>();

  function record(phrase: string, optional: boolean) {
    const normalised = normalizeIngredientName(phrase);
    if (!normalised || normalised.length < 2) return;
    if (byPhrase.has(normalised)) {
      // If we've ever seen this phrase as required, keep it required.
      const prev = byPhrase.get(normalised)!;
      byPhrase.set(normalised, prev && optional);
    } else {
      byPhrase.set(normalised, optional);
    }
  }

  for (const source of sources) {
    for (const sentence of splitSentences(source)) {
      const optional = sentenceIsOptional(sentence);
      for (const chunk of chunksFromSentence(sentence)) {
        record(chunk, optional);
      }
      // No-quantity optional mentions
      NO_QTY_OPTIONAL_RE.lastIndex = 0;
      let mm: RegExpExecArray | null;
      while ((mm = NO_QTY_OPTIONAL_RE.exec(sentence))) {
        const captured = mm[1]?.trim();
        if (!captured) continue;
        // "salt and pepper to taste" → record salt + pepper separately.
        for (const piece of captured.split(/\s+(?:and|or|with)\s+/i)) {
          const p = piece.trim();
          if (p) record(p, true);
        }
      }
    }
  }

  return Array.from(byPhrase.entries()).map(([phrase, optional]) => ({
    phrase,
    optional,
  }));
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

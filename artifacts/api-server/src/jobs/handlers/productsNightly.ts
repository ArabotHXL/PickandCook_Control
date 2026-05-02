import { query } from "../../routes/ops/db.js";
import type { JobContext, JobSummary } from "../runner.js";

interface LintRow {
  total: string;
  missing_kcal: string;
  missing_allergens: string;
  missing_ingredients_text: string;
  missing_brand: string;
}

interface BackfillRow {
  product_id: string;
  brand: string | null;
  ingredients_text: string | null;
  allergens: unknown;
}

export async function productsNightly(ctx: JobContext): Promise<JobSummary> {
  // ── Lint pass ─────────────────────────────────────────────────────────
  // Lint uses "IS NULL" rather than "= '[]'" for allergens because an empty
  // allergens array means "verified no allergens" (authoritative), not
  // "unknown / needs backfill". Same logic in the backfill query below.
  const lintRows = await query<LintRow>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE COALESCE(kcal,0) = 0)::text AS missing_kcal,
       COUNT(*) FILTER (WHERE allergens IS NULL)::text AS missing_allergens,
       COUNT(*) FILTER (WHERE ingredients_text IS NULL OR ingredients_text = '')::text AS missing_ingredients_text,
       COUNT(*) FILTER (WHERE brand IS NULL OR brand = '')::text AS missing_brand
     FROM products`
  );
  const lint = lintRows[0];
  ctx.log.info({ lint }, "lint complete");

  // ── Backfill pass ─────────────────────────────────────────────────────
  // For each product with a known barcode that has cached data in barcode_meta,
  // copy missing allergens / ingredients_text / brand. We do this in one statement
  // to avoid N+1.
  const candidates = await query<BackfillRow>(
    `SELECT DISTINCT ON (p.id)
            p.id AS product_id,
            bm.brand,
            bm.ingredients_text,
            bm.allergens
     FROM products p
     JOIN product_barcodes pb ON pb.product_id = p.id
     JOIN barcode_meta bm ON bm.barcode = pb.barcode
     WHERE (
       (p.brand IS NULL OR p.brand = '') AND bm.brand IS NOT NULL AND bm.brand <> ''
       OR (p.ingredients_text IS NULL OR p.ingredients_text = '') AND bm.ingredients_text IS NOT NULL AND bm.ingredients_text <> ''
       OR p.allergens IS NULL AND bm.allergens IS NOT NULL AND bm.allergens <> '[]'::jsonb
     )
     ORDER BY p.id, bm.updated_at DESC NULLS LAST
     LIMIT 500`
  );

  let backfilled = 0;
  for (const c of candidates) {
    await query(
      `UPDATE products
       SET
         brand = COALESCE(NULLIF(brand,''), $2),
         ingredients_text = COALESCE(NULLIF(ingredients_text,''), $3),
         allergens = CASE
           WHEN allergens IS NULL AND $4::jsonb IS NOT NULL THEN $4::jsonb
           ELSE allergens
         END
       WHERE id = $1`,
      [
        c.product_id,
        c.brand ?? null,
        c.ingredients_text ?? null,
        c.allergens ? JSON.stringify(c.allergens) : null,
      ]
    );
    backfilled++;
  }

  return {
    lint: {
      total: parseInt(lint?.total ?? "0", 10),
      missingKcal: parseInt(lint?.missing_kcal ?? "0", 10),
      missingAllergens: parseInt(lint?.missing_allergens ?? "0", 10),
      missingIngredientsText: parseInt(lint?.missing_ingredients_text ?? "0", 10),
      missingBrand: parseInt(lint?.missing_brand ?? "0", 10),
    },
    backfill: { scanned: candidates.length, backfilled },
  };
}

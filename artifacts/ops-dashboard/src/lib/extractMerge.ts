/**
 * Pure helper: merge auto-extract picks into the current required/optional
 * ingredient ID lists for the Recipe detail page (task #32).
 *
 * Invariant: STRICTLY ADDITIVE. Every pre-existing ID in `currentRequired`
 * and `currentOptional` is preserved verbatim, even when the same ID also
 * shows up in the picks. Confirming an auto-extract preview must never
 * silently remove anything that was already on the recipe.
 *
 *  - New required picks are skipped if already present in either list.
 *  - New optional picks are skipped if already optional or if they would
 *    duplicate something that is now required (a measured mention wins
 *    over a sprinkle).
 */
export function mergeExtractPicks(
  currentRequired: string[],
  currentOptional: string[],
  picks: { required: string[]; optional: string[] }
): { mergedRequired: string[]; mergedOptional: string[] } {
  const currentReqSet = new Set(currentRequired);
  const currentOptSet = new Set(currentOptional);

  const reqAdditions = picks.required.filter(
    (id) => !currentReqSet.has(id) && !currentOptSet.has(id)
  );
  const mergedRequired = [...currentRequired, ...reqAdditions];

  const reqAfter = new Set(mergedRequired);
  const optAdditions = picks.optional.filter(
    (id) => !currentOptSet.has(id) && !reqAfter.has(id)
  );
  const mergedOptional = [...currentOptional, ...optAdditions];

  return { mergedRequired, mergedOptional };
}

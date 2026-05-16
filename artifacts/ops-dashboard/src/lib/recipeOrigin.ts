/**
 * Recipe origin helpers (task #31).
 *
 * Control imports recipes from a few upstream sources (TheMealDB,
 * Wikibooks, manual creates) but the deployed prod app *also* writes
 * directly to its own `recipes` table for user-driven flows. When prod
 * pushes those rows back to Control via the daily NEON sync they have:
 *   - id matching `/^rec_\d+$/` (prod's serial-id scheme; Control's
 *     imports use slugged/stable ids), and/or
 *   - sourceUrl pointing to `https://culturecook.app/...`.
 *
 * Approving a prod-origin recipe from Control writes a payload that
 * prod would normally reject with `origin_locked`. The Approve flow
 * sets `forceOverrideOrigin: true` on the outbound push so prod accepts
 * the overwrite — but the operator should see the badge first so they
 * know they're rewriting a prod-owned row.
 */
const PROD_ORIGIN_HOSTS = new Set(["culturecook.app", "www.culturecook.app"]);

export function isProdOriginRecipe(recipe: {
  id?: string | null;
  sourceUrl?: string | null;
}): boolean {
  if (recipe.id && /^rec_\d+$/.test(recipe.id)) return true;
  if (recipe.sourceUrl) {
    try {
      const host = new URL(recipe.sourceUrl).host.toLowerCase();
      if (PROD_ORIGIN_HOSTS.has(host)) return true;
    } catch {
      // not a URL — fall through
    }
  }
  return false;
}

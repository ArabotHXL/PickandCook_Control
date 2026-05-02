import type { Request, Response } from "express";
import { query, queryOne } from "./db.js";
import { parseDays } from "./queryParams.js";

function pct(a: number, b: number): number {
  if (b === 0) return 0;
  return Math.round(((a - b) / b) * 100 * 10) / 10;
}

async function countRows(table: string, where = ""): Promise<number> {
  const rows = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM ${table} ${where}`
  );
  return parseInt(rows[0]?.n ?? "0", 10);
}

async function countEvent(eventName: string, since: Date): Promise<number> {
  const rows = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM analytics_events WHERE event = $1 AND created_at >= $2`,
    [eventName, since]
  );
  return parseInt(rows[0]?.n ?? "0", 10);
}

export async function getOverviewMetrics(
  _req: Request,
  res: Response
): Promise<void> {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400_000);
  const d14 = new Date(now.getTime() - 14 * 86400_000);
  const yesterday = new Date(now.getTime() - 86400_000);

  const [
    totalUsers,
    newUsers7d,
    prevNewUsers7d,
    activeUsers7d,
    prevActiveUsers7d,
    pantryItems,
    prevPantryItems,
    cookSessions,
    prevCookSessions,
    savedRecipes,
    recipeViews,
    shoppingActions,
    barcodeScans,
    unknownScans,
    userReports,
    pendingModeration,
  ] = await Promise.all([
    countRows("users"),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM users WHERE created_at >= $1`,
      [d7]
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM users WHERE created_at >= $1 AND created_at < $2`,
      [d14, d7]
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)),
    query<{ n: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS n FROM analytics_events WHERE created_at >= $1`,
      [d7]
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)),
    query<{ n: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS n FROM analytics_events WHERE created_at >= $1 AND created_at < $2`,
      [d14, d7]
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)),
    countRows("pantry_items", "WHERE deleted_at IS NULL"),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM pantry_items WHERE added_at >= $1 AND deleted_at IS NULL`,
      [d7]
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)),
    countRows("cook_sessions"),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM cook_sessions WHERE started_at >= $1`,
      [d7]
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM recipe_saves`
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)).catch(() => 0),
    countEvent("recipe_detail_viewed", d7),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM shopping_items WHERE updated_at >= $1`,
      [d7]
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)),
    countEvent("scan_success", d7),
    countEvent("scan_not_found", d7),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM recipe_reports WHERE status = 'open'`
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)).catch(() => 0),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM abuse_reports WHERE status = 'pending'`
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)).catch(() => 0),
  ]);

  const avgPantryPerUser =
    totalUsers > 0 ? Math.round((pantryItems / totalUsers) * 10) / 10 : 0;

  res.json({
    totalUsers: { label: "Total Users", value: totalUsers },
    newUsers7d: {
      label: "New Users (7d)",
      value: newUsers7d,
      prev: prevNewUsers7d,
      trend: pct(newUsers7d, prevNewUsers7d),
    },
    activeUsers7d: {
      label: "Active Users (7d)",
      value: activeUsers7d,
      prev: prevActiveUsers7d,
      trend: pct(activeUsers7d, prevActiveUsers7d),
    },
    pantryItemsCreated: {
      label: "Pantry Items",
      value: pantryItems,
      prev: prevPantryItems,
    },
    avgPantryItemsPerUser: {
      label: "Avg Pantry / User",
      value: avgPantryPerUser,
    },
    recipeViews: { label: "Recipe Views (7d)", value: recipeViews },
    savedRecipes: { label: "Saved Recipes", value: savedRecipes },
    cookSessions: {
      label: "Cook Sessions",
      value: cookSessions,
      prev: prevCookSessions,
      trend: pct(cookSessions, prevCookSessions),
    },
    shoppingActions: { label: "Shopping Actions (7d)", value: shoppingActions },
    barcodeScans: { label: "Barcode Scans (7d)", value: barcodeScans },
    unknownBarcodeScans: {
      label: "Unknown Barcodes (7d)",
      value: unknownScans,
    },
    userReports: { label: "Open Recipe Reports", value: userReports },
    pendingModeration: {
      label: "Pending Moderation",
      value: pendingModeration,
    },
  });
}

export async function getOpsFunnel(req: Request, res: Response): Promise<void> {
  const days = parseDays(req.query.days, { def: 30, max: 90 });
  const since = new Date(Date.now() - days * 86400_000);

  const [
    signedUp,
    addedPantry,
    viewedRecipe,
    savedOrMissing,
    startedCook,
    completedCook,
    pantryUpdated,
  ] = await Promise.all([
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM users WHERE created_at >= $1`,
      [since]
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)),
    query<{ n: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS n FROM pantry_items WHERE added_at >= $1`,
      [since]
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)),
    query<{ n: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS n FROM analytics_events WHERE event = 'recipe_detail_viewed' AND created_at >= $1`,
      [since]
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)),
    query<{ n: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS n FROM analytics_events WHERE event IN ('recipe_save', 'recipe_missing_items_added') AND created_at >= $1`,
      [since]
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)),
    query<{ n: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS n FROM cook_sessions WHERE started_at >= $1`,
      [since]
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)),
    query<{ n: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS n FROM cook_sessions WHERE status = 'completed' AND started_at >= $1`,
      [since]
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)),
    query<{ n: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS n FROM pantry_deduction_reviews WHERE status = 'confirmed' AND created_at >= $1`,
      [since]
    ).then((r) => parseInt(r[0]?.n ?? "0", 10)),
  ]);

  const counts = [
    signedUp,
    addedPantry,
    viewedRecipe,
    savedOrMissing,
    startedCook,
    completedCook,
    pantryUpdated,
  ];
  const labels = [
    "Signed Up",
    "Added Pantry Item",
    "Viewed Recipe",
    "Saved / Added Missing Items",
    "Started Cook Session",
    "Completed Cook Session",
    "Pantry Updated After Cook",
  ];

  const steps = counts.map((count, i) => {
    const prev = i > 0 ? counts[i - 1] : null;
    const conversionFromPrev =
      prev !== null && prev > 0
        ? Math.round((count / prev) * 1000) / 10
        : null;
    const dropOff =
      prev !== null && prev > 0
        ? Math.round(((prev - count) / prev) * 1000) / 10
        : null;
    return { step: i + 1, label: labels[i], count, conversionFromPrev, dropOff };
  });

  res.json({ steps, days });
}

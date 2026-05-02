import type { Request, Response } from "express";
import { query } from "./db.js";
import { parseLimit, parsePage, parseDays } from "./queryParams.js";

const VIEW_EVENTS: Record<string, string[]> = {
  onboarding: [
    "app_opened",
    "getstarted_shown",
    "getstarted_item_completed",
    "getstarted_all_completed",
    "walkthrough_completed",
  ],
  pantry: [
    "pantry_item_added",
    "pantry_add_from_scan",
    "pantry_add_from_shopping",
    "pantry_deduction_confirmed",
    "pantry_deduction_skipped",
  ],
  recommendation: [
    "recommendation_shown",
    "recommendation_opened",
    "recommendation_impression",
    "recommendation_click",
    "recipe_detail_viewed",
    "recipe_save",
  ],
  shopping: [
    "shopping_item_added",
    "shopping_mark_purchased",
    "purchased_moved_to_pantry",
    "shopping_check_stores_clicked",
    "best_next_buy_click",
  ],
  cook: [
    "cook_started",
    "cook_step_viewed",
    "cook_step_completed",
    "cook_finished",
    "start_cooking",
    "cook_complete",
  ],
  reports: [
    "recipe_user_reported",
    "scan_not_found",
    "nomi_deck_exhausted",
  ],
};

export async function listAnalyticsEvents(req: Request, res: Response): Promise<void> {
  const eventFilter = req.query.event as string | undefined;
  const userId = req.query.userId as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const view = req.query.view as string | undefined;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, { def: 100, max: 200 });
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (eventFilter) {
    conditions.push(`ae.event = $${pi}`);
    params.push(eventFilter);
    pi++;
  }

  if (view && view !== "all" && VIEW_EVENTS[view]) {
    const events = VIEW_EVENTS[view];
    conditions.push(`ae.event = ANY($${pi}::text[])`);
    params.push(events);
    pi++;
  }

  if (userId) {
    conditions.push(`ae.user_id = $${pi}`);
    params.push(userId);
    pi++;
  }

  if (from) {
    conditions.push(`ae.created_at >= $${pi}`);
    params.push(new Date(from + "T00:00:00Z"));
    pi++;
  }

  if (to) {
    conditions.push(`ae.created_at <= $${pi}`);
    params.push(new Date(to + "T23:59:59Z"));
    pi++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [events, countRows] = await Promise.all([
    query<{
      id: string;
      event: string;
      user_id: string | null;
      session_id: string | null;
      properties: unknown;
      created_at: string;
    }>(
      `SELECT ae.id, ae.event, ae.user_id, ae.session_id, ae.properties, ae.created_at
       FROM analytics_events ae
       ${where}
       ORDER BY ae.created_at DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM analytics_events ae ${where}`,
      params
    ),
  ]);

  res.json({
    events: events.map((e) => ({
      id: e.id,
      event: e.event,
      userId: e.user_id,
      sessionId: e.session_id,
      properties: e.properties,
      createdAt: e.created_at,
    })),
    total: parseInt(countRows[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

export async function getAnalyticsSummary(req: Request, res: Response): Promise<void> {
  const days = parseDays(req.query.days, { def: 7, max: 90 });
  const since = new Date(Date.now() - days * 86400_000);

  const [topEvents, totals] = await Promise.all([
    query<{ event: string; count: string }>(
      `SELECT event, COUNT(*)::text AS count
       FROM analytics_events
       WHERE created_at >= $1
       GROUP BY event
       ORDER BY count DESC
       LIMIT 20`,
      [since]
    ),
    query<{ total: string; unique_users: string }>(
      `SELECT COUNT(*)::text AS total, COUNT(DISTINCT user_id)::text AS unique_users
       FROM analytics_events
       WHERE created_at >= $1`,
      [since]
    ),
  ]);

  res.json({
    topEvents: topEvents.map((e) => ({
      event: e.event,
      count: parseInt(e.count, 10),
    })),
    totalEvents: parseInt(totals[0]?.total ?? "0", 10),
    uniqueUsers: parseInt(totals[0]?.unique_users ?? "0", 10),
    days,
  });
}

import type { Request, Response } from "express";
import { query } from "./db.js";
import { parseLimit } from "./queryParams.js";

export async function getUserTimeline(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;
  const limit = parseLimit(req.query.limit, { def: 100, max: 200 });

  // Pull from BOTH event tables and merge in app-layer.
  const [richEvents, analyticsEvents] = await Promise.all([
    query<{
      id: string;
      event_name: string;
      event_category: string;
      object_type: string | null;
      object_id: string | null;
      metadata: unknown;
      created_at: string;
    }>(
      `SELECT id, event_name, event_category, object_type, object_id, metadata, created_at
         FROM user_events
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, limit]
    ),
    query<{
      id: string;
      event: string;
      properties: unknown;
      created_at: string;
    }>(
      `SELECT id, event, properties, created_at
         FROM analytics_events
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, limit]
    ),
  ]);

  const merged = [
    ...richEvents.map((e) => ({
      id: e.id,
      source: "user_events" as const,
      eventName: e.event_name,
      eventCategory: e.event_category,
      objectType: e.object_type,
      objectId: e.object_id,
      metadata: e.metadata ?? null,
      createdAt: e.created_at,
    })),
    ...analyticsEvents.map((e) => ({
      id: e.id,
      source: "analytics_events" as const,
      eventName: e.event,
      eventCategory: "analytics",
      objectType: null,
      objectId: null,
      metadata: e.properties ?? null,
      createdAt: e.created_at,
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);

  res.json({ events: merged, total: merged.length });
}

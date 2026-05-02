import type { Request, Response } from "express";
import { query } from "./db.js";

export async function getSearchSummary(req: Request, res: Response): Promise<void> {
  const days = Math.max(1, Math.min(90, parseInt(String(req.query.days ?? "30"), 10)));
  const since = new Date(Date.now() - days * 86400_000);

  const [byType, topQueries, zeroResultQueries, totals] = await Promise.all([
    query<{ search_type: string; n: string; avg_results: string; avg_duration: string }>(
      `SELECT search_type,
              COUNT(*)::text AS n,
              COALESCE(AVG(result_count), 0)::text AS avg_results,
              COALESCE(AVG(duration_ms), 0)::text AS avg_duration
         FROM search_events
        WHERE created_at >= $1
        GROUP BY search_type
        ORDER BY COUNT(*) DESC`,
      [since]
    ),
    query<{ query: string; search_type: string; n: string; avg_results: string }>(
      `SELECT query, search_type, COUNT(*)::text AS n,
              COALESCE(AVG(result_count), 0)::text AS avg_results
         FROM search_events
        WHERE created_at >= $1 AND query <> ''
        GROUP BY query, search_type
        ORDER BY COUNT(*) DESC
        LIMIT 25`,
      [since]
    ),
    query<{ query: string; search_type: string; n: string }>(
      `SELECT query, search_type, COUNT(*)::text AS n
         FROM search_events
        WHERE created_at >= $1 AND COALESCE(result_count, 0) = 0 AND query <> ''
        GROUP BY query, search_type
        ORDER BY COUNT(*) DESC
        LIMIT 15`,
      [since]
    ),
    query<{ total: string; unique_users: string; zero: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(DISTINCT user_id)::text AS unique_users,
              COUNT(*) FILTER (WHERE COALESCE(result_count, 0) = 0)::text AS zero
         FROM search_events
        WHERE created_at >= $1`,
      [since]
    ),
  ]);

  res.json({
    days,
    totals: {
      total: parseInt(totals[0]?.total ?? "0", 10),
      uniqueUsers: parseInt(totals[0]?.unique_users ?? "0", 10),
      zeroResults: parseInt(totals[0]?.zero ?? "0", 10),
      zeroResultRate:
        parseInt(totals[0]?.total ?? "0", 10) > 0
          ? Math.round(
              (parseInt(totals[0]?.zero ?? "0", 10) /
                parseInt(totals[0]?.total ?? "1", 10)) *
                1000
            ) / 10
          : 0,
    },
    byType: byType.map((r) => ({
      searchType: r.search_type,
      count: parseInt(r.n, 10),
      avgResults: Math.round(parseFloat(r.avg_results) * 10) / 10,
      avgDurationMs: Math.round(parseFloat(r.avg_duration)),
    })),
    topQueries: topQueries.map((r) => ({
      query: r.query,
      searchType: r.search_type,
      count: parseInt(r.n, 10),
      avgResults: Math.round(parseFloat(r.avg_results) * 10) / 10,
    })),
    zeroResultQueries: zeroResultQueries.map((r) => ({
      query: r.query,
      searchType: r.search_type,
      count: parseInt(r.n, 10),
    })),
  });
}

export async function getRecsysSummary(req: Request, res: Response): Promise<void> {
  const days = Math.max(1, Math.min(90, parseInt(String(req.query.days ?? "30"), 10)));
  const since = new Date(Date.now() - days * 86400_000);

  const [bySurface, byEvent, byAlgo, perfBySection, totals] = await Promise.all([
    query<{ surface: string; n: string }>(
      `SELECT surface, COUNT(*)::text AS n
         FROM recommendation_events
        WHERE created_at >= $1
        GROUP BY surface
        ORDER BY COUNT(*) DESC`,
      [since]
    ),
    query<{ event_type: string; n: string }>(
      `SELECT event_type, COUNT(*)::text AS n
         FROM recommendation_events
        WHERE created_at >= $1
        GROUP BY event_type
        ORDER BY COUNT(*) DESC`,
      [since]
    ),
    query<{ algo_version: string | null; n: string }>(
      `SELECT algo_version, COUNT(*)::text AS n
         FROM recommendation_events
        WHERE created_at >= $1
        GROUP BY algo_version
        ORDER BY COUNT(*) DESC`,
      [since]
    ),
    query<{ section: string; action: string; n: string }>(
      `SELECT section, action, COUNT(*)::text AS n
         FROM recommendation_performance
        WHERE created_at >= $1
        GROUP BY section, action
        ORDER BY section, COUNT(*) DESC`,
      [since]
    ),
    query<{ events: string; perf: string; users: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM recommendation_events WHERE created_at >= $1) AS events,
         (SELECT COUNT(*)::text FROM recommendation_performance WHERE created_at >= $1) AS perf,
         (SELECT COUNT(DISTINCT user_id)::text FROM recommendation_events WHERE created_at >= $1) AS users`,
      [since]
    ),
  ]);

  res.json({
    days,
    totals: {
      events: parseInt(totals[0]?.events ?? "0", 10),
      performanceLogs: parseInt(totals[0]?.perf ?? "0", 10),
      uniqueUsers: parseInt(totals[0]?.users ?? "0", 10),
    },
    bySurface: bySurface.map((r) => ({ surface: r.surface, count: parseInt(r.n, 10) })),
    byEventType: byEvent.map((r) => ({ eventType: r.event_type, count: parseInt(r.n, 10) })),
    byAlgoVersion: byAlgo.map((r) => ({
      algoVersion: r.algo_version ?? "unversioned",
      count: parseInt(r.n, 10),
    })),
    performanceBySection: perfBySection.map((r) => ({
      section: r.section,
      action: r.action,
      count: parseInt(r.n, 10),
    })),
  });
}

import type { Request, Response } from "express";
import { query } from "./db.js";

export async function getAiUsageSummary(_req: Request, res: Response): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const since7 = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);

  const [byFeature, byModel, daily, recent, totals] = await Promise.all([
    query<{ feature: string; cost: string; in_tok: string; out_tok: string; req: string }>(
      `SELECT feature,
              COALESCE(SUM(cost_usd), 0)::text AS cost,
              COALESCE(SUM(input_tokens), 0)::text AS in_tok,
              COALESCE(SUM(output_tokens), 0)::text AS out_tok,
              COALESCE(SUM(request_count), 0)::text AS req
         FROM llm_usage_daily
        WHERE usage_date >= $1
        GROUP BY feature
        ORDER BY SUM(cost_usd) DESC`,
      [since30]
    ),
    query<{ model: string; cost: string; in_tok: string; out_tok: string; req: string }>(
      `SELECT model,
              COALESCE(SUM(cost_usd), 0)::text AS cost,
              COALESCE(SUM(input_tokens), 0)::text AS in_tok,
              COALESCE(SUM(output_tokens), 0)::text AS out_tok,
              COALESCE(SUM(request_count), 0)::text AS req
         FROM llm_usage_daily
        WHERE usage_date >= $1
        GROUP BY model
        ORDER BY SUM(cost_usd) DESC`,
      [since30]
    ),
    query<{ usage_date: string; cost: string; req: string }>(
      `SELECT usage_date,
              COALESCE(SUM(cost_usd), 0)::text AS cost,
              COALESCE(SUM(request_count), 0)::text AS req
         FROM llm_usage_daily
        WHERE usage_date >= $1
        GROUP BY usage_date
        ORDER BY usage_date ASC`,
      [since30]
    ),
    query<{
      id: string;
      user_id: string | null;
      interaction_type: string;
      model: string | null;
      latency_ms: number | null;
      success: boolean;
      result_count: number | null;
      created_at: string;
      error_message: string | null;
    }>(
      `SELECT id, user_id, interaction_type, model, latency_ms, success, result_count, created_at, error_message
         FROM ai_interactions
        ORDER BY created_at DESC
        LIMIT 25`
    ),
    query<{
      total_today: string;
      total_7d: string;
      total_30d: string;
      total_interactions: string;
      success_rate: string;
    }>(
      `SELECT
         (SELECT COALESCE(SUM(cost_usd), 0)::text FROM llm_usage_daily WHERE usage_date = $1) AS total_today,
         (SELECT COALESCE(SUM(cost_usd), 0)::text FROM llm_usage_daily WHERE usage_date >= $2) AS total_7d,
         (SELECT COALESCE(SUM(cost_usd), 0)::text FROM llm_usage_daily WHERE usage_date >= $3) AS total_30d,
         (SELECT COUNT(*)::text FROM ai_interactions WHERE created_at >= NOW() - INTERVAL '30 days') AS total_interactions,
         (SELECT COALESCE(
            (COUNT(*) FILTER (WHERE success = true))::float / NULLIF(COUNT(*), 0) * 100,
            100
          )::text
          FROM ai_interactions WHERE created_at >= NOW() - INTERVAL '30 days') AS success_rate`,
      [today, since7, since30]
    ),
  ]);

  res.json({
    totals: {
      costToday: parseFloat(totals[0]?.total_today ?? "0"),
      cost7d: parseFloat(totals[0]?.total_7d ?? "0"),
      cost30d: parseFloat(totals[0]?.total_30d ?? "0"),
      interactions30d: parseInt(totals[0]?.total_interactions ?? "0", 10),
      successRate: parseFloat(totals[0]?.success_rate ?? "100"),
    },
    byFeature: byFeature.map((r) => ({
      feature: r.feature,
      cost: parseFloat(r.cost),
      inputTokens: parseInt(r.in_tok, 10),
      outputTokens: parseInt(r.out_tok, 10),
      requests: parseInt(r.req, 10),
    })),
    byModel: byModel.map((r) => ({
      model: r.model,
      cost: parseFloat(r.cost),
      inputTokens: parseInt(r.in_tok, 10),
      outputTokens: parseInt(r.out_tok, 10),
      requests: parseInt(r.req, 10),
    })),
    daily: daily.map((d) => ({
      date: d.usage_date,
      cost: parseFloat(d.cost),
      requests: parseInt(d.req, 10),
    })),
    recentInteractions: recent.map((r) => ({
      id: r.id,
      userId: r.user_id,
      interactionType: r.interaction_type,
      model: r.model,
      latencyMs: r.latency_ms,
      success: r.success,
      resultCount: r.result_count,
      errorMessage: r.error_message,
      createdAt: r.created_at,
    })),
  });
}

export async function listAiInteractions(req: Request, res: Response): Promise<void> {
  const interactionType = req.query.interactionType as string | undefined;
  const successFilter = req.query.success as string | undefined;
  const userId = req.query.userId as string | undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (interactionType) {
    conditions.push(`interaction_type = $${pi++}`);
    params.push(interactionType);
  }
  if (successFilter === "true" || successFilter === "false") {
    conditions.push(`success = $${pi++}`);
    params.push(successFilter === "true");
  }
  if (userId) {
    conditions.push(`user_id = $${pi++}`);
    params.push(userId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows, count] = await Promise.all([
    query<{
      id: string;
      user_id: string | null;
      interaction_type: string;
      prompt: string | null;
      model: string | null;
      latency_ms: number | null;
      success: boolean;
      result_count: number | null;
      error_message: string | null;
      created_at: string;
    }>(
      `SELECT id, user_id, interaction_type, prompt, model, latency_ms, success,
              result_count, error_message, created_at
         FROM ai_interactions
         ${where}
         ORDER BY created_at DESC
         LIMIT $${pi++} OFFSET $${pi}`,
      [...params, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ai_interactions ${where}`,
      params
    ),
  ]);

  res.json({
    interactions: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      interactionType: r.interaction_type,
      prompt: r.prompt,
      model: r.model,
      latencyMs: r.latency_ms,
      success: r.success,
      resultCount: r.result_count,
      errorMessage: r.error_message,
      createdAt: r.created_at,
    })),
    total: parseInt(count[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

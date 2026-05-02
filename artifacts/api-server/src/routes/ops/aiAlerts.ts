import type { Request, Response } from "express";
import { query, queryOne } from "./db.js";

const DEFAULT_THRESHOLD_USD = 5.0;
const FLAGS_SCOPE = "global";
const FLAG_KEY = "ai_daily_cost_threshold_usd";

export async function getAiAlerts(_req: Request, res: Response): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

  const [todayRow, yesterdayRow, flagsRow] = await Promise.all([
    queryOne<{ cost: string; req: string }>(
      `SELECT COALESCE(SUM(cost_usd), 0)::text AS cost,
              COALESCE(SUM(request_count), 0)::text AS req
         FROM llm_usage_daily WHERE usage_date = $1`,
      [today]
    ),
    queryOne<{ cost: string }>(
      `SELECT COALESCE(SUM(cost_usd), 0)::text AS cost
         FROM llm_usage_daily WHERE usage_date = $1`,
      [yesterday]
    ),
    queryOne<{ flags: Record<string, unknown> }>(
      `SELECT flags FROM system_flags WHERE id = $1`,
      [FLAGS_SCOPE]
    ),
  ]);

  const threshold = (() => {
    const raw = flagsRow?.flags?.[FLAG_KEY];
    if (typeof raw === "number" && raw > 0) return raw;
    if (typeof raw === "string") {
      const n = parseFloat(raw);
      if (!Number.isNaN(n) && n > 0) return n;
    }
    return DEFAULT_THRESHOLD_USD;
  })();

  const todayUsd = parseFloat(todayRow?.cost ?? "0");
  const yesterdayUsd = parseFloat(yesterdayRow?.cost ?? "0");

  res.json({
    todayUsd,
    yesterdayUsd,
    thresholdUsd: threshold,
    exceeded: todayUsd > threshold,
    nearLimit: todayUsd > threshold * 0.8 && todayUsd <= threshold,
    todayRequests: parseInt(todayRow?.req ?? "0", 10),
  });
}

export async function setAiCostThreshold(req: Request, res: Response): Promise<void> {
  const { thresholdUsd } = req.body ?? {};
  const n = Number(thresholdUsd);
  if (!Number.isFinite(n) || n <= 0) {
    res.status(400).json({ error: "thresholdUsd must be a positive number" });
    return;
  }
  await query(
    `INSERT INTO system_flags (id, flags, updated_at) VALUES ($1, jsonb_build_object($2::text, $3::numeric), now())
     ON CONFLICT (id) DO UPDATE SET flags = system_flags.flags || jsonb_build_object($2::text, $3::numeric), updated_at = now()`,
    [FLAGS_SCOPE, FLAG_KEY, n]
  );
  res.json({ ok: true, thresholdUsd: n });
}

import type { Request, Response } from "express";
import { query } from "./db.js";

export async function listNotificationTemplates(_req: Request, res: Response): Promise<void> {
  const templates = await query<{
    id: string;
    stage: string;
    title: string;
    body: string;
    enabled: boolean;
  }>(
    `SELECT id::text, stage, title, body, enabled FROM notification_templates ORDER BY stage`
  ).catch(() => [] as { id: string; stage: string; title: string; body: string; enabled: boolean }[]);

  res.json({ templates });
}

export async function listNotificationLog(req: Request, res: Response): Promise<void> {
  const userId = req.query.userId as string | undefined;
  const category = req.query.category as string | undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (userId) {
    conditions.push(`nl.user_id = $${pi}`);
    params.push(userId);
    pi++;
  }
  if (category) {
    conditions.push(`nl.category = $${pi}`);
    params.push(category);
    pi++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [logs, countRows] = await Promise.all([
    query<{
      id: string;
      user_id: string;
      category: string;
      title: string;
      body: string;
      status: string;
      sent_at: string;
    }>(
      `SELECT nl.id::text, nl.user_id, nl.category, nl.title, nl.body, nl.status, nl.sent_at
       FROM notification_log nl
       ${where}
       ORDER BY nl.sent_at DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM notification_log nl ${where}`,
      params
    ),
  ]);

  res.json({
    logs: logs.map((l) => ({
      id: l.id,
      userId: l.user_id,
      category: l.category,
      title: l.title,
      body: l.body,
      status: l.status,
      sentAt: l.sent_at,
    })),
    total: parseInt(countRows[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

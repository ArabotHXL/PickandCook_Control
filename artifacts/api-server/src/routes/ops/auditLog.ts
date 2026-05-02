import type { Request, Response } from "express";
import { query } from "./db.js";
import { buildOrderBy } from "./csv.js";

const AUDIT_SORTS: Record<string, string> = {
  createdAt: "al.created_at",
  adminEmail: "u.email",
  actionType: "al.action_type",
  targetType: "al.target_type",
};

export async function listAuditLog(req: Request, res: Response): Promise<void> {
  const adminUserId = req.query.adminUserId as string | undefined;
  const targetType = req.query.targetType as string | undefined;
  const actionType = req.query.actionType as string | undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (adminUserId) {
    conditions.push(`al.admin_user_id = $${pi}`);
    params.push(adminUserId);
    pi++;
  }
  if (targetType) {
    conditions.push(`al.target_type = $${pi}`);
    params.push(targetType);
    pi++;
  }
  if (actionType) {
    conditions.push(`al.action_type = $${pi}`);
    params.push(actionType);
    pi++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderBy = buildOrderBy(req.query.sort, req.query.dir, AUDIT_SORTS, "al.created_at", "al.id");

  const [entries, countRows] = await Promise.all([
    query<{
      id: string;
      admin_user_id: string;
      admin_email: string;
      action_type: string;
      target_type: string;
      target_id: string | null;
      old_value: unknown;
      new_value: unknown;
      decision_note: string | null;
      created_at: string;
    }>(
      `SELECT al.id, al.admin_user_id, u.email AS admin_email,
              al.action_type, al.target_type, al.target_id,
              al.old_value, al.new_value, al.decision_note, al.created_at
       FROM ops_audit_log al
       LEFT JOIN users u ON u.id = al.admin_user_id
       ${where}
       ${orderBy}
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ops_audit_log al ${where}`,
      params
    ),
  ]);

  res.json({
    entries: entries.map((e) => ({
      id: e.id,
      adminUserId: e.admin_user_id,
      adminEmail: e.admin_email,
      actionType: e.action_type,
      targetType: e.target_type,
      targetId: e.target_id,
      oldValue: e.old_value,
      newValue: e.new_value,
      decisionNote: e.decision_note,
      createdAt: e.created_at,
    })),
    total: parseInt(countRows[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

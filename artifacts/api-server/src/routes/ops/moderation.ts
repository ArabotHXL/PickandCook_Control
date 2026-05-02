import type { Request, Response } from "express";
import { query, withTransaction } from "./db.js";
import { writeAuditLog } from "./audit.js";
import type { AdminPayload } from "./auth.js";
import { buildOrderBy } from "./csv.js";
import { parseLimit, parsePage } from "./queryParams.js";

function getAdminUser(req: Request): AdminPayload {
  return (req as Request & { adminUser: AdminPayload }).adminUser;
}

const MODERATION_SORTS: Record<string, string> = {
  contentType: "ar.content_type",
  reason: "ar.reason",
  reporterEmail: "u.email",
  status: "ar.status",
  createdAt: "ar.created_at",
  updatedAt: "ar.updated_at",
};

export async function listModeration(req: Request, res: Response): Promise<void> {
  const contentType = req.query.contentType as string | undefined;
  const status = (req.query.status as string) ?? "pending";
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, { def: 50, max: 100 });
  const offset = (page - 1) * limit;

  const conditions: string[] = [`ar.status = $1`];
  const params: unknown[] = [status];
  let pi = 2;

  if (contentType) {
    conditions.push(`ar.content_type = $${pi}`);
    params.push(contentType);
    pi++;
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const orderBy = buildOrderBy(req.query.sort, req.query.dir, MODERATION_SORTS, "ar.created_at", "ar.id");

  const [items, countRows] = await Promise.all([
    query<{
      id: string;
      content_type: string;
      content_id: string;
      reason: string;
      details: string | null;
      status: string;
      reporter_user_id: string;
      reporter_email: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT ar.id, ar.content_type, ar.content_id::text, ar.reason,
              ar.details, ar.status, ar.reporter_user_id,
              u.email AS reporter_email, ar.created_at, ar.updated_at
       FROM abuse_reports ar
       LEFT JOIN users u ON u.id = ar.reporter_user_id
       ${where}
       ${orderBy}
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM abuse_reports ar ${where}`,
      params
    ),
  ]);

  res.json({
    items: items.map((i) => ({
      id: i.id,
      contentType: i.content_type,
      contentId: i.content_id,
      reason: i.reason,
      details: i.details,
      status: i.status,
      reporterUserId: i.reporter_user_id,
      reporterEmail: i.reporter_email,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
    })),
    total: parseInt(countRows[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

export async function bulkDecideModeration(req: Request, res: Response): Promise<void> {
  // Accept both `ids` (preferred, used by dashboard) and `reportIds` (legacy).
  const body = req.body ?? {};
  const ids: unknown = Array.isArray(body.ids) ? body.ids : body.reportIds;
  const { decision, note } = body;
  const admin = getAdminUser(req);

  const allowed = ["approved", "rejected", "needs_more_info", "escalated"];
  if (!allowed.includes(decision)) {
    res.status(400).json({ error: "Invalid decision" });
    return;
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids (array) required" });
    return;
  }
  if (ids.length > 100) {
    res.status(400).json({ error: "Max 100 reports per bulk action" });
    return;
  }
  if (!ids.every((id) => typeof id === "string")) {
    res.status(400).json({ error: "ids must be an array of strings" });
    return;
  }

  // Only flip rows still in `pending`. Already-decided rows are skipped so we
  // don't silently overwrite a finalized decision.
  const updated = await withTransaction(async (tx) => {
    return tx.query<{ id: string; old_status: string }>(
      `WITH old AS (
         SELECT id, status FROM abuse_reports
          WHERE id::text = ANY($1::text[]) AND status = 'pending'
          FOR UPDATE
       )
       UPDATE abuse_reports ar
          SET status = $2, updated_at = NOW()
         FROM old
        WHERE ar.id = old.id
       RETURNING ar.id, old.status AS old_status`,
      [ids as string[], decision]
    );
  });

  // Per-row audit so each id is independently searchable.
  for (const u of updated) {
    await writeAuditLog({
      adminUserId: admin.userId,
      actionType: `moderation_bulk_${decision}`,
      targetType: "abuse_report",
      targetId: u.id,
      oldValue: { status: u.old_status },
      newValue: { status: decision, batchSize: updated.length },
      decisionNote: note,
    });
  }

  res.json({
    ok: true,
    updated: updated.length,
    requested: ids.length,
    skipped: ids.length - updated.length,
  });
}

export async function decideModeration(req: Request, res: Response): Promise<void> {
  const { reportId } = req.params;
  const { decision, note } = req.body ?? {};
  const admin = getAdminUser(req);

  const allowed = ["approved", "rejected", "needs_more_info", "escalated"];
  if (!allowed.includes(decision)) {
    res.status(400).json({ error: "Invalid decision" });
    return;
  }

  const existing = await query<{ status: string; content_type: string }>(
    `SELECT status, content_type FROM abuse_reports WHERE id = $1`,
    [reportId]
  );
  if (!existing.length) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  await query(
    `UPDATE abuse_reports SET status = $1, updated_at = NOW() WHERE id = $2`,
    [decision, reportId]
  );

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: `moderation_${decision}`,
    targetType: "abuse_report",
    targetId: String(reportId),
    oldValue: { status: existing[0].status },
    newValue: { status: decision },
    decisionNote: note,
  });

  res.json({ ok: true });
}

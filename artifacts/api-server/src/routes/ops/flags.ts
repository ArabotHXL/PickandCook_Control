import type { Request, Response } from "express";
import { query } from "./db.js";
import { writeAuditLog } from "./audit.js";
import type { AdminPayload } from "./auth.js";

function getAdminUser(req: Request): AdminPayload {
  return (req as Request & { adminUser: AdminPayload }).adminUser;
}

export async function listFlags(_req: Request, res: Response): Promise<void> {
  const rows = await query<{
    id: string;
    flags: Record<string, unknown>;
    updated_at: string;
    updated_by: string | null;
  }>(
    `SELECT id, flags, updated_at, updated_by FROM system_flags ORDER BY id ASC`
  );

  res.json({
    scopes: rows.map((r) => ({
      id: r.id,
      flags: r.flags ?? {},
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
    })),
  });
}

export async function updateFlag(req: Request, res: Response): Promise<void> {
  const { scopeId } = req.params;
  const { key, value } = req.body ?? {};
  const admin = getAdminUser(req);

  if (!key || typeof key !== "string") {
    res.status(400).json({ error: "key (string) is required" });
    return;
  }

  const existing = await query<{ flags: Record<string, unknown> }>(
    `SELECT flags FROM system_flags WHERE id = $1 LIMIT 1`,
    [scopeId]
  );

  const before = existing[0]?.flags ?? {};
  const after = { ...before, [key]: value };

  await query(
    `INSERT INTO system_flags (id, flags, updated_at, updated_by)
     VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (id) DO UPDATE
       SET flags = $2::jsonb, updated_at = NOW(), updated_by = $3`,
    [scopeId, JSON.stringify(after), admin.userId]
  );

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "feature_flag_set",
    targetType: "system_flags",
    targetId: scopeId,
    oldValue: { [key]: before[key] ?? null },
    newValue: { [key]: value },
  });

  res.json({ ok: true, flags: after });
}

import { query } from "./db.js";

export interface AuditPayload {
  adminUserId: string;
  actionType: string;
  targetType: string;
  targetId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  decisionNote?: string;
}

export async function writeAuditLog(payload: AuditPayload): Promise<void> {
  await query(
    `INSERT INTO ops_audit_log
       (admin_user_id, action_type, target_type, target_id, old_value, new_value, decision_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      payload.adminUserId,
      payload.actionType,
      payload.targetType,
      payload.targetId ?? null,
      payload.oldValue ? JSON.stringify(payload.oldValue) : null,
      payload.newValue ? JSON.stringify(payload.newValue) : null,
      payload.decisionNote ?? null,
    ]
  );
}

import type { Request, Response } from "express";
import { query, queryOne } from "./db.js";
import { writeAuditLog } from "./audit.js";
import type { AdminPayload } from "./auth.js";
import { parseLimit, parsePage } from "./queryParams.js";
import { retryDeadLetterById } from "../../jobs/handlers/opsReverseSync.js";

function getAdmin(req: Request): AdminPayload {
  return (req as Request & { adminUser: AdminPayload }).adminUser;
}

const ENDPOINT_VALUES = new Set(["recipes", "products", "moderation-decisions"]);
const STATUS_VALUES = new Set(["unresolved", "resolved", "all"]);

/**
 * GET /api/ops/system/reverse-sync/dead-letter
 *
 * Lists rows from `ops_sync_dead_letter` (created in
 * `ensureDeadLetterSchema`). Default view = unresolved only.
 *
 * Query params:
 *   - status: unresolved (default) | resolved | all
 *   - endpoint: recipes | products | moderation-decisions (optional)
 *   - page, limit: standard pagination (limit ≤ 100)
 */
export async function listDeadLetter(req: Request, res: Response): Promise<void> {
  const status = typeof req.query.status === "string" && STATUS_VALUES.has(req.query.status)
    ? req.query.status
    : "unresolved";
  const endpoint = typeof req.query.endpoint === "string" && ENDPOINT_VALUES.has(req.query.endpoint)
    ? req.query.endpoint
    : null;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, { def: 50, max: 100 });
  const offset = (page - 1) * limit;

  const wheres: string[] = [];
  const params: unknown[] = [];
  let pi = 1;
  if (status === "unresolved") wheres.push(`resolved_at IS NULL`);
  else if (status === "resolved") wheres.push(`resolved_at IS NOT NULL`);
  if (endpoint) {
    wheres.push(`endpoint = $${pi++}`);
    params.push(endpoint);
  }
  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ops_sync_dead_letter ${whereSql}`,
    params
  );
  const total = parseInt(totalRow?.count ?? "0", 10);

  params.push(limit, offset);
  const rows = await query<{
    id: string;
    audit_id: string;
    endpoint: string;
    target_id: string | null;
    reason: string | null;
    sample_response: unknown;
    first_seen_at: string;
    last_retried_at: string | null;
    retry_count: number;
    resolved_at: string | null;
  }>(
    `SELECT id::text AS id,
            audit_id, endpoint, target_id, reason, sample_response,
            first_seen_at::text AS first_seen_at,
            last_retried_at::text AS last_retried_at,
            retry_count,
            resolved_at::text AS resolved_at
       FROM ops_sync_dead_letter
       ${whereSql}
      ORDER BY first_seen_at DESC
      LIMIT $${pi++} OFFSET $${pi++}`,
    params
  );

  res.json({
    page,
    limit,
    total,
    rows: rows.map((r) => ({
      id: r.id,
      auditId: r.audit_id,
      endpoint: r.endpoint,
      targetId: r.target_id,
      reason: r.reason,
      sampleResponse: r.sample_response,
      firstSeenAt: r.first_seen_at,
      lastRetriedAt: r.last_retried_at,
      retryCount: r.retry_count,
      resolvedAt: r.resolved_at,
    })),
  });
}

/**
 * POST /api/ops/system/reverse-sync/dead-letter/:id/retry
 *
 * Re-POSTs the underlying row to prod through the same mappers the cron
 * uses (so `forceOverrideOrigin` survives the retry). Marks resolved on
 * success; bumps retry_count + reason on rejection.
 *
 * Write-tier: only mutating admins should retry — a successful retry
 * mutates prod.
 */
export async function retryDeadLetter(req: Request, res: Response): Promise<void> {
  const admin = getAdmin(req);
  const idParam = req.params.id;
  const id = typeof idParam === "string" ? idParam : Array.isArray(idParam) ? idParam[0] : undefined;
  if (!id) {
    res.status(400).json({ error: "id required" });
    return;
  }
  const result = await retryDeadLetterById(id);
  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "system.reverse_sync_dead_letter_retry",
    targetType: "ops_sync_dead_letter",
    targetId: id,
    newValue: {
      ok: result.ok,
      resolved: result.resolved,
      message: result.message,
      ...(result.status !== undefined ? { httpStatus: result.status } : {}),
    },
  });
  if (!result.ok && result.message === "Dead-letter row not found") {
    res.status(404).json({ error: result.message });
    return;
  }
  const body: Record<string, unknown> = {
    ok: result.ok,
    resolved: result.resolved,
    message: result.message,
  };
  if (result.status !== undefined) body.httpStatus = result.status;
  if (result.result !== undefined) body.result = result.result;
  res.json(body);
}

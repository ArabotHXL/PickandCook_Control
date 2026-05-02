import type { Request, Response } from "express";
import { query } from "./db.js";
import { writeAuditLog } from "./audit.js";
import type { AdminPayload } from "./auth.js";

function getAdminUser(req: Request): AdminPayload {
  return (req as Request & { adminUser: AdminPayload }).adminUser;
}

export async function listProducts(req: Request, res: Response): Promise<void> {
  const q = (req.query.q as string) ?? "";
  const issue = req.query.issue as string | undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (q) {
    conditions.push(`(p.name ILIKE $${pi} OR p.brand ILIKE $${pi} OR p.id ILIKE $${pi})`);
    params.push(`%${q}%`);
    pi++;
  }

  if (issue && issue !== "all") {
    if (issue === "missing_brand") conditions.push(`(p.brand IS NULL OR p.brand = '')`);
    else if (issue === "missing_category") conditions.push(`(p.department IS NULL OR p.department = '')`);
    else if (issue === "missing_nutrition") conditions.push(`(p.kcal IS NULL OR p.kcal = 0)`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [products, countRows] = await Promise.all([
    query<{
      id: string;
      name: string;
      brand: string | null;
      department: string;
      kcal: number | null;
      created_at: string;
      barcode_count: string;
    }>(
      `SELECT p.id, p.name, p.brand, p.department, p.kcal, p.created_at,
              COALESCE((SELECT COUNT(*) FROM product_barcodes pb WHERE pb.product_id = p.id), 0)::text AS barcode_count
       FROM products p
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM products p ${where}`,
      params
    ),
  ]);

  const withIssues = products.map((p) => {
    const issues: string[] = [];
    if (!p.brand) issues.push("missing_brand");
    if (!p.department) issues.push("missing_category");
    if (p.kcal == null || p.kcal === 0) issues.push("missing_nutrition");
    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      department: p.department,
      issues,
      barcodeCount: parseInt(p.barcode_count, 10),
      createdAt: p.created_at,
    };
  });

  res.json({
    products: withIssues,
    total: parseInt(countRows[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

export async function listUnknownBarcodes(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset = (page - 1) * limit;

  const [rows, countRows] = await Promise.all([
    query<{
      barcode: string;
      scan_count: string;
      last_scanned_at: string;
    }>(
      `SELECT
         (properties->>'barcode') AS barcode,
         COUNT(*)::text AS scan_count,
         MAX(created_at)::text AS last_scanned_at
       FROM analytics_events
       WHERE event = 'scan_not_found'
         AND properties->>'barcode' IS NOT NULL
       GROUP BY properties->>'barcode'
       ORDER BY scan_count DESC, last_scanned_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(DISTINCT properties->>'barcode')::text AS n
       FROM analytics_events
       WHERE event = 'scan_not_found' AND properties->>'barcode' IS NOT NULL`
    ),
  ]);

  res.json({
    barcodes: rows.map((r) => ({
      barcode: r.barcode,
      scanCount: parseInt(r.scan_count, 10),
      lastScannedAt: r.last_scanned_at,
      userIds: [],
    })),
    total: parseInt(countRows[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

export async function listProductProposals(req: Request, res: Response): Promise<void> {
  const status = (req.query.status as string) ?? "pending";
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset = (page - 1) * limit;

  const [proposals, countRows] = await Promise.all([
    query<{
      id: string;
      proposal_type: string;
      risk_level: string;
      object_type: string;
      object_id: string;
      status: string;
      created_by: string;
      creator_email: string;
      reviewed_by: string | null;
      review_note: string | null;
      created_at: string;
      payload: unknown;
    }>(
      `SELECT
         ep.id, ep.proposal_type, ep.risk_level, ep.object_type, ep.object_id,
         ep.status, ep.created_by, u.email AS creator_email,
         ep.reviewed_by, ep.review_note, ep.created_at, ep.payload
       FROM edit_proposals ep
       LEFT JOIN users u ON u.id = ep.created_by
       WHERE ep.status = $1
       ORDER BY ep.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM edit_proposals WHERE status = $1`,
      [status]
    ),
  ]);

  res.json({
    proposals: proposals.map((p) => ({
      id: p.id,
      proposalType: p.proposal_type,
      riskLevel: p.risk_level,
      objectType: p.object_type,
      objectId: p.object_id,
      status: p.status,
      createdBy: p.created_by,
      creatorEmail: p.creator_email,
      reviewedBy: p.reviewed_by,
      reviewNote: p.review_note,
      createdAt: p.created_at,
      payload: p.payload,
    })),
    total: parseInt(countRows[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

export async function decideProductProposal(req: Request, res: Response): Promise<void> {
  const { proposalId } = req.params;
  const { decision, note } = req.body ?? {};
  const admin = getAdminUser(req);

  const allowed = ["approved", "rejected", "needs_research"];
  if (!allowed.includes(decision)) {
    res.status(400).json({ error: "Invalid decision" });
    return;
  }

  const existing = await query<{ status: string }>(
    `SELECT status FROM edit_proposals WHERE id = $1`,
    [proposalId]
  );
  if (!existing.length) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }

  await query(
    `UPDATE edit_proposals SET status = $1, reviewed_by = $2, review_note = $3, reviewed_at = NOW() WHERE id = $4`,
    [decision, admin.userId, note ?? null, proposalId]
  );

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: `proposal_${decision}`,
    targetType: "edit_proposal",
    targetId: proposalId,
    oldValue: { status: existing[0].status },
    newValue: { status: decision },
    decisionNote: note,
  });

  res.json({ ok: true });
}

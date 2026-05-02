import type { Request, Response } from "express";
import { query, queryOne } from "./db.js";
import { maybeSendExport, buildOrderBy } from "./csv.js";

const RECEIPT_SORTS: Record<string, string> = {
  storeName: "rh.store_name",
  userEmail: "u.email",
  status: "rh.status",
  totalCents: "rh.total_cents",
  llmCostUsd: "rh.llm_cost_usd",
  llmLatencyMs: "rh.llm_latency_ms",
  purchasedAt: "rh.purchased_at",
  createdAt: "rh.created_at",
  itemCount: "(SELECT COUNT(*) FROM receipt_items WHERE receipt_id = rh.id)",
};

export async function listReceipts(req: Request, res: Response): Promise<void> {
  const status = req.query.status as string | undefined;
  const userId = req.query.userId as string | undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (status) {
    conditions.push(`rh.status = $${pi++}`);
    params.push(status);
  }
  if (userId) {
    conditions.push(`rh.user_id = $${pi++}`);
    params.push(userId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderBy = buildOrderBy(req.query.sort, req.query.dir, RECEIPT_SORTS, "rh.created_at", "rh.id");

  const [rows, count, summary] = await Promise.all([
    query<{
      id: string;
      user_id: string;
      user_email: string | null;
      store_name: string | null;
      purchased_at: string | null;
      total_cents: number | null;
      status: string;
      processing_phase: string | null;
      llm_model: string | null;
      llm_cost_usd: number | null;
      llm_latency_ms: number | null;
      error_message: string | null;
      created_at: string;
      item_count: string;
    }>(
      `SELECT rh.id, rh.user_id, u.email AS user_email, rh.store_name,
              rh.purchased_at, rh.total_cents, rh.status, rh.processing_phase,
              rh.llm_model, rh.llm_cost_usd, rh.llm_latency_ms, rh.error_message,
              rh.created_at,
              (SELECT COUNT(*)::text FROM receipt_items WHERE receipt_id = rh.id) AS item_count
         FROM receipt_headers rh
         LEFT JOIN users u ON u.id = rh.user_id
         ${where}
         ${orderBy}
         LIMIT $${pi++} OFFSET $${pi}`,
      [...params, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM receipt_headers rh ${where}`,
      params
    ),
    query<{
      total: string;
      uploaded: string;
      processing: string;
      completed: string;
      failed: string;
      total_cost: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status = 'uploaded')::text AS uploaded,
         COUNT(*) FILTER (WHERE status IN ('processing', 'extracting'))::text AS processing,
         COUNT(*) FILTER (WHERE status = 'completed')::text AS completed,
         COUNT(*) FILTER (WHERE status IN ('failed', 'error'))::text AS failed,
         COALESCE(SUM(llm_cost_usd), 0)::text AS total_cost
       FROM receipt_headers`
    ),
  ]);

  const receipts = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userEmail: r.user_email,
    storeName: r.store_name,
    purchasedAt: r.purchased_at,
    totalCents: r.total_cents,
    status: r.status,
    processingPhase: r.processing_phase,
    llmModel: r.llm_model,
    llmCostUsd: r.llm_cost_usd,
    llmLatencyMs: r.llm_latency_ms,
    errorMessage: r.error_message,
    createdAt: r.created_at,
    itemCount: parseInt(r.item_count, 10),
  }));

  if (
    await maybeSendExport(
      res,
      req.query.format,
      `receipts-${new Date().toISOString().slice(0, 10)}`,
      receipts,
      [
        "id",
        "userEmail",
        "storeName",
        "status",
        "totalCents",
        "itemCount",
        "llmModel",
        "llmCostUsd",
        "purchasedAt",
        "createdAt",
      ]
    )
  ) {
    return;
  }

  res.json({
    receipts,
    total: parseInt(count[0]?.n ?? "0", 10),
    page,
    limit,
    summary: {
      total: parseInt(summary[0]?.total ?? "0", 10),
      uploaded: parseInt(summary[0]?.uploaded ?? "0", 10),
      processing: parseInt(summary[0]?.processing ?? "0", 10),
      completed: parseInt(summary[0]?.completed ?? "0", 10),
      failed: parseInt(summary[0]?.failed ?? "0", 10),
      totalLlmCostUsd: parseFloat(summary[0]?.total_cost ?? "0"),
    },
  });
}

export async function getReceiptDetail(req: Request, res: Response): Promise<void> {
  const { receiptId } = req.params;

  const [header, items] = await Promise.all([
    queryOne<{
      id: string;
      user_id: string;
      user_email: string | null;
      store_name: string | null;
      purchased_at: string | null;
      subtotal_cents: number | null;
      tax_cents: number | null;
      total_cents: number | null;
      status: string;
      processing_phase: string | null;
      llm_model: string | null;
      llm_cost_usd: number | null;
      llm_input_tokens: number | null;
      llm_output_tokens: number | null;
      llm_latency_ms: number | null;
      error_message: string | null;
      raw_ocr_text: string | null;
      created_at: string;
    }>(
      `SELECT rh.id, rh.user_id, u.email AS user_email, rh.store_name, rh.purchased_at,
              rh.subtotal_cents, rh.tax_cents, rh.total_cents, rh.status, rh.processing_phase,
              rh.llm_model, rh.llm_cost_usd, rh.llm_input_tokens, rh.llm_output_tokens,
              rh.llm_latency_ms, rh.error_message, rh.raw_ocr_text, rh.created_at
         FROM receipt_headers rh
         LEFT JOIN users u ON u.id = rh.user_id
         WHERE rh.id = $1
         LIMIT 1`,
      [receiptId]
    ),
    query<{
      id: string;
      raw_name: string;
      raw_qty: number | null;
      raw_unit: string | null;
      raw_price_cents: number | null;
      normalized_name: string | null;
      proposed_product_id: string | null;
      proposed_confidence: number | null;
      proposed_band: string | null;
      final_product_id: string | null;
      final_action: string | null;
      barcode: string | null;
    }>(
      `SELECT id, raw_name, raw_qty, raw_unit, raw_price_cents, normalized_name,
              proposed_product_id, proposed_confidence, proposed_band,
              final_product_id, final_action, barcode
         FROM receipt_items
         WHERE receipt_id = $1
         ORDER BY created_at ASC`,
      [receiptId]
    ),
  ]);

  if (!header) {
    res.status(404).json({ error: "Receipt not found" });
    return;
  }

  res.json({
    receipt: {
      id: header.id,
      userId: header.user_id,
      userEmail: header.user_email,
      storeName: header.store_name,
      purchasedAt: header.purchased_at,
      subtotalCents: header.subtotal_cents,
      taxCents: header.tax_cents,
      totalCents: header.total_cents,
      status: header.status,
      processingPhase: header.processing_phase,
      llmModel: header.llm_model,
      llmCostUsd: header.llm_cost_usd,
      llmInputTokens: header.llm_input_tokens,
      llmOutputTokens: header.llm_output_tokens,
      llmLatencyMs: header.llm_latency_ms,
      errorMessage: header.error_message,
      rawOcrText: header.raw_ocr_text,
      createdAt: header.created_at,
    },
    items: items.map((i) => ({
      id: i.id,
      rawName: i.raw_name,
      rawQty: i.raw_qty,
      rawUnit: i.raw_unit,
      rawPriceCents: i.raw_price_cents,
      normalizedName: i.normalized_name,
      proposedProductId: i.proposed_product_id,
      proposedConfidence: i.proposed_confidence,
      proposedBand: i.proposed_band,
      finalProductId: i.final_product_id,
      finalAction: i.final_action,
      barcode: i.barcode,
    })),
  });
}

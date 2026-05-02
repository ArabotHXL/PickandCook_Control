import type { Request, Response } from "express";
import { query } from "./db.js";
import { writeAuditLog } from "./audit.js";
import type { AdminPayload } from "./auth.js";
import { buildOrderBy } from "./csv.js";
import { parseLimit, parsePage } from "./queryParams.js";

function getAdminUser(req: Request): AdminPayload {
  return (req as Request & { adminUser: AdminPayload }).adminUser;
}

const PANTRY_SORTS: Record<string, string> = {
  ingredientId: "pi.ingredient_id",
  userEmail: "u.email",
  quantity: "pi.quantity",
  unit: "pi.unit",
  sourceType: "pi.source_type",
  addedAt: "pi.added_at",
  updatedAt: "pi.updated_at",
};

export async function listPantryItems(req: Request, res: Response): Promise<void> {
  const userId = req.query.userId as string | undefined;
  const issue = req.query.issue as string | undefined;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, { def: 50, max: 100 });
  const offset = (page - 1) * limit;

  const conditions: string[] = ["pi.deleted_at IS NULL"];
  const params: unknown[] = [];
  let pi = 1;

  if (userId) {
    conditions.push(`pi.user_id = $${pi}`);
    params.push(userId);
    pi++;
  }

  if (issue && issue !== "all") {
    if (issue === "missing_quantity") {
      conditions.push(`pi.quantity IS NULL`);
    } else if (issue === "missing_unit") {
      conditions.push(`pi.unit IS NULL OR pi.unit = ''`);
    } else if (issue === "stale") {
      const staleDate = new Date(Date.now() - 90 * 86400_000).toISOString();
      conditions.push(`pi.updated_at < $${pi}`);
      params.push(staleDate);
      pi++;
    } else if (issue === "duplicate") {
      conditions.push(`
        pi.ingredient_id IN (
          SELECT ingredient_id FROM pantry_items
          WHERE deleted_at IS NULL
          GROUP BY user_id, ingredient_id
          HAVING COUNT(*) > 1
        )
      `);
    }
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const orderBy = buildOrderBy(req.query.sort, req.query.dir, PANTRY_SORTS, "pi.added_at", "pi.id");

  const [items, countRows] = await Promise.all([
    query<{
      id: string;
      user_id: string;
      email: string;
      ingredient_id: string;
      quantity: number | null;
      unit: string | null;
      source_type: string | null;
      added_at: string;
      updated_at: string;
    }>(
      `SELECT
         pi.id, pi.user_id, u.email,
         pi.ingredient_id, pi.quantity, pi.unit,
         pi.source_type, pi.added_at, pi.updated_at
       FROM pantry_items pi
       LEFT JOIN users u ON u.id = pi.user_id
       ${where}
       ${orderBy}
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM pantry_items pi ${where}`,
      params
    ),
  ]);

  const withIssues = items.map((item) => {
    const issues: string[] = [];
    if (item.quantity == null) issues.push("missing_quantity");
    if (!item.unit) issues.push("missing_unit");
    return {
      id: item.id,
      userId: item.user_id,
      userEmail: item.email,
      ingredientId: item.ingredient_id,
      quantity: item.quantity,
      unit: item.unit,
      sourceType: item.source_type,
      addedAt: item.added_at,
      updatedAt: item.updated_at,
      issues,
    };
  });

  res.json({
    items: withIssues,
    total: parseInt(countRows[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

export async function flagPantryItem(req: Request, res: Response): Promise<void> {
  const { itemId } = req.params;
  const { note } = req.body ?? {};
  const admin = getAdminUser(req);

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "flag_pantry_item",
    targetType: "pantry_item",
    targetId: String(itemId),
    newValue: { flagged: true },
    decisionNote: note ?? "Flagged for review",
  });

  res.json({ ok: true, message: "Item flagged for review" });
}

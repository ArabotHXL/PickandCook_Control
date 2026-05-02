import type { Request, Response } from "express";
import { query, queryOne } from "./db.js";
import { writeAuditLog } from "./audit.js";
import type { AdminPayload } from "./auth.js";
import { maybeSendExport, buildOrderBy } from "./csv.js";
import { parseLimit, parsePage } from "./queryParams.js";

const USER_SORTS: Record<string, string> = {
  email: "u.email",
  username: "u.username",
  role: "u.role",
  provider: "u.provider",
  pantryCount: "pantry_count",
  cookSessionCount: "cook_session_count",
  createdAt: "u.created_at",
  lastLoginAt: "u.last_login_at",
};

function getAdminUser(req: Request): AdminPayload {
  return (req as Request & { adminUser: AdminPayload }).adminUser;
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const q = (req.query.q as string) ?? "";
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit, { def: 50, max: 100 });
  const offset = (page - 1) * limit;
  const role = req.query.role as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (q) {
    conditions.push(
      `(u.email ILIKE $${pi} OR u.username ILIKE $${pi} OR u.id::text ILIKE $${pi})`
    );
    params.push(`%${q}%`);
    pi++;
  }
  if (role) {
    conditions.push(`u.role = $${pi}`);
    params.push(role);
    pi++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderBy = buildOrderBy(req.query.sort, req.query.dir, USER_SORTS, "u.created_at", "u.id");

  const [users, countRows] = await Promise.all([
    query<{
      id: string;
      email: string;
      username: string;
      role: string;
      provider: string;
      is_guest: boolean;
      created_at: string;
      last_login_at: string;
      pantry_count: string;
      cook_session_count: string;
    }>(
      `SELECT
         u.id, u.email, u.username, u.role, u.provider, u.is_guest,
         u.created_at, u.last_login_at,
         COALESCE((SELECT COUNT(*) FROM pantry_items pi WHERE pi.user_id = u.id AND pi.deleted_at IS NULL), 0)::text AS pantry_count,
         COALESCE((SELECT COUNT(*) FROM cook_sessions cs WHERE cs.user_id = u.id), 0)::text AS cook_session_count
       FROM users u
       ${where}
       ${orderBy}
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM users u ${where}`,
      params
    ),
  ]);

  const dto = users.map((u) => ({
    id: u.id,
    email: u.email,
    username: u.username,
    role: u.role,
    provider: u.provider,
    isGuest: u.is_guest,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
    pantryCount: parseInt(u.pantry_count, 10),
    cookSessionCount: parseInt(u.cook_session_count, 10),
  }));

  if (
    await maybeSendExport(
      res,
      req.query.format,
      `users-${new Date().toISOString().slice(0, 10)}`,
      dto,
      [
        "id",
        "email",
        "username",
        "role",
        "provider",
        "isGuest",
        "pantryCount",
        "cookSessionCount",
        "createdAt",
        "lastLoginAt",
      ]
    )
  ) {
    return;
  }

  res.json({
    users: dto,
    total: parseInt(countRows[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

export async function getUserDetail(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;

  const [user, recentEvents] = await Promise.all([
    queryOne<{
      id: string;
      email: string;
      username: string;
      role: string;
      provider: string;
      is_guest: boolean;
      created_at: string;
      last_login_at: string;
      display_name: string;
      pantry_count: string;
      cook_session_count: string;
      user_recipe_count: string;
      shopping_item_count: string;
    }>(
      `SELECT
         u.id, u.email, u.username, u.role, u.provider, u.is_guest,
         u.created_at, u.last_login_at,
         p.display_name,
         (SELECT COUNT(*) FROM pantry_items WHERE user_id = u.id AND deleted_at IS NULL)::text AS pantry_count,
         (SELECT COUNT(*) FROM cook_sessions WHERE user_id = u.id)::text AS cook_session_count,
         (SELECT COUNT(*) FROM user_recipes WHERE user_id = u.id)::text AS user_recipe_count,
         (SELECT COUNT(*) FROM shopping_items WHERE user_id = u.id)::text AS shopping_item_count
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    ),
    query<{ event: string; created_at: string; properties: unknown }>(
      `SELECT event, created_at, properties
       FROM analytics_events
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    ),
  ]);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    provider: user.provider,
    isGuest: user.is_guest,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    displayName: user.display_name,
    pantryItemCount: parseInt(user.pantry_count, 10),
    cookSessionCount: parseInt(user.cook_session_count, 10),
    userRecipeCount: parseInt(user.user_recipe_count, 10),
    shoppingItemCount: parseInt(user.shopping_item_count, 10),
    recentEvents,
  });
}

export async function setUserRole(req: Request, res: Response): Promise<void> {
  const { userId } = req.params;
  const { role, note } = req.body ?? {};
  const admin = getAdminUser(req);

  if (!["user", "admin"].includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  const existing = await queryOne<{ role: string; email: string }>(
    `SELECT role, email FROM users WHERE id = $1`,
    [userId]
  );
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await query(`UPDATE users SET role = $1 WHERE id = $2`, [role, userId]);

  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "set_user_role",
    targetType: "user",
    targetId: userId,
    oldValue: { role: existing.role },
    newValue: { role },
    decisionNote: note,
  });

  res.json({ ok: true });
}

import type { Request, Response } from "express";
import { query } from "./db.js";
import { buildOrderBy } from "./csv.js";

const HOUSEHOLD_SORTS: Record<string, string> = {
  name: "h.name",
  ownerEmail: "u.email",
  memberCount: "(SELECT COUNT(*) FROM household_members WHERE household_id = h.id)",
  createdAt: "h.created_at",
  updatedAt: "h.updated_at",
};

export async function listHouseholds(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
  const offset = (page - 1) * limit;
  const orderBy = buildOrderBy(req.query.sort, req.query.dir, HOUSEHOLD_SORTS, "h.created_at", "h.id");

  const [rows, count] = await Promise.all([
    query<{
      id: string;
      name: string;
      owner_user_id: string;
      owner_email: string | null;
      member_count: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT h.id, h.name, h.owner_user_id, u.email AS owner_email,
              (SELECT COUNT(*)::text FROM household_members WHERE household_id = h.id) AS member_count,
              h.created_at, h.updated_at
         FROM households h
         LEFT JOIN users u ON u.id = h.owner_user_id
         ${orderBy}
         LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM households`),
  ]);

  res.json({
    households: rows.map((r) => ({
      id: r.id,
      name: r.name,
      ownerUserId: r.owner_user_id,
      ownerEmail: r.owner_email,
      memberCount: parseInt(r.member_count, 10),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    total: parseInt(count[0]?.n ?? "0", 10),
    page,
    limit,
  });
}

export async function getHouseholdMembers(req: Request, res: Response): Promise<void> {
  const { householdId } = req.params;

  const rows = await query<{
    id: string;
    display_name: string;
    age_group: string;
    allergies: unknown;
    allergy_groups: unknown;
    disliked_ingredients: unknown;
    dietary_restrictions: unknown;
    notes: string | null;
    is_primary: boolean;
    created_at: string;
  }>(
    `SELECT id, display_name, age_group, allergies, allergy_groups,
            disliked_ingredients, dietary_restrictions, notes, is_primary, created_at
       FROM household_members
       WHERE household_id = $1
       ORDER BY is_primary DESC, created_at ASC`,
    [householdId]
  );

  // Items can be plain strings or objects like {name: "Gluten", mode: "avoid", ...}.
  // Normalize to a printable string for the dashboard.
  const toLabels = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    return v
      .map((it): string | null => {
        if (it == null) return null;
        if (typeof it === "string") return it;
        if (typeof it === "object") {
          const obj = it as Record<string, unknown>;
          const name = obj.name ?? obj.label ?? obj.id;
          const mode = obj.mode;
          if (typeof name === "string") {
            return mode && mode !== "avoid" ? `${name} (${String(mode)})` : name;
          }
        }
        return null;
      })
      .filter((s): s is string => s !== null);
  };

  res.json({
    members: rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      ageGroup: r.age_group,
      allergies: toLabels(r.allergies),
      allergyGroups: toLabels(r.allergy_groups),
      dislikedIngredients: toLabels(r.disliked_ingredients),
      dietaryRestrictions: toLabels(r.dietary_restrictions),
      notes: r.notes,
      isPrimary: r.is_primary,
      createdAt: r.created_at,
    })),
  });
}

import { query, queryOne } from "./db.js";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { isTotpEnabled, verifyTotpCode } from "./totp.js";

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  throw new Error(
    "SESSION_SECRET env var must be set to a strong value (>=16 chars) for ops auth"
  );
}
const JWT_SECRET: string = SESSION_SECRET;
const TOKEN_EXPIRY = "12h";
const TOTP_CHALLENGE_EXPIRY = "5m";

export interface AdminPayload {
  userId: string;
  role: string;
}

interface TotpChallengePayload {
  userId: string;
  purpose: "totp_challenge";
}

export const ADMIN_ROLES_READ = ["admin", "read_only_admin"] as const;
export const ADMIN_ROLES_WRITE = ["admin"] as const;

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return (req.cookies?.ops_token as string | undefined) ?? null;
}

function makeRoleGate(allowed: readonly string[]) {
  return async function gate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET) as AdminPayload;
      if (!allowed.includes(payload.role)) {
        res.status(403).json({
          error:
            allowed.length === 1
              ? `${allowed[0]} access required`
              : "Admin access required",
        });
        return;
      }
      (req as Request & { adminUser: AdminPayload }).adminUser = payload;
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

/**
 * Default gate: read-tier admin access. Both `admin` and `read_only_admin`
 * pass. Use this on every GET endpoint and any endpoint a read-only admin
 * should be able to invoke.
 */
export const requireAdmin = makeRoleGate(ADMIN_ROLES_READ);

/**
 * Write-tier gate: only full `admin`. Use on every endpoint that mutates
 * state (POST/PATCH/DELETE) — promote, reject, role change, decide,
 * trigger job, clear stuck, set flag, etc.
 */
export const requireAdminWrite = makeRoleGate(ADMIN_ROLES_WRITE);

function signSessionToken(user: { id: string; role: string }): string {
  return jwt.sign(
    { userId: user.id, role: user.role } satisfies AdminPayload,
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function signTotpChallenge(userId: string): string {
  return jwt.sign(
    { userId, purpose: "totp_challenge" } satisfies TotpChallengePayload,
    JWT_SECRET,
    { expiresIn: TOTP_CHALLENGE_EXPIRY }
  );
}

export async function opsLogin(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "email and password required" });
    return;
  }

  const user = await queryOne<{
    id: string;
    email: string;
    username: string;
    password: string;
    role: string;
  }>(
    `SELECT id, email, username, password, role FROM users
       WHERE email = $1 AND role = ANY($2::text[]) LIMIT 1`,
    [email, ADMIN_ROLES_READ]
  );

  if (!user) {
    res.status(401).json({ error: "Invalid credentials or not an admin" });
    return;
  }

  const valid = user.password ? await bcrypt.compare(password, user.password) : false;
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // If TOTP is enabled, return a short-lived challenge token instead of a
  // session token. Client must call /auth/2fa/verify-login to exchange it.
  if (await isTotpEnabled(user.id)) {
    res.json({
      needsTotp: true,
      challengeToken: signTotpChallenge(user.id),
    });
    return;
  }

  res.json({
    token: signSessionToken(user),
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    },
  });
}

export async function verifyTotpLogin(req: Request, res: Response): Promise<void> {
  const { challengeToken, code } = req.body ?? {};
  if (typeof challengeToken !== "string" || typeof code !== "string") {
    res.status(400).json({ error: "challengeToken and code required" });
    return;
  }
  let payload: TotpChallengePayload;
  try {
    payload = jwt.verify(challengeToken, JWT_SECRET) as TotpChallengePayload;
  } catch {
    res.status(401).json({ error: "Invalid or expired challenge" });
    return;
  }
  if (payload.purpose !== "totp_challenge") {
    res.status(401).json({ error: "Wrong token type" });
    return;
  }
  const ok = await verifyTotpCode(payload.userId, code);
  if (!ok) {
    res.status(401).json({ error: "Invalid TOTP code" });
    return;
  }
  const user = await queryOne<{
    id: string;
    email: string;
    username: string;
    role: string;
  }>(
    `SELECT id, email, username, role FROM users WHERE id = $1`,
    [payload.userId]
  );
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    token: signSessionToken(user),
    user,
  });
}

export async function opsMe(req: Request, res: Response): Promise<void> {
  const payload = (req as Request & { adminUser?: AdminPayload }).adminUser;
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = await queryOne<{
    id: string;
    email: string;
    username: string;
    role: string;
  }>(
    `SELECT id, email, username, role FROM users WHERE id = $1 LIMIT 1`,
    [payload.userId]
  );
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  // Surface 2FA enabled flag so the dashboard can show a badge.
  const totpEnabled = await isTotpEnabled(user.id);
  res.json({ ...user, totpEnabled });
}

// Force the legacy `query` import to be re-exported as a side-effect of being
// imported elsewhere if the bundler tree-shakes it. (Defensive — `query` is
// exported by ./db.js, this file just imports it for the bcrypt path.)
void query;

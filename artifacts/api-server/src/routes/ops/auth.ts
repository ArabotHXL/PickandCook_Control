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
  purpose: "admin_session";
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

      // Reject TOTP challenge tokens and any token not explicitly marked as
      // an authenticated admin session. This prevents a challenge token issued
      // during the TOTP flow from being used to access protected routes.
      if (payload.purpose !== "admin_session") {
        res.status(401).json({ error: "Invalid token type" });
        return;
      }

      // Re-read the user's current role from the database on every request so
      // that role changes (e.g. demotions) take effect immediately without
      // waiting for the token to expire.
      const currentUser = await queryOne<{ role: string }>(
        `SELECT role FROM users WHERE id = $1 LIMIT 1`,
        [payload.userId]
      );
      if (!currentUser) {
        res.status(401).json({ error: "User not found" });
        return;
      }

      if (!allowed.includes(currentUser.role)) {
        res.status(403).json({
          error:
            allowed.length === 1
              ? `${allowed[0]} access required`
              : "Admin access required",
        });
        return;
      }

      // Attach the up-to-date role so downstream handlers always see the
      // current value rather than the stale claim from the token.
      (req as Request & { adminUser: AdminPayload }).adminUser = {
        userId: payload.userId,
        role: currentUser.role,
        purpose: "admin_session",
      };
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
    { userId: user.id, role: user.role, purpose: "admin_session" } satisfies AdminPayload,
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

// A pre-computed bcrypt hash of a dummy value used to perform a constant-time
// comparison when no real user record is found. This prevents timing-based
// email enumeration: the bcrypt work factor is always paid regardless of
// whether the submitted email matches any account.
const DUMMY_HASH = await bcrypt.hash("dummy-constant-time-guard", 10);

export async function opsLogin(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "email and password required" });
    return;
  }

  // Look up by email only — do NOT filter by role here. Filtering by role
  // would cause the query to return no rows for non-admin emails, making the
  // subsequent code path shorter and returning a distinguishable error, which
  // lets attackers enumerate which emails belong to admin accounts.
  const user = await queryOne<{
    id: string;
    email: string;
    username: string;
    password: string;
    role: string;
  }>(
    `SELECT id, email, username, password, role FROM users
       WHERE email = $1 LIMIT 1`,
    [email]
  );

  // Always run bcrypt.compare so the response time is consistent whether the
  // email exists, doesn't exist, or belongs to a non-admin. This eliminates
  // the timing side-channel that would otherwise reveal account existence.
  const hashToCompare = user?.password ?? DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCompare);

  // Use a single generic error for all failure modes (unknown email,
  // non-admin role, wrong password). Distinct messages would let an attacker
  // learn which emails are registered as admin accounts.
  if (!valid || !user || !(ADMIN_ROLES_READ as readonly string[]).includes(user.role)) {
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

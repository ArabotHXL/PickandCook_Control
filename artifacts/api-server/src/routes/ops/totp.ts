/**
 * Admin TOTP 2FA (opt-in per admin).
 *
 * Flow:
 *   1. Admin hits POST /api/ops/auth/2fa/setup → server generates a secret,
 *      stores it in `admin_totp` (enabled_at = NULL), returns the secret +
 *      otpauth:// URI for the admin to add to Google/1Password/Authy.
 *   2. Admin POSTs /api/ops/auth/2fa/verify-setup with the first 6-digit
 *      code from their authenticator. Server checks it; if valid, sets
 *      enabled_at = NOW(). Now the admin's account requires 2FA on login.
 *   3. On login, opsLogin (auth.ts) checks if the admin has TOTP enabled. If
 *      so, it returns `{ needsTotp: true, challengeToken }` instead of a real
 *      session token. The challenge token is short-lived (5min) JWT signed
 *      with SESSION_SECRET. Admin POSTs /api/ops/auth/2fa/verify-login with
 *      challengeToken + code, and gets back a real session token.
 *   4. POST /api/ops/auth/2fa/disable (auth-required) wipes the row.
 */
import type { Request, Response } from "express";
import { query, queryOne } from "./db.js";
import { writeAuditLog } from "./audit.js";
import type { AdminPayload } from "./auth.js";
import { generateSecret, generateURI, verifySync } from "otplib";

function getAdminUser(req: Request): AdminPayload {
  return (req as Request & { adminUser: AdminPayload }).adminUser;
}

const ISSUER = "PickAndCook Ops";

// Idempotent column add for replay protection. Cheap on every call so we don't
// have to thread it through migrations.ts in this PR.
let lastUsedColumnEnsured: Promise<void> | null = null;
async function ensureLastUsedWindowColumn(): Promise<void> {
  if (!lastUsedColumnEnsured) {
    lastUsedColumnEnsured = query(
      `ALTER TABLE admin_totp ADD COLUMN IF NOT EXISTS last_used_window BIGINT`
    ).then(() => undefined);
  }
  return lastUsedColumnEnsured;
}

function currentTotpWindow(): number {
  return Math.floor(Date.now() / 1000 / 30);
}

export async function getTotpStatus(req: Request, res: Response): Promise<void> {
  const admin = getAdminUser(req);
  const row = await queryOne<{ enabled_at: string | null; last_verified_at: string | null }>(
    `SELECT enabled_at, last_verified_at FROM admin_totp WHERE user_id = $1`,
    [admin.userId]
  );
  res.json({
    enabled: !!row?.enabled_at,
    enabledAt: row?.enabled_at ?? null,
    lastVerifiedAt: row?.last_verified_at ?? null,
  });
}

export async function startTotpSetup(req: Request, res: Response): Promise<void> {
  const admin = getAdminUser(req);

  // Reject if already enabled — admin must `disable` first to rotate.
  const existing = await queryOne<{ enabled_at: string | null }>(
    `SELECT enabled_at FROM admin_totp WHERE user_id = $1`,
    [admin.userId]
  );
  if (existing?.enabled_at) {
    res.status(409).json({ error: "TOTP already enabled. Disable first to rotate." });
    return;
  }

  const secret = generateSecret();
  const userRow = await queryOne<{ email: string }>(
    `SELECT email FROM users WHERE id = $1`,
    [admin.userId]
  );
  const label = userRow?.email ?? admin.userId;
  const otpauth = generateURI({
    issuer: ISSUER,
    label,
    secret,
  });

  await query(
    `INSERT INTO admin_totp (user_id, secret, enabled_at, created_at)
     VALUES ($1, $2, NULL, NOW())
     ON CONFLICT (user_id) DO UPDATE SET secret = EXCLUDED.secret, enabled_at = NULL`,
    [admin.userId, secret]
  );

  res.json({ secret, otpauthUri: otpauth, issuer: ISSUER });
}

export async function verifyTotpSetup(req: Request, res: Response): Promise<void> {
  const admin = getAdminUser(req);
  const { code } = req.body ?? {};
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "code must be a 6-digit string" });
    return;
  }
  const row = await queryOne<{ secret: string; enabled_at: string | null }>(
    `SELECT secret, enabled_at FROM admin_totp WHERE user_id = $1`,
    [admin.userId]
  );
  if (!row) {
    res.status(400).json({ error: "Run /setup first" });
    return;
  }
  if (row.enabled_at) {
    res.status(409).json({ error: "Already enabled" });
    return;
  }
  const valid = verifySync({ token: code, secret: row.secret }).valid;
  if (!valid) {
    res.status(401).json({ error: "Invalid code" });
    return;
  }
  await query(
    `UPDATE admin_totp SET enabled_at = NOW(), last_verified_at = NOW() WHERE user_id = $1`,
    [admin.userId]
  );
  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "totp_enable",
    targetType: "admin_user",
    targetId: admin.userId,
  });
  res.json({ ok: true, enabled: true });
}

export async function disableTotp(req: Request, res: Response): Promise<void> {
  const admin = getAdminUser(req);
  const { code } = req.body ?? {};
  // Require a current code (or password fallback) to disable. Here we require
  // a valid code so a stolen session can't trivially nuke the second factor.
  const row = await queryOne<{ secret: string; enabled_at: string | null }>(
    `SELECT secret, enabled_at FROM admin_totp WHERE user_id = $1`,
    [admin.userId]
  );
  if (!row?.enabled_at) {
    res.status(400).json({ error: "TOTP not enabled" });
    return;
  }
  if (typeof code !== "string" || !verifySync({ token: code, secret: row.secret }).valid) {
    res.status(401).json({ error: "Valid TOTP code required to disable" });
    return;
  }
  await query(`DELETE FROM admin_totp WHERE user_id = $1`, [admin.userId]);
  await writeAuditLog({
    adminUserId: admin.userId,
    actionType: "totp_disable",
    targetType: "admin_user",
    targetId: admin.userId,
  });
  res.json({ ok: true, enabled: false });
}

/**
 * Helpers used by `auth.ts` opsLogin to decide whether to issue a normal
 * session token or a challenge token.
 */
export async function isTotpEnabled(userId: string): Promise<boolean> {
  const row = await queryOne<{ enabled_at: string | null }>(
    `SELECT enabled_at FROM admin_totp WHERE user_id = $1`,
    [userId]
  );
  return !!row?.enabled_at;
}

export async function verifyTotpCode(userId: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  await ensureLastUsedWindowColumn();
  const row = await queryOne<{ secret: string; enabled_at: string | null; last_used_window: string | null }>(
    `SELECT secret, enabled_at, last_used_window FROM admin_totp WHERE user_id = $1`,
    [userId]
  );
  if (!row?.enabled_at) return false;
  const ok = verifySync({ token: code, secret: row.secret }).valid;
  if (!ok) return false;

  // Replay protection: the verifySync window is the current 30s slot. Atomically
  // record it; if a previous successful verify already used this exact window,
  // reject — the same code can't be replayed within its 30s lifetime even if
  // the attacker has the challenge JWT and the captured code.
  const win = currentTotpWindow();
  const claim = await query<{ id: string }>(
    `UPDATE admin_totp
        SET last_used_window = $2, last_verified_at = NOW()
      WHERE user_id = $1
        AND (last_used_window IS NULL OR last_used_window < $2)
      RETURNING user_id AS id`,
    [userId, win]
  );
  return claim.length > 0;
}

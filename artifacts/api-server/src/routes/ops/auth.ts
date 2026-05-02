import { query, queryOne } from "./db.js";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  throw new Error(
    "SESSION_SECRET env var must be set to a strong value (>=16 chars) for ops auth"
  );
}
const JWT_SECRET: string = SESSION_SECRET;
const TOKEN_EXPIRY = "12h";

export interface AdminPayload {
  userId: string;
  role: string;
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token =
    authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : (req.cookies?.ops_token as string | undefined);

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AdminPayload;
    if (payload.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    (req as Request & { adminUser: AdminPayload }).adminUser = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
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
    `SELECT id, email, username, password, role FROM users WHERE email = $1 AND role = 'admin' LIMIT 1`,
    [email]
  );

  if (!user) {
    res.status(401).json({ error: "Invalid credentials or not an admin" });
    return;
  }

  const valid = user.password
    ? await bcrypt.compare(password, user.password)
    : false;

  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role } satisfies AdminPayload,
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    },
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
  res.json(user);
}

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

// Parse the URL manually so env vars (PGHOST, PGUSER etc.) don't override it
function parseUrl(url: string): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
} {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    ssl: u.hostname.includes("neon.tech") || u.searchParams.get("sslmode") === "require",
  };
}

const parsed = parseUrl(DATABASE_URL);

export const opsPool = new Pool({
  host: parsed.host,
  port: parsed.port,
  user: parsed.user,
  password: parsed.password,
  database: parsed.database,
  ssl: parsed.ssl ? { rejectUnauthorized: true } : false,
  max: 5,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 120000,
});

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await opsPool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export interface TxClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
}

export async function withTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  const client = await opsPool.connect();
  try {
    await client.query("BEGIN");
    const tx: TxClient = {
      async query<R = Record<string, unknown>>(sql: string, params?: unknown[]) {
        const r = await client.query(sql, params);
        return r.rows as R[];
      },
      async queryOne<R = Record<string, unknown>>(sql: string, params?: unknown[]) {
        const r = await client.query(sql, params);
        return (r.rows[0] as R | undefined) ?? null;
      },
    };
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* swallow */ }
    throw e;
  } finally {
    client.release();
  }
}

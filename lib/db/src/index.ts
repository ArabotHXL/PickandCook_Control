import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Recycle idle clients before the managed Postgres provider does (~90s),
  // otherwise the provider closes them on us and pg surfaces an 'error' event.
  idleTimeoutMillis: 30_000,
  keepAlive: true,
});

pool.on("error", (err) => {
  // Demoted to debug: the provider can still close a connection between our
  // idle sweep and a fresh checkout. The pool removes the bad client and
  // reconnects transparently, so this is not actionable for on-call.
  console.debug("[db] idle pg client recycled", err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";

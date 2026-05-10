import { describe, it, expect, vi } from "vitest";
import {
  classifyTable,
  buildConflictClause,
  bindValue,
  quoteIdent,
  syncTable,
} from "./neonDaily.js";
import type { JobContext } from "../runner.js";

describe("classifyTable", () => {
  it("upserts known reference tables", () => {
    expect(classifyTable("products")).toBe("upsert");
    expect(classifyTable("barcode_meta")).toBe("upsert");
    expect(classifyTable("recipes")).toBe("upsert");
  });
  it("preserves local writes on user/transactional tables", () => {
    expect(classifyTable("users")).toBe("skip");
    expect(classifyTable("receipt_headers")).toBe("skip");
    expect(classifyTable("pantry_item_events")).toBe("skip");
  });
  it("skips backup tables outright", () => {
    expect(classifyTable("products_dept_backup_20240101")).toBe("skipped");
    expect(classifyTable("products_dept_backup")).toBe("skipped");
  });
  it("defaults unknown tables to skip", () => {
    expect(classifyTable("brand_new_table")).toBe("skip");
  });
});

describe("buildConflictClause", () => {
  it("emits idempotent DO UPDATE for upsert mode (with IS DISTINCT FROM guard)", () => {
    const sql = buildConflictClause("products", ["id"], ["name", "price"], "upsert");
    expect(sql).toBe(
      `ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "price" = EXCLUDED."price" WHERE "products".* IS DISTINCT FROM EXCLUDED.*`,
    );
  });
  it("emits DO NOTHING for skip mode", () => {
    const sql = buildConflictClause("users", ["id"], ["name"], "skip");
    expect(sql).toBe(`ON CONFLICT ("id") DO NOTHING`);
  });
  it("falls back to DO NOTHING when no non-pk cols (PK-only table)", () => {
    const sql = buildConflictClause("join_tbl", ["a", "b"], [], "upsert");
    expect(sql).toBe(`ON CONFLICT ("a", "b") DO NOTHING`);
  });
  it("quotes identifiers safely (table + cols)", () => {
    const sql = buildConflictClause('weird"tbl', ['weird"id'], ['col"x'], "upsert");
    expect(sql).toContain(`"weird""id"`);
    expect(sql).toContain(`"col""x"`);
    expect(sql).toContain(`"weird""tbl".*`);
  });
});

describe("bindValue", () => {
  it("returns null for null/undefined", () => {
    expect(bindValue(null, "text")).toBeNull();
    expect(bindValue(undefined, "jsonb")).toBeNull();
  });
  it("stringifies json/jsonb objects", () => {
    expect(bindValue({ a: 1 }, "jsonb")).toBe('{"a":1}');
    expect(bindValue([1, 2], "json")).toBe("[1,2]");
  });
  it("passes through pre-stringified json values", () => {
    expect(bindValue('{"a":1}', "jsonb")).toBe('{"a":1}');
  });
  it("passes through scalar values for non-json types", () => {
    expect(bindValue("hello", "text")).toBe("hello");
    expect(bindValue(42, "integer")).toBe(42);
    expect(bindValue(true, "boolean")).toBe(true);
  });
});

describe("quoteIdent", () => {
  it("wraps in double quotes", () => {
    expect(quoteIdent("foo")).toBe('"foo"');
  });
  it("escapes embedded double quotes", () => {
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });
});

// ---------------------------------------------------------------------------
// Integration-style tests with mocked pg.Client behavior. These exercise the
// real syncTable code path end-to-end (column lookup → PK lookup → row count
// → batch SELECT → batch INSERT) and assert the shape of the SQL we emit
// + the params we bind, plus per-table error isolation.
// ---------------------------------------------------------------------------

const log: JobContext["log"] = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as JobContext["log"];

interface MockResult {
  rows: Record<string, unknown>[];
  rowCount?: number;
}

/** Build a mock Queryable whose .query() returns canned responses keyed by
 *  the substring matched on the SQL text. Records every call for assertions. */
type Queryable = Parameters<typeof syncTable>[0];

function mockClient(handler: (sql: string, params?: unknown[]) => MockResult) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return handler(sql, params);
  });
  return { query: query as unknown as Queryable["query"], calls, raw: query };
}

const PRODUCT_COLS = [
  { column_name: "id", data_type: "integer" },
  { column_name: "name", data_type: "text" },
  { column_name: "tags", data_type: "jsonb" },
];

function productSrcHandler(rows: Record<string, unknown>[]) {
  return (sql: string, _params?: unknown[]): MockResult => {
    if (sql.includes("information_schema.columns")) return { rows: PRODUCT_COLS };
    if (sql.includes("COUNT(*)")) return { rows: [{ n: String(rows.length) }] };
    if (sql.startsWith("SELECT") && sql.includes('FROM "')) return { rows };
    return { rows: [] };
  };
}

function productDstHandler(insertResp: MockResult) {
  return (sql: string, _params?: unknown[]): MockResult => {
    if (sql.includes("information_schema.columns")) return { rows: PRODUCT_COLS };
    if (sql.includes("pg_index")) return { rows: [{ column_name: "id" }] };
    if (sql.startsWith("INSERT INTO")) return insertResp;
    return { rows: [] };
  };
}

describe("syncTable (integration with mocked clients)", () => {
  it("upsert mode: emits DO UPDATE with IS DISTINCT FROM, stringifies jsonb, splits inserts/updates via xmax", async () => {
    const srcRows = [
      { id: 1, name: "apple", tags: { color: "red" } },
      { id: 2, name: "banana", tags: ["yellow"] },
    ];
    const src = mockClient(productSrcHandler(srcRows));
    // Postgres returns one RETURNING row per affected row; xmax = 0 ⇒ insert,
    // xmax != 0 ⇒ update. Mock 1 fresh insert, 1 actual update.
    const dst = mockClient(
      productDstHandler({ rows: [{ inserted: true }, { inserted: false }], rowCount: 2 }),
    );

    const r = await syncTable(src, dst, "products", "upsert", log);

    expect(r.copied).toBe(1);
    expect(r.updated).toBe(1);
    expect(r.skipped).toBe(0);
    expect(r.srcCount).toBe(2);
    expect(r.error).toBeUndefined();

    const insert = dst.calls.find((c) => c.sql.startsWith("INSERT INTO"))!;
    expect(insert.sql).toContain('INSERT INTO "products"');
    expect(insert.sql).toContain("DO UPDATE SET");
    expect(insert.sql).toContain('"products".* IS DISTINCT FROM EXCLUDED.*');
    expect(insert.sql).toContain("RETURNING (xmax = 0) AS inserted");

    // jsonb values must be stringified before binding.
    const params = insert.params as unknown[];
    expect(params).toContain('{"color":"red"}');
    expect(params).toContain('["yellow"]');
  });

  it("skip mode: emits DO NOTHING and counts unaffected rows as skipped", async () => {
    const srcRows = [
      { id: 10, name: "alice", tags: null },
      { id: 11, name: "bob", tags: null },
    ];
    const src = mockClient(productSrcHandler(srcRows));
    // Both rows had a PK conflict ⇒ DO NOTHING fires ⇒ no RETURNING rows.
    const dst = mockClient(productDstHandler({ rows: [], rowCount: 0 }));

    const r = await syncTable(src, dst, "users", "skip", log);

    expect(r.copied).toBe(0);
    expect(r.updated).toBe(0);
    expect(r.skipped).toBe(2);

    const insert = dst.calls.find((c) => c.sql.startsWith("INSERT INTO"))!;
    expect(insert.sql).toContain("DO NOTHING");
    expect(insert.sql).not.toContain("DO UPDATE");
    expect(insert.sql).not.toContain("IS DISTINCT FROM");
  });

  it("destination missing the table → returns note, no INSERT issued", async () => {
    const src = mockClient(productSrcHandler([]));
    const dst = mockClient((sql) => {
      if (sql.includes("information_schema.columns")) return { rows: [] }; // missing
      return { rows: [] };
    });

    const r = await syncTable(src, dst, "meal_plans", "upsert", log);

    expect(r.note).toBe("table missing on destination");
    expect(dst.calls.find((c) => c.sql.startsWith("INSERT INTO"))).toBeUndefined();
  });

  it("isolates per-table batch errors (sets result.error, does not throw)", async () => {
    const srcRows = [{ id: 1, name: "x", tags: null }];
    const src = mockClient(productSrcHandler(srcRows));
    const dst = mockClient((sql) => {
      if (sql.includes("information_schema.columns")) return { rows: PRODUCT_COLS };
      if (sql.includes("pg_index")) return { rows: [{ column_name: "id" }] };
      if (sql.startsWith("INSERT INTO")) throw new Error("boom: deadlock detected");
      return { rows: [] };
    });

    const r = await syncTable(src, dst, "products", "upsert", log);

    expect(r.error).toContain("boom: deadlock detected");
    expect(r.copied).toBe(0);
    expect(r.updated).toBe(0);
  });
});

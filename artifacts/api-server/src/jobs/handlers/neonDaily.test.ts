import { describe, it, expect } from "vitest";
import {
  classifyTable,
  buildConflictClause,
  bindValue,
  quoteIdent,
} from "./neonDaily.js";

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
  it("emits DO UPDATE for upsert mode with non-pk cols", () => {
    const sql = buildConflictClause(["id"], ["name", "price"], "upsert");
    expect(sql).toBe(
      `ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "price" = EXCLUDED."price"`,
    );
  });
  it("emits DO NOTHING for skip mode", () => {
    const sql = buildConflictClause(["id"], ["name"], "skip");
    expect(sql).toBe(`ON CONFLICT ("id") DO NOTHING`);
  });
  it("falls back to DO NOTHING when no non-pk cols (PK-only table)", () => {
    const sql = buildConflictClause(["a", "b"], [], "upsert");
    expect(sql).toBe(`ON CONFLICT ("a", "b") DO NOTHING`);
  });
  it("quotes identifiers safely", () => {
    const sql = buildConflictClause(['weird"id'], ['col"x'], "upsert");
    expect(sql).toContain(`"weird""id"`);
    expect(sql).toContain(`"col""x"`);
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

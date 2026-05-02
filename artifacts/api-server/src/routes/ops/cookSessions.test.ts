import { describe, it, expect } from "vitest";
import {
  resolveItemizedOrderBy,
  resolveSinceInterval,
  ITEMIZED_SORT_COLUMNS,
  SINCE_WINDOWS,
} from "./cookSessions.js";

describe("resolveItemizedOrderBy", () => {
  it("defaults to suggested_count DESC, tiebreaker on ingredient_name", () => {
    expect(resolveItemizedOrderBy(undefined, undefined)).toBe(
      "ORDER BY suggested_count DESC NULLS LAST, ingredient_name ASC",
    );
  });

  it("rejects unknown sort keys (no SQL injection)", () => {
    const evil = "ingredient_name; DROP TABLE pantry_deduction_reviews;--";
    const orderBy = resolveItemizedOrderBy(evil, "asc");
    expect(orderBy).toBe(
      "ORDER BY suggested_count ASC NULLS LAST, ingredient_name ASC",
    );
    expect(orderBy).not.toContain("DROP");
  });

  it("only honours asc/desc", () => {
    expect(resolveItemizedOrderBy("skipRate", "asc")).toContain("skip_rate ASC");
    expect(resolveItemizedOrderBy("skipRate", "garbage")).toContain("skip_rate DESC");
    expect(resolveItemizedOrderBy("skipRate", "'; --")).toContain("skip_rate DESC");
  });

  it("maps every allowlisted key", () => {
    for (const [key, col] of Object.entries(ITEMIZED_SORT_COLUMNS)) {
      expect(resolveItemizedOrderBy(key, "desc")).toContain(`${col} DESC`);
    }
  });
});

describe("resolveSinceInterval", () => {
  it("defaults to 30 days", () => {
    expect(resolveSinceInterval(undefined)).toBe("30 days");
    expect(resolveSinceInterval("")).toBe("30 days");
    expect(resolveSinceInterval("not-a-window")).toBe("30 days");
  });

  it("maps every allowlisted window", () => {
    for (const [key, value] of Object.entries(SINCE_WINDOWS)) {
      expect(resolveSinceInterval(key)).toBe(value);
    }
  });

  it("rejects non-string input", () => {
    expect(resolveSinceInterval(123)).toBe("30 days");
    expect(resolveSinceInterval({ since: "all" })).toBe("30 days");
  });
});

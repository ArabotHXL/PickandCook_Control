import { describe, it, expect } from "vitest";
import { resolveStagingOrderBy, STAGING_SORT_COLUMNS } from "./recipesStaging.js";

describe("resolveStagingOrderBy", () => {
  it("defaults to created_at DESC when no sort key is given", () => {
    expect(resolveStagingOrderBy(undefined, undefined)).toBe(
      "created_at DESC NULLS LAST, created_at DESC",
    );
  });

  it("falls back to created_at for unknown sort keys (no SQL injection)", () => {
    const evil = "title; DROP TABLE imported_recipes_staging;--";
    const orderBy = resolveStagingOrderBy(evil, "asc");
    expect(orderBy).toBe("created_at ASC NULLS LAST, created_at DESC");
    expect(orderBy).not.toContain("DROP");
  });

  it("only accepts asc/desc; anything else maps to DESC", () => {
    expect(resolveStagingOrderBy("title", "asc")).toContain("title ASC");
    expect(resolveStagingOrderBy("title", "desc")).toContain("title DESC");
    expect(resolveStagingOrderBy("title", "garbage")).toContain("title DESC");
    expect(resolveStagingOrderBy("title", undefined)).toContain("title DESC");
  });

  it("maps mappingRate -> mapping_rate column", () => {
    expect(resolveStagingOrderBy("mappingRate", "asc")).toContain("mapping_rate ASC");
  });

  it("maps unmappedCount to jsonb_array_length expression", () => {
    expect(resolveStagingOrderBy("unmappedCount", "desc")).toContain(
      "jsonb_array_length(coalesce(unmapped_ingredient_names, '[]'::jsonb)) DESC",
    );
  });

  it("appends a deterministic created_at DESC tiebreaker on every sort", () => {
    for (const key of Object.keys(STAGING_SORT_COLUMNS)) {
      expect(resolveStagingOrderBy(key, "asc")).toMatch(/, created_at DESC$/);
      expect(resolveStagingOrderBy(key, "desc")).toMatch(/, created_at DESC$/);
    }
  });
});

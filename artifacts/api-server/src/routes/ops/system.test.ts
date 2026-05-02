import { describe, it, expect } from "vitest";
import { resolveJobRunsOrderBy, JOB_RUNS_SORT_COLUMNS } from "./system.js";

describe("resolveJobRunsOrderBy", () => {
  it("defaults to started_at DESC", () => {
    expect(resolveJobRunsOrderBy(undefined, undefined)).toBe(
      "started_at DESC NULLS LAST, started_at DESC",
    );
  });

  it("rejects unknown sort keys (no SQL injection)", () => {
    const evil = "started_at; DROP TABLE job_runs;--";
    const orderBy = resolveJobRunsOrderBy(evil, "asc");
    expect(orderBy).toBe("started_at ASC NULLS LAST, started_at DESC");
    expect(orderBy).not.toContain("DROP");
  });

  it("only honours asc/desc", () => {
    expect(resolveJobRunsOrderBy("durationMs", "asc")).toContain("duration_ms ASC");
    expect(resolveJobRunsOrderBy("durationMs", "garbage")).toContain("duration_ms DESC");
  });

  it("maps every allowlisted key", () => {
    for (const [key, col] of Object.entries(JOB_RUNS_SORT_COLUMNS)) {
      expect(resolveJobRunsOrderBy(key, "desc")).toContain(`${col} DESC`);
    }
  });
});

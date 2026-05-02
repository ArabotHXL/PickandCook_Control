import { describe, it, expect } from "vitest";
import cron from "node-cron";

describe("cron expression validation", () => {
  it("accepts standard 5-field expressions used by registry defaults", () => {
    expect(cron.validate("0 3 * * *")).toBe(true);
    expect(cron.validate("0 4 * * *")).toBe(true);
    expect(cron.validate("0 5 * * 0")).toBe(true);
  });

  it("accepts common admin presets", () => {
    expect(cron.validate("*/5 * * * *")).toBe(true);
    expect(cron.validate("0 */6 * * *")).toBe(true);
    expect(cron.validate("0 0 1 * *")).toBe(true);
  });

  it("rejects garbage and SQL-injection attempts", () => {
    expect(cron.validate("not a cron")).toBe(false);
    expect(cron.validate("99 99 99 99 99")).toBe(false);
    expect(cron.validate("")).toBe(false);
    expect(cron.validate("0 3 * * *; DROP TABLE job_runs;--")).toBe(false);
  });
});

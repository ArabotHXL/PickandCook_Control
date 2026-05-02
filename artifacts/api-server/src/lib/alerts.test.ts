import { describe, it, expect } from "vitest";
import { toSlackBlocks } from "./alerts.js";

describe("toSlackBlocks", () => {
  it("formats an info alert with just a title", () => {
    const out = toSlackBlocks({ severity: "info", title: "Hello" });
    expect(out.text).toContain(":information_source:");
    expect(out.text).toContain("*Hello*");
  });

  it("includes severity prefix for error alerts", () => {
    const out = toSlackBlocks({ severity: "error", title: "Boom" });
    expect(out.text).toContain(":rotating_light:");
  });

  it("appends body and fields", () => {
    const out = toSlackBlocks({
      severity: "warn",
      title: "Stale",
      body: "details",
      fields: [{ label: "Job", value: "wikibooks:weekly" }],
    });
    expect(out.text).toContain("details");
    expect(out.text).toContain("*Job:* wikibooks:weekly");
    expect(out.text).toContain(":warning:");
  });

  it("renders a link in Slack mrkdwn syntax", () => {
    const out = toSlackBlocks({
      severity: "info",
      title: "T",
      link: { label: "Open", url: "https://x.test" },
    });
    expect(out.text).toContain("<https://x.test|Open>");
  });
});

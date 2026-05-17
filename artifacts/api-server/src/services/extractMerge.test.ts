import { describe, expect, it } from "vitest";
// Cross-package import: the helper lives in the dashboard where it's used.
// vitest resolves this at runtime; tsc respects the rootDir boundary here.
// @ts-expect-error -- path crosses artifact rootDir; runtime-only import for testing
import { mergeExtractPicks } from "../../../ops-dashboard/src/lib/extractMerge.ts";

type Merge = (
  currentRequired: string[],
  currentOptional: string[],
  picks: { required: string[]; optional: string[] }
) => { mergedRequired: string[]; mergedOptional: string[] };

const merge = mergeExtractPicks as Merge;

describe("mergeExtractPicks — additive-only invariant (task #32)", () => {
  it("preserves all existing required and optional IDs when picks are empty", () => {
    const out = merge(["a", "b"], ["c", "d"], { required: [], optional: [] });
    expect(out.mergedRequired).toEqual(["a", "b"]);
    expect(out.mergedOptional).toEqual(["c", "d"]);
  });

  it("keeps an existing optional ID even when the same ID also appears in required", () => {
    // Cross-list overlap: 'salt' is already in BOTH required and optional on
    // the persisted row (legacy data). Confirming an extract must not strip
    // it out of optional.
    const out = merge(["salt", "flour"], ["salt", "sugar"], {
      required: ["egg"],
      optional: ["butter"],
    });
    expect(out.mergedRequired).toEqual(["salt", "flour", "egg"]);
    expect(out.mergedOptional).toEqual(["salt", "sugar", "butter"]);
  });

  it("appends new required picks not already present anywhere", () => {
    const out = merge(["a"], ["b"], { required: ["c", "d"], optional: [] });
    expect(out.mergedRequired).toEqual(["a", "c", "d"]);
    expect(out.mergedOptional).toEqual(["b"]);
  });

  it("skips a required pick that already lives in the optional list", () => {
    // The pre-existing optional 'b' stays; we do not promote it and we do
    // not add a duplicate to required.
    const out = merge(["a"], ["b"], { required: ["b", "c"], optional: [] });
    expect(out.mergedRequired).toEqual(["a", "c"]);
    expect(out.mergedOptional).toEqual(["b"]);
  });

  it("skips an optional pick that just got added to required (required wins)", () => {
    const out = merge([], [], { required: ["pepper"], optional: ["pepper"] });
    expect(out.mergedRequired).toEqual(["pepper"]);
    expect(out.mergedOptional).toEqual([]);
  });

  it("skips an optional pick that is already in the existing optional list", () => {
    const out = merge([], ["b"], { required: [], optional: ["b", "c"] });
    expect(out.mergedRequired).toEqual([]);
    expect(out.mergedOptional).toEqual(["b", "c"]);
  });

  it("does not mutate the input arrays", () => {
    const req = ["a"];
    const opt = ["b"];
    const picks = { required: ["c"], optional: ["d"] };
    merge(req, opt, picks);
    expect(req).toEqual(["a"]);
    expect(opt).toEqual(["b"]);
    expect(picks).toEqual({ required: ["c"], optional: ["d"] });
  });
});

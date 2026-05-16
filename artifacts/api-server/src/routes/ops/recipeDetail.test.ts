import { describe, it, expect } from "vitest";
import {
  validateInstructionsSteps,
  validateRecipeForApproval,
  EDITABLE_JSONB,
  APPROVE_FLOW_MARKER,
} from "./recipeDetail.js";

describe("validateInstructionsSteps (whitelist scope)", () => {
  it("accepts a valid string array and trims entries", () => {
    const r = validateInstructionsSteps([" Boil water ", "Add pasta"]);
    expect("steps" in r).toBe(true);
    if ("steps" in r) expect(r.steps).toEqual(["Boil water", "Add pasta"]);
  });

  it("rejects non-arrays", () => {
    const r = validateInstructionsSteps("not an array");
    expect("error" in r).toBe(true);
  });

  it("rejects non-string elements", () => {
    const r = validateInstructionsSteps(["ok", 7, "ok2"]);
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toMatch(/\[1\]/);
  });

  it("rejects empty / whitespace-only elements", () => {
    const r = validateInstructionsSteps(["ok", "   "]);
    expect("error" in r).toBe(true);
  });

  it("rejects null elements", () => {
    const r = validateInstructionsSteps([null]);
    expect("error" in r).toBe(true);
  });

  it("EDITABLE_JSONB allowlist includes instructionsSteps mapped to instructions_steps", () => {
    expect(EDITABLE_JSONB["instructionsSteps"]).toBe("instructions_steps");
  });
});

describe("validateRecipeForApproval (mirrors dashboard ApproveButton blockers)", () => {
  const good = {
    title: "Tomato Soup",
    image_url: "https://example.com/img.jpg",
    required_ingredient_ids: ["p_tomato", "p_salt"],
    instructions_steps: ["Simmer tomatoes", "Season"],
    instructions_summary: "Simmer ripe tomatoes with onion, garlic, salt, and pepper until thick.",
    quality_issues: [],
  };

  it("passes for a complete recipe", () => {
    expect(validateRecipeForApproval(good)).toEqual([]);
  });

  it("flags every missing field", () => {
    const errs = validateRecipeForApproval({
      title: "",
      image_url: null,
      required_ingredient_ids: [],
      instructions_steps: [],
      instructions_summary: "short",
      quality_issues: ["needs_research"],
    });
    expect(errs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Title/),
        expect.stringMatching(/Image/),
        expect.stringMatching(/required ingredient/),
        expect.stringMatching(/instruction step/),
        expect.stringMatching(/summary must be at least/),
        expect.stringMatching(/quality issues/),
      ])
    );
    expect(errs.length).toBe(6);
  });

  it("treats whitespace-only title as missing", () => {
    expect(validateRecipeForApproval({ ...good, title: "   " })).toEqual(
      expect.arrayContaining([expect.stringMatching(/Title/)])
    );
  });

  it("treats whitespace-only summary as below the 40-char floor", () => {
    expect(
      validateRecipeForApproval({ ...good, instructions_summary: "                                          " })
    ).toEqual(expect.arrayContaining([expect.stringMatching(/summary must be at least/)]));
  });

  it("APPROVE_FLOW_MARKER is the literal the reverse-sync handler greps for", () => {
    expect(APPROVE_FLOW_MARKER).toBe("[approve-flow]");
  });
});

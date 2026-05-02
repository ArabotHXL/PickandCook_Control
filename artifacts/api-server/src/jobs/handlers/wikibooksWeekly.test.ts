import { describe, it, expect } from "vitest";
import { extractCandidateIngredients, normalizeTitle } from "./wikibooksWeekly.js";

describe("extractCandidateIngredients", () => {
  it("returns [] when no Ingredients section is present", () => {
    expect(extractCandidateIngredients("== Steps ==\nDo a thing.")).toEqual([]);
  });

  it("parses bullet lines under an Ingredients section", () => {
    const text = `Ingredients
* 2 cups flour
* 1 tsp salt
* 3 tomatoes diced

Procedure
* mix everything`;
    const out = extractCandidateIngredients(text);
    expect(out.some((s) => s.toLowerCase().includes("flour"))).toBe(true);
    expect(out.some((s) => s.toLowerCase().includes("salt"))).toBe(true);
    expect(out.some((s) => s.toLowerCase().includes("tomatoes"))).toBe(true);
  });

  it("stops at Procedure / Method markers", () => {
    const text = `Ingredients
* sugar
Procedure
* not an ingredient`;
    const out = extractCandidateIngredients(text);
    expect(out.some((s) => s.includes("sugar"))).toBe(true);
    expect(out.some((s) => s.includes("not an ingredient"))).toBe(false);
  });

  it("caps result at 30 entries", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `* item ${i}`);
    const text = `Ingredients\n${lines.join("\n")}\nProcedure\n`;
    const out = extractCandidateIngredients(text);
    expect(out.length).toBeLessThanOrEqual(30);
  });
});

describe("normalizeTitle", () => {
  it("lowercases and collapses non-alphanum to single spaces", () => {
    expect(normalizeTitle("French Toast (Recipe)")).toBe("french toast recipe");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeTitle("  Hello, World!  ")).toBe("hello world");
  });
});

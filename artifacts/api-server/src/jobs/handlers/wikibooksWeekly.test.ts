import { describe, it, expect } from "vitest";
import {
  extractCandidateIngredients,
  extractIngredientsFromWikitext,
  normalizeTitle,
} from "./wikibooksWeekly.js";

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

describe("extractIngredientsFromWikitext", () => {
  it("returns [] when no Ingredients heading is present", () => {
    expect(extractIngredientsFromWikitext("== Procedure ==\n* mix")).toEqual([]);
  });

  it("strips {{convert}} and {{cb|x}} templates from bullet items", () => {
    const wikitext = `==Ingredients==
* {{convert|5|g|oz}} {{cb|agar}} powder
* {{convert|100|g|oz}} white granulated {{cb|sugar}}
* {{convert|500|g|oz}} {{cb|water}}

==Procedure==
* Combine.`;
    const out = extractIngredientsFromWikitext(wikitext);
    expect(out).toEqual([
      "agar powder",
      "white granulated sugar",
      "water",
    ]);
  });

  it("resolves piped wiki links to display text", () => {
    const wikitext = `==Ingredients==
* 1 [[Cookbook:Teaspoon|tsp]] [[salt]]
* [[Cookbook:Olive oil|olive oil]]`;
    const out = extractIngredientsFromWikitext(wikitext);
    expect(out[0]).toContain("salt");
    expect(out[1]).toBe("olive oil");
  });

  it("strips <ref> blocks, HTML, and bold/italic markers", () => {
    const wikitext = `==Ingredients==
* '''2 cups''' flour <ref>King Arthur</ref>
* ''fresh'' basil<br/>`;
    const out = extractIngredientsFromWikitext(wikitext);
    expect(out[0]).toBe("2 cups flour");
    expect(out[1]).toBe("fresh basil");
  });

  it("stops at the next heading", () => {
    const wikitext = `==Ingredients==
* sugar
==Procedure==
* not an ingredient`;
    const out = extractIngredientsFromWikitext(wikitext);
    expect(out).toEqual(["sugar"]);
  });

  it("caps result at 30 entries", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `* item ${i}`);
    const wikitext = `==Ingredients==\n${lines.join("\n")}\n==Procedure==`;
    const out = extractIngredientsFromWikitext(wikitext);
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

import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the DB layer so we can exercise mapIngredientNames in isolation.
// Each call returns the rows the test queued; we don't try to emulate
// the tier-ordering SQL, only the wire shape mapIngredientNames consumes.
const queryRowsMock = vi.fn();
vi.mock("../routes/ops/db.js", () => ({
  query: (..._args: unknown[]) => queryRowsMock(),
}));

import {
  normalizeIngredientName,
  extractIngredientCandidates,
  mapIngredientNames,
} from "./ingredientMapping.js";

describe("normalizeIngredientName", () => {
  it("strips quantity and unit", () => {
    expect(normalizeIngredientName("2 cups all-purpose flour")).toBe(
      "all-purpose flour"
    );
    expect(normalizeIngredientName("1 tbsp olive oil")).toBe("olive oil");
    expect(normalizeIngredientName("3 tomatoes")).toBe("tomato");
  });

  it("strips parentheticals", () => {
    expect(normalizeIngredientName("Salt (to taste)")).toBe("salt");
    expect(normalizeIngredientName("Sugar (optional)")).toBe("sugar");
  });

  it("takes the first alternative when 'or' is present", () => {
    expect(normalizeIngredientName("olive oil or vegetable oil")).toBe(
      "olive oil"
    );
  });

  it("drops trailing prep after a comma", () => {
    expect(normalizeIngredientName("tomatoes, diced")).toBe("tomato");
    expect(normalizeIngredientName("chicken breast, sliced")).toBe(
      "chicken breast"
    );
  });

  it("strips repeated leading descriptors", () => {
    expect(normalizeIngredientName("fresh chopped basil")).toBe("basil");
    expect(normalizeIngredientName("boneless skinless chicken")).toBe("chicken");
    expect(normalizeIngredientName("organic whole milk")).toBe("milk");
  });

  it("singularizes the last word for plain plurals and -es plurals", () => {
    expect(normalizeIngredientName("eggs")).toBe("egg");
    expect(normalizeIngredientName("potatoes")).toBe("potato");
    expect(normalizeIngredientName("olive oils")).toBe("olive oil");
  });

  it("does not strip the trailing 's' on short words like 'gas' or names ending in 'ss'", () => {
    expect(normalizeIngredientName("grass")).toBe("grass");
    expect(normalizeIngredientName("gas")).toBe("gas");
  });

  it("strips trailing 'to taste' / 'optional' / 'for serving'", () => {
    expect(normalizeIngredientName("pepper to taste")).toBe("pepper");
    expect(normalizeIngredientName("rice for serving")).toBe("rice");
  });

  it("returns empty string on empty / numeric input", () => {
    expect(normalizeIngredientName("")).toBe("");
    expect(normalizeIngredientName("   ")).toBe("");
    expect(normalizeIngredientName("1 cup")).toBe("");
  });

  it("handles vulgar fraction prefixes", () => {
    expect(normalizeIngredientName("½ cup sugar")).toBe("sugar");
    expect(normalizeIngredientName("1¼ tsp salt")).toBe("salt");
  });
});

describe("extractIngredientCandidates", () => {
  function phrases(text: string, steps: string[] = []): string[] {
    return extractIngredientCandidates(text, steps).map((c) => c.phrase);
  }
  function optional(text: string, steps: string[] = []): string[] {
    return extractIngredientCandidates(text, steps)
      .filter((c) => c.optional)
      .map((c) => c.phrase);
  }

  it("pulls quantity-led ingredient mentions from a comma list", () => {
    const out = phrases(
      "Combine 1 head of cauliflower, 1/2 cup flour, 1/2 cup cornstarch, 3/4 cup water, 1/2 teaspoon salt, and 1/4 teaspoon black pepper."
    );
    expect(out).toEqual(
      expect.arrayContaining([
        "cauliflower",
        "flour",
        "cornstarch",
        "water",
        "salt",
        "black pepper",
      ])
    );
  });

  it("dedupes the same ingredient mentioned in summary and a step", () => {
    const out = phrases("Add 1 tbsp olive oil.", [
      "Drizzle 2 tbsp olive oil over the top.",
    ]);
    expect(out.filter((p) => p === "olive oil")).toHaveLength(1);
  });

  it("tags ingredients in a 'for garnish' sentence as optional", () => {
    const cands = extractIngredientCandidates(
      "Top with 2 tbsp chopped parsley for garnish.",
      []
    );
    const parsley = cands.find((c) => c.phrase === "parsley");
    expect(parsley).toBeDefined();
    expect(parsley?.optional).toBe(true);
  });

  it("catches no-quantity 'to taste' mentions as optional", () => {
    const opts = optional("Season with salt and pepper to taste.");
    expect(opts).toEqual(expect.arrayContaining(["salt", "pepper"]));
  });

  it("catches sentence-start 'to taste' phrases", () => {
    const opts = optional("Salt and pepper to taste.");
    expect(opts).toEqual(expect.arrayContaining(["salt", "pepper"]));
  });

  it("required wins when the same ingredient appears in both contexts", () => {
    const cands = extractIngredientCandidates(
      "Use 1/2 cup parmesan in the sauce. Sprinkle parmesan on top for garnish.",
      []
    );
    const parm = cands.find((c) => c.phrase === "parmesan");
    expect(parm?.optional).toBe(false);
  });

  it("skips temperatures, times, yields, and dimensions", () => {
    const out = phrases(
      "Bake at 350 degrees for 30 minutes. Serves 4 people. Cut into 2 inch cubes."
    );
    // None of "degrees", "minutes", "people", "cubes" should land
    expect(out).not.toContain("degree");
    expect(out).not.toContain("degrees");
    expect(out).not.toContain("minute");
    expect(out).not.toContain("minutes");
    expect(out).not.toContain("people");
  });

  it("returns an empty array for empty input", () => {
    expect(extractIngredientCandidates("", [])).toEqual([]);
    expect(extractIngredientCandidates("Stir until smooth.", [])).toEqual([]);
  });

  it("processes step-array entries the same as the summary", () => {
    const out = phrases("", [
      "Heat 2 tbsp vegetable oil in a wok.",
      "Add 3 cloves garlic and 1 tsp ginger.",
    ]);
    expect(out).toEqual(
      expect.arrayContaining(["vegetable oil", "garlic", "ginger"])
    );
  });
});

describe("mapIngredientNames return shape (task #38 contract)", () => {
  beforeEach(() => {
    queryRowsMock.mockReset();
  });

  it("returns { id, name } objects in `mapped` so the Auto-extract modal can render names", async () => {
    // Two inputs → two SQL round-trips. First resolves, second doesn't.
    queryRowsMock
      .mockResolvedValueOnce([
        { id: "fdc_34845", name: "Cauliflower", tier: 1, name_len: 11 },
      ])
      .mockResolvedValueOnce([]);

    const result = await mapIngredientNames(["cauliflower", "moonrock"]);

    expect(result.mapped).toEqual([{ id: "fdc_34845", name: "Cauliflower" }]);
    expect(result.unmapped).toEqual(["moonrock"]);
    // Static type guard: callers like the staging importers do `.id`, so
    // the entry must be an object with a string `id`, not a bare string.
    expect(typeof result.mapped[0]!.id).toBe("string");
    expect(typeof result.mapped[0]!.name).toBe("string");
  });

  it("skips empty / whitespace-only input names without round-tripping", async () => {
    const result = await mapIngredientNames(["", "   "]);
    expect(result.mapped).toEqual([]);
    expect(result.unmapped).toEqual([]);
    expect(queryRowsMock).not.toHaveBeenCalled();
  });
});

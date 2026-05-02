import { describe, it, expect } from "vitest";
import { normalizeIngredientName } from "./ingredientMapping.js";

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

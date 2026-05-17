import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// db.ts opens a real pg pool on import; stub it before importing the route.
const queryOneMock = vi.fn();
vi.mock("./db.js", () => ({
  query: vi.fn(),
  queryOne: (...args: unknown[]) => queryOneMock(...args),
  withTransaction: vi.fn(),
}));

// mapIngredientNames hits the products table; stub it deterministically.
const mapIngredientNamesMock = vi.fn();
vi.mock("../../services/ingredientMapping.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/ingredientMapping.js")
  >("../../services/ingredientMapping.js");
  return {
    ...actual,
    mapIngredientNames: (names: string[]) => mapIngredientNamesMock(names),
  };
});

const {
  validateInstructionsSteps,
  validateRecipeForApproval,
  EDITABLE_JSONB,
  APPROVE_FLOW_MARKER,
  extractRecipeIngredients,
} = await import("./recipeDetail.js");

function makeRes(): Response & { _status: number; _body: unknown } {
  const r: Partial<Response> & { _status: number; _body: unknown } = {
    _status: 200,
    _body: undefined,
  };
  r.status = (code: number) => {
    r._status = code;
    return r as Response;
  };
  r.json = (body: unknown) => {
    r._body = body;
    return r as Response;
  };
  return r as Response & { _status: number; _body: unknown };
}

function makeReq(body: unknown, params: Record<string, string> = { recipeId: "rec_1" }): Request {
  return { body, params } as unknown as Request;
}

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

describe("extractRecipeIngredients (POST /api/ops/recipes/:id/extract-ingredients)", () => {
  beforeEach(() => {
    queryOneMock.mockReset();
    mapIngredientNamesMock.mockReset();
  });

  it("returns 404 when the recipe id does not exist", async () => {
    queryOneMock.mockResolvedValueOnce(null);
    const res = makeRes();
    await extractRecipeIngredients(makeReq({}), res);
    expect(res._status).toBe(404);
  });

  it("subtracts IDs the recipe already has in required or optional (additive only)", async () => {
    queryOneMock.mockResolvedValueOnce({
      instructions_summary: "Mix 1 cup flour with 1 tsp salt.",
      instructions_steps: [],
      required_ingredient_ids: ["p_flour"], // already present → must drop
      optional_ingredient_ids: ["p_salt"], // already present → must drop
    });
    mapIngredientNamesMock.mockImplementation(async (names: string[]) => ({
      mapped: names.map((n) => (n === "flour" ? "p_flour" : n === "salt" ? "p_salt" : `p_${n}`)),
      unmapped: [],
    }));
    const res = makeRes();
    await extractRecipeIngredients(makeReq({}), res);
    expect(res._status).toBe(200);
    const body = res._body as { newRequired: string[]; newOptional: string[]; unmapped: string[] };
    expect(body.newRequired).not.toContain("p_flour");
    expect(body.newOptional).not.toContain("p_salt");
  });

  it("optional results are dropped if they would duplicate Required (measured wins)", async () => {
    queryOneMock.mockResolvedValueOnce({
      instructions_summary:
        "Use 1/2 cup parmesan in the sauce. Sprinkle parmesan to top for garnish.",
      instructions_steps: [],
      required_ingredient_ids: [],
      optional_ingredient_ids: [],
    });
    // Both required and optional phrases resolve to the same product id.
    mapIngredientNamesMock.mockImplementation(async () => ({
      mapped: ["p_parmesan"],
      unmapped: [],
    }));
    const res = makeRes();
    await extractRecipeIngredients(makeReq({}), res);
    const body = res._body as { newRequired: string[]; newOptional: string[] };
    expect(body.newRequired).toContain("p_parmesan");
    expect(body.newOptional).not.toContain("p_parmesan");
  });

  it("uses caller-supplied draft body over the persisted row", async () => {
    queryOneMock.mockResolvedValueOnce({
      instructions_summary: "old summary",
      instructions_steps: ["old step"],
      required_ingredient_ids: [],
      optional_ingredient_ids: [],
    });
    const seen: string[][] = [];
    mapIngredientNamesMock.mockImplementation(async (names: string[]) => {
      seen.push(names);
      return { mapped: [], unmapped: names };
    });
    await extractRecipeIngredients(
      makeReq({
        instructionsSummary: "Add 2 cups draft-flour.",
        instructionsSteps: ["Stir 1 tsp draft-salt."],
      }),
      makeRes()
    );
    const allCandidates = seen.flat();
    expect(allCandidates.some((n) => n.includes("draft-flour"))).toBe(true);
    expect(allCandidates.some((n) => n.includes("draft-salt"))).toBe(true);
    expect(allCandidates.some((n) => n.includes("old"))).toBe(false);
  });

  it("returns 400 when instructionsSummary exceeds the size cap", async () => {
    const res = makeRes();
    await extractRecipeIngredients(
      makeReq({ instructionsSummary: "x".repeat(20_001) }),
      res
    );
    expect(res._status).toBe(400);
    // DB should not be touched when we reject upfront.
    expect(queryOneMock).not.toHaveBeenCalled();
  });

  it("returns 400 when instructionsSteps array is over the cap", async () => {
    const res = makeRes();
    await extractRecipeIngredients(
      makeReq({ instructionsSteps: new Array(201).fill("step") }),
      res
    );
    expect(res._status).toBe(400);
    expect(queryOneMock).not.toHaveBeenCalled();
  });

  it("returns 400 when any single step exceeds the per-step cap", async () => {
    const res = makeRes();
    await extractRecipeIngredients(
      makeReq({ instructionsSteps: ["ok", "y".repeat(5_001)] }),
      res
    );
    expect(res._status).toBe(400);
    expect(queryOneMock).not.toHaveBeenCalled();
  });

  it("returns an empty payload when there is nothing new to add", async () => {
    queryOneMock.mockResolvedValueOnce({
      instructions_summary: "Stir until smooth.",
      instructions_steps: [],
      required_ingredient_ids: [],
      optional_ingredient_ids: [],
    });
    mapIngredientNamesMock.mockResolvedValue({ mapped: [], unmapped: [] });
    const res = makeRes();
    await extractRecipeIngredients(makeReq({}), res);
    const body = res._body as { newRequired: string[]; newOptional: string[]; unmapped: string[] };
    expect(body.newRequired).toEqual([]);
    expect(body.newOptional).toEqual([]);
    expect(body.unmapped).toEqual([]);
  });
});

describe("extract-ingredients route wiring", () => {
  it("is mounted under requireAdmin (read-tier), not requireAdminWrite", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/routes/ops/index.ts", "utf8")
    );
    // Find the registration line for the extract-ingredients route and
    // assert it uses requireAdmin, not requireAdminWrite. A read-tier dry
    // run must be reachable by read_only_admin.
    const line = src
      .split("\n")
      .find((l) => l.includes("/recipes/:recipeId/extract-ingredients"));
    expect(line).toBeDefined();
    expect(line!).toMatch(/\brequireAdmin\b/);
    expect(line!).not.toMatch(/\brequireAdminWrite\b/);
  });
});

import { describe, it, expect, vi } from "vitest";
import {
  AUDIT_TO_ENDPOINT,
  ENDPOINT_ORDER,
  classifyAction,
  mapRecipeRow,
  mapRecipeBatchItem,
  mapProductRow,
  mapDecisionRow,
  postBatch,
  shouldDeadLetter,
  type RecipeRow,
  type ProductRow,
  type DecisionRow,
  type RecipeBatchItem,
} from "./opsReverseSync.js";
import { APPROVE_FLOW_MARKER } from "../../routes/ops/recipeDetail.js";

describe("classifyAction / AUDIT_TO_ENDPOINT", () => {
  it("routes recipe edits to recipes endpoint", () => {
    expect(classifyAction("update_recipe")).toBe("recipes");
    expect(classifyAction("restore_recipe_revision")).toBe("recipes");
    expect(classifyAction("set_recipe_quality")).toBe("recipes");
    expect(classifyAction("staging_recipe_promote")).toBe("recipes");
    // manual_recipe_created is staging-only (target_type=imported_recipe_staging);
    // the catalog row gets pushed via staging_recipe_promote when promoted.
    expect(classifyAction("manual_recipe_created")).toBe("unknown");
  });
  it("routes moderation_approved to moderation-decisions", () => {
    expect(classifyAction("moderation_approved")).toBe("moderation-decisions");
    expect(classifyAction("moderation_bulk_approved")).toBe("moderation-decisions");
  });
  it("returns unknown for unrouted action types", () => {
    expect(classifyAction("brand_new_action")).toBe("unknown");
    expect(classifyAction("staging_recipe_edit")).toBe("unknown"); // staging-only edits don't push
  });
  it("ENDPOINT_ORDER puts moderation first (least invasive)", () => {
    expect(ENDPOINT_ORDER[0]).toBe("moderation-decisions");
    expect(ENDPOINT_ORDER).toContain("recipes");
    expect(ENDPOINT_ORDER).toContain("products");
  });
});

describe("mapRecipeRow", () => {
  const baseRow: RecipeRow = {
    id: "r-1",
    title: "Tomato Soup",
    cuisine_tags: ["italian"],
    moods: ["cozy"],
    constraints: ["vegan"],
    estimated_time_min: 20,
    default_servings: 4,
    difficulty: "Easy",
    nutrition_summary: { kcal: 200 },
    instructions_summary: "Simmer tomatoes",
    quality_tier: "good",
    image_url: "https://example.com/img.jpg",
    updated_at: "2026-05-11T00:00:00.000Z",
  };

  it("emits camelCase only with the expected mapping", () => {
    const p = mapRecipeRow(baseRow);
    expect(p).toEqual({
      id: "r-1",
      title: "Tomato Soup",
      cuisineTags: ["italian"],
      moodTags: ["cozy"],
      dietaryTags: ["vegan"],
      estimatedTimeMin: 20,
      servings: 4,
      difficulty: "Easy",
      nutritionSummary: { kcal: 200 },
      instructionsSummary: "Simmer tomatoes",
      qualityTier: "good",
      imageUrl: "https://example.com/img.jpg",
      controlUpdatedAt: "2026-05-11T00:00:00.000Z",
    });
  });

  it("omits empty arrays and nullish scalars (so prod doesn't clear them)", () => {
    const p = mapRecipeRow({
      ...baseRow,
      cuisine_tags: [],
      moods: null,
      constraints: [],
      nutrition_summary: null,
      image_url: null,
      instructions_summary: null,
    });
    expect(p.cuisineTags).toBeUndefined();
    expect(p.moodTags).toBeUndefined();
    expect(p.dietaryTags).toBeUndefined();
    expect(p.nutritionSummary).toBeUndefined();
    expect(p.imageUrl).toBeUndefined();
    expect(p.instructionsSummary).toBeUndefined();
    // required fields still present
    expect(p.id).toBe("r-1");
    expect(p.title).toBe("Tomato Soup");
  });

  it("drops the default 'unrated' qualityTier (avoid forcing unrated on prod)", () => {
    const p = mapRecipeRow({ ...baseRow, quality_tier: "unrated" });
    expect(p.qualityTier).toBeUndefined();
  });
});

describe("mapProductRow", () => {
  const baseRow: ProductRow = {
    id: "p-1",
    name: "Apple",
    synonyms: ["apples"],
    department: "produce",
    default_unit: "each",
    culture_tags: ["western"],
    kcal: 52,
    protein: 0.3,
    carbs: 14,
    fat: 0.2,
    sodium: 1,
    fiber: 2.4,
    sugar: 10,
    brand: null,
    allergens: [],
    ingredients_text: null,
    serving_size: "1 medium (182g)",
    branded_food_category: null,
    updated_at: "2026-05-11T00:00:00.000Z",
  };

  it("includes controlUpdatedAt from updated_at by default", () => {
    const p = mapProductRow(baseRow);
    expect(p.controlUpdatedAt).toBe("2026-05-11T00:00:00.000Z");
    expect(p.id).toBe("p-1");
    expect(p.synonyms).toEqual(["apples"]);
    expect(p.allergens).toBeUndefined(); // empty array elided
    expect(p.brand).toBeUndefined();
  });

  it("omits controlUpdatedAt when omitControlUpdatedAt is true (CLI scenario 4)", () => {
    const p = mapProductRow(baseRow, { omitControlUpdatedAt: true });
    expect(p.controlUpdatedAt).toBeUndefined();
    expect(p.id).toBe("p-1"); // everything else still present
  });
});

describe("mapDecisionRow", () => {
  const base: DecisionRow = {
    audit_id: "00000000-0000-0000-0000-000000000001",
    audit_created_at: "2026-05-11T00:00:00.000Z",
    action_type: "moderation_approved",
    decision_note: "spam",
    admin_user_id: "admin-1",
    content_type: "recipe",
    content_id: "r-bad",
  };

  it("maps moderation_approved to action='remove'", () => {
    expect(mapDecisionRow(base)).toEqual({
      contentType: "recipe",
      contentId: "r-bad",
      action: "remove",
      reason: "spam",
      moderatorId: "admin-1",
    });
  });

  it("returns null for content_type prod can't model", () => {
    expect(mapDecisionRow({ ...base, content_type: "review" })).toBeNull();
    expect(mapDecisionRow({ ...base, content_type: "" })).toBeNull();
  });

  it("omits optional fields when blank", () => {
    const d = mapDecisionRow({ ...base, decision_note: null, admin_user_id: "" });
    expect(d?.reason).toBeUndefined();
    expect(d?.moderatorId).toBeUndefined();
  });
});

// ── postBatch retry / fatal handling ───────────────────────────────────────

const makeFetch = (impls: Array<{ status: number; body: string } | Error>) => {
  let i = 0;
  return vi.fn(async (_url: string, _init: RequestInit) => {
    const next = impls[i++];
    if (!next) throw new Error("no more mocked responses");
    if (next instanceof Error) throw next;
    return new Response(next.body, { status: next.status });
  });
};

describe("postBatch", () => {
  const ok = { status: 200, body: JSON.stringify({ ok: true, dryRun: false, summary: { inserted: 1, updated: 0, skipped: 0, errors: 0 }, results: [{ id: "r-1", action: "inserted" }] }) };

  it("returns parsed body on 2xx (first attempt)", async () => {
    const fetchImpl = makeFetch([ok]) as unknown as typeof fetch;
    const r = await postBatch({ url: "http://x", token: "t", body: {}, fetchImpl, retryDelaysMs: [1, 1, 1] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body.summary.inserted).toBe(1);
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });

  it("retries on 5xx then succeeds", async () => {
    const fetchImpl = makeFetch([
      { status: 502, body: "Bad gateway" },
      ok,
    ]) as unknown as typeof fetch;
    const r = await postBatch({ url: "http://x", token: "t", body: {}, fetchImpl, retryDelaysMs: [1, 1, 1] });
    expect(r.ok).toBe(true);
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2);
  });

  it("retries on network errors then exhausts (1 initial + 3 retries = 4 attempts)", async () => {
    const fetchImpl = makeFetch([
      new Error("ECONNRESET"),
      new Error("ECONNRESET"),
      new Error("ECONNRESET"),
      new Error("ECONNRESET"),
    ]) as unknown as typeof fetch;
    const r = await postBatch({ url: "http://x", token: "t", body: {}, fetchImpl, retryDelaysMs: [1, 1, 1] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fatal).toBe(false);
      expect(r.message).toContain("retries_exhausted");
    }
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(4);
  });

  it("uses the full 500/1500/4500 backoff sequence (all delays applied between retries)", async () => {
    const sleeps: number[] = [];
    const realSetTimeout = global.setTimeout;
    // Capture sleep durations from the postBatch sleep() helper without actually waiting.
    (global as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((fn: () => void, ms: number) => {
      // Only capture the sleep() helper's setTimeouts (positive ms with a fn); ignore AbortController timers.
      if (typeof ms === "number" && ms > 0 && ms < 10_000) sleeps.push(ms);
      return realSetTimeout(fn, 0);
    }) as unknown as typeof setTimeout;
    try {
      const fetchImpl = makeFetch([
        new Error("ECONNRESET"),
        new Error("ECONNRESET"),
        new Error("ECONNRESET"),
        new Error("ECONNRESET"),
      ]) as unknown as typeof fetch;
      await postBatch({ url: "http://x", token: "t", body: {}, fetchImpl });
      // The 30s HTTP_TIMEOUT_MS AbortController timer is filtered above (>= 10_000).
      // Sleeps applied between attempts must be exactly the configured delays in order.
      expect(sleeps).toEqual([500, 1500, 4500]);
    } finally {
      (global as unknown as { setTimeout: typeof setTimeout }).setTimeout = realSetTimeout;
    }
  });

  it("treats 401 as fatal (no retry)", async () => {
    const fetchImpl = makeFetch([{ status: 401, body: "missing_bearer_token" }]) as unknown as typeof fetch;
    const r = await postBatch({ url: "http://x", token: "t", body: {}, fetchImpl, retryDelaysMs: [1, 1, 1] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fatal).toBe(true);
      expect(r.status).toBe(401);
    }
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });

  it("treats 403 as fatal (no retry)", async () => {
    const fetchImpl = makeFetch([{ status: 403, body: "invalid_token" }]) as unknown as typeof fetch;
    const r = await postBatch({ url: "http://x", token: "t", body: {}, fetchImpl, retryDelaysMs: [1, 1, 1] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fatal).toBe(true);
  });

  it("treats 503 as fatal (prod token unset)", async () => {
    const fetchImpl = makeFetch([{ status: 503, body: "ops-sync token not configured" }]) as unknown as typeof fetch;
    const r = await postBatch({ url: "http://x", token: "t", body: {}, fetchImpl, retryDelaysMs: [1, 1, 1] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fatal).toBe(true);
  });

  it("non-fatal 4xx (e.g. 400 batch_too_large) skips without retry", async () => {
    const fetchImpl = makeFetch([{ status: 400, body: "batch_too_large" }]) as unknown as typeof fetch;
    const r = await postBatch({ url: "http://x", token: "t", body: {}, fetchImpl, retryDelaysMs: [1, 1, 1] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fatal).toBe(false);
      expect(r.status).toBe(400);
    }
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });

  it("sends Authorization Bearer header and JSON body", async () => {
    const fetchImpl = makeFetch([ok]) as unknown as typeof fetch;
    await postBatch({ url: "http://x", token: "the-token", body: { items: [1] }, fetchImpl, retryDelaysMs: [1, 1, 1] });
    const call = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    const init = call[1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer the-token");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ items: [1] }));
  });
});

describe("mapRecipeBatchItem (approve-flow → forceOverrideOrigin plumbing)", () => {
  const row: RecipeRow = {
    id: "rec_436",
    title: "Approved by ops",
    cuisine_tags: [],
    moods: [],
    constraints: [],
    estimated_time_min: 15,
    default_servings: 2,
    difficulty: "Easy",
    nutrition_summary: null,
    instructions_summary: "Mix and serve.",
    quality_tier: "acceptable",
    image_url: "https://example.com/x.jpg",
    updated_at: "2026-05-15T00:00:00.000Z",
  };

  it("sets forceOverrideOrigin when decisionNote contains the marker", () => {
    const item: RecipeBatchItem = {
      row,
      auditId: "a-1",
      decisionNote: `${APPROVE_FLOW_MARKER} approved by operator`,
    };
    const p = mapRecipeBatchItem(item);
    expect(p.forceOverrideOrigin).toBe(true);
    expect(p.id).toBe("rec_436");
    expect(p.qualityTier).toBe("acceptable");
  });

  it("recognizes the marker when embedded inside a longer note", () => {
    const item: RecipeBatchItem = {
      row,
      auditId: "a-2",
      decisionNote: `pre-edit: ${APPROVE_FLOW_MARKER} reviewer confirmed image`,
    };
    expect(mapRecipeBatchItem(item).forceOverrideOrigin).toBe(true);
  });

  it("does NOT set forceOverrideOrigin for ordinary edits (so we don't blanket-override prod)", () => {
    const item: RecipeBatchItem = {
      row,
      auditId: "a-3",
      decisionNote: "fixed typo in title",
    };
    expect(mapRecipeBatchItem(item).forceOverrideOrigin).toBeUndefined();
  });

  it("does NOT set forceOverrideOrigin when decisionNote is null", () => {
    expect(
      mapRecipeBatchItem({ row, auditId: "a-4", decisionNote: null }).forceOverrideOrigin
    ).toBeUndefined();
  });
});

describe("dead-letter / cursor classification contract", () => {
  // These tests assert the *invariants* the cursor-advancement code relies
  // on. They don't run real SQL — they prove (1) the dead-letter UPSERT is
  // present in source so retries can't double-insert, and (2) the in-code
  // skip-reason classifier behaves correctly for the three task-spec cases.
  it("dead-letter INSERT uses ON CONFLICT (audit_id, endpoint) DO UPDATE for idempotency", async () => {
    const src = await import("node:fs").then((m) =>
      m.promises.readFile(new URL("./opsReverseSync.ts", import.meta.url), "utf8")
    );
    expect(src).toMatch(/INSERT INTO ops_sync_dead_letter[\s\S]{0,500}ON CONFLICT \(audit_id, endpoint\) DO UPDATE/);
    // The unique index that makes the upsert deterministic.
    const mig = await import("node:fs").then((m) =>
      m.promises.readFile(new URL("../migrations.ts", import.meta.url), "utf8")
    );
    expect(mig).toMatch(/UNIQUE INDEX[\s\S]{0,200}ops_sync_dead_letter \(audit_id, endpoint\)/);
  });

  it("shouldDeadLetter: only `no_change` is a clean consume; every other skip reason dead-letters", () => {
    // Behavior-level: this is the exact predicate pushEndpoint uses to
    // decide whether to write into ops_sync_dead_letter. The cursor is
    // allowed to advance past dead-lettered rows precisely because they
    // are durably captured here.
    expect(shouldDeadLetter({ id: "r-1", action: "inserted" })).toBe(false);
    expect(shouldDeadLetter({ id: "r-1", action: "updated" })).toBe(false);
    expect(shouldDeadLetter({ id: "r-1", action: "skipped", reason: "no_change" })).toBe(false);
    expect(shouldDeadLetter({ id: "r-1", action: "skipped", reason: "origin_locked" })).toBe(true);
    expect(shouldDeadLetter({ id: "r-1", action: "skipped", reason: "validation_failed" })).toBe(true);
    // Defensive: skipped with no reason still dead-letters (we'd rather
    // over-capture than silently drop).
    expect(shouldDeadLetter({ id: "r-1", action: "skipped" })).toBe(true);
    // Hard error rows aren't dead-lettered — they already bump
    // summary.errors which pins the cursor for the next replay.
    expect(shouldDeadLetter({ id: "r-1", action: "error", reason: "boom" })).toBe(false);
  });

  it("dead-letter INSERT failure path increments summary.errors so the cursor cannot advance", async () => {
    const src = await import("node:fs").then((m) =>
      m.promises.readFile(new URL("./opsReverseSync.ts", import.meta.url), "utf8")
    );
    // The catch block around the dead-letter INSERT must bump errors.
    expect(src).toMatch(/dead-letter insert failed[\s\S]{0,200}summary\.errors \+= 1/);
    // And cursor advance must be gated on summary.errors === 0.
    expect(src).toMatch(/summary\.errors === 0/);
  });

  it("auto-resolves prior dead-letter rows when an approve-flow push is accepted for the same (endpoint, target_id)", async () => {
    // Behavior contract: when pushEndpoint sees an inserted/updated row
    // whose source audit carried the APPROVE_FLOW_MARKER, it must mark
    // any open ops_sync_dead_letter rows for the same (endpoint,
    // target_id) as resolved. This is what closes the loop on the
    // rec_436 UX trap — the old origin_locked DL row no longer hangs
    // around red after the operator re-approved and the push succeeded.
    const src = await import("node:fs").then((m) =>
      m.promises.readFile(new URL("./opsReverseSync.ts", import.meta.url), "utf8")
    );
    // Scoped to approve-flow accepts (not blanket-resolve on any push).
    expect(src).toMatch(/decisionNote\?\.includes\(APPROVE_FLOW_MARKER\)/);
    // Resolves by (endpoint, target_id) on UNRESOLVED rows only.
    expect(src).toMatch(
      /UPDATE ops_sync_dead_letter[\s\S]{0,300}SET resolved_at = NOW\(\)[\s\S]{0,300}endpoint = \$1[\s\S]{0,200}target_id = \$2[\s\S]{0,200}resolved_at IS NULL/
    );
    // Failure to clean up is non-fatal (warn, not error) — operator can
    // still mark resolved manually, and the run should not be poisoned.
    expect(src).toMatch(/failed to auto-resolve superseded dead-letter rows/);
  });

  it("retryDeadLetterById uses the same mapper as the cron (mapRecipeBatchItem) so forceOverrideOrigin survives", async () => {
    const src = await import("node:fs").then((m) =>
      m.promises.readFile(new URL("./opsReverseSync.ts", import.meta.url), "utf8")
    );
    // Within retryDeadLetterById, the recipes branch must call mapRecipeBatchItem.
    const fnStart = src.indexOf("export async function retryDeadLetterById");
    expect(fnStart).toBeGreaterThan(0);
    const fnBody = src.slice(fnStart, fnStart + 4000);
    expect(fnBody).toMatch(/mapRecipeBatchItem\(\s*\{\s*row,\s*auditId/);
    expect(fnBody).toMatch(/mapProductRow\(/);
    expect(fnBody).toMatch(/mapDecisionRow\(/);
  });
});

describe("AUDIT_TO_ENDPOINT routing table is complete for known surfaces", () => {
  it("includes every action_type the dashboard currently emits to a sync target", () => {
    // Smoke check: the routing table must cover the action types we expect
    // to push. New audit action_types appearing in production are surfaced
    // via summary.unknownActionTypes; this test guards the existing set.
    const expected = [
      "update_recipe",
      "restore_recipe_revision",
      "staging_recipe_promote",
      "moderation_approved",
      "moderation_bulk_approved",
      "update_product",
    ];
    for (const a of expected) {
      expect(AUDIT_TO_ENDPOINT[a]).toBeDefined();
    }
  });
});

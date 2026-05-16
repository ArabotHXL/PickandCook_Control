import { useEffect, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { uploadImageFile, resolveImageSrc } from "@/lib/upload";
import { PageHeader } from "@/components/ui/page-header";
import { ArrowLeft, Upload, RotateCcw, Save, CheckCircle2, ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { isProdOriginRecipe } from "@/lib/recipeOrigin";

interface RecipeDto {
  id: string;
  title: string;
  cuisineTags: string[];
  moods: string[];
  constraints: string[];
  budget: string;
  estimatedTimeMin: number;
  difficulty: string;
  instructionsSummary: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  servingTemperature: string | null;
  sweetSavoryProfile: string | null;
  defaultServings: number | null;
  qualityTier: string;
  qualityIssues: string[];
  dishType: string[];
  convenienceTags: string[];
  requiredIngredientIds: string[];
  optionalIngredientIds: string[];
  instructionsSteps: string[];
}

interface Revision {
  id: string;
  snapshot: RecipeDto;
  editedByEmail: string | null;
  note: string | null;
  createdAt: string;
}

function listToText(arr: string[]): string {
  return (arr ?? []).join(", ");
}

function textToList(s: string): string[] {
  return s
    .split(/[,\n]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function RecipeDetailPage() {
  const [, params] = useRoute("/recipes/:id");
  const recipeId = params?.id ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Partial<RecipeDto>>({});
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["ops", "recipe-detail", recipeId],
    queryFn: () =>
      apiFetch(`/api/ops/recipes/${recipeId}`).then((r) => r.json()) as Promise<{
        recipe: RecipeDto;
        revisionCount: number;
      }>,
    enabled: !!recipeId,
  });

  const revisionsQuery = useQuery({
    queryKey: ["ops", "recipe-revisions", recipeId],
    queryFn: () =>
      apiFetch(`/api/ops/recipes/${recipeId}/revisions`).then((r) => r.json()) as Promise<{
        revisions: Revision[];
      }>,
    enabled: !!recipeId,
  });

  useEffect(() => {
    if (detailQuery.data?.recipe) {
      setDraft({});
    }
  }, [detailQuery.data?.recipe?.id]);

  const recipe = detailQuery.data?.recipe;
  const merged: Partial<RecipeDto> = { ...(recipe ?? {}), ...draft };

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/ops/recipes/${recipeId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Save failed");
        return r.json();
      }),
    onSuccess: () => {
      toast({ title: "Saved", description: "Recipe updated and revision recorded." });
      setDraft({});
      setNote("");
      qc.invalidateQueries({ queryKey: ["ops", "recipe-detail", recipeId] });
      qc.invalidateQueries({ queryKey: ["ops", "recipe-revisions", recipeId] });
      qc.invalidateQueries({ queryKey: ["ops", "recipes"] });
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/ops/recipes/${recipeId}/approve`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Approve failed");
      const data = await r.json();
      // Fire-and-forget: kick the reverse-sync job so the [approve-flow]
      // audit we just wrote gets pushed to prod immediately instead of
      // waiting up to 15 min for the next cron tick. If this 202 fails
      // (job already running, network blip, etc.) the cron will still
      // pick it up — so we swallow the error and surface a softer note.
      let triggered = false;
      try {
        const t = await apiFetch(
          `/api/ops/system/jobs/opsReverseSync:periodic/trigger`,
          { method: "POST" }
        );
        triggered = t.ok;
      } catch {
        triggered = false;
      }
      return { ...data, triggered };
    },
    onSuccess: (data: { triggered?: boolean }) => {
      toast({
        title: "Approved",
        description: data.triggered
          ? "Marked acceptable. Reverse-sync triggered — prod should update within ~30s."
          : "Marked acceptable. Will be pushed to prod on the next reverse-sync run (≤15 min).",
      });
      qc.invalidateQueries({ queryKey: ["ops", "recipe-detail", recipeId] });
      qc.invalidateQueries({ queryKey: ["ops", "recipe-revisions", recipeId] });
      qc.invalidateQueries({ queryKey: ["ops", "recipes"] });
      qc.invalidateQueries({ queryKey: ["ops", "reverse-sync", "dead-letter"] });
      qc.invalidateQueries({ queryKey: ["ops", "system", "jobs"] });
    },
    onError: (err: Error) =>
      toast({ title: "Approve failed", description: err.message, variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: (revisionId: string) =>
      apiFetch(`/api/ops/recipes/${recipeId}/revisions/${revisionId}/restore`, {
        method: "POST",
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Restore failed");
        return r.json();
      }),
    onSuccess: () => {
      toast({ title: "Restored", description: "Recipe reverted to selected revision." });
      qc.invalidateQueries({ queryKey: ["ops", "recipe-detail", recipeId] });
      qc.invalidateQueries({ queryKey: ["ops", "recipe-revisions", recipeId] });
    },
    onError: (err: Error) =>
      toast({ title: "Restore failed", description: err.message, variant: "destructive" }),
  });

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const { objectPath } = await uploadImageFile(file);
      setDraft((d) => ({ ...d, imageUrl: objectPath }));
      toast({ title: "Uploaded", description: "Image ready. Click Save to persist." });
    } catch (e) {
      toast({
        title: "Upload failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  function set<K extends keyof RecipeDto>(key: K, value: RecipeDto[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function handleSave() {
    if (Object.keys(draft).length === 0) {
      toast({ title: "Nothing to save", description: "No fields changed." });
      return;
    }
    const body: Record<string, unknown> = { ...draft };
    if (note) body.note = note;
    saveMutation.mutate(body);
  }

  if (!recipeId) return null;
  if (detailQuery.isLoading) {
    return (
      <div>
        <PageHeader title="Recipe" description="Loading…" />
        <div className="p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  if (!recipe) {
    return (
      <div>
        <PageHeader title="Recipe not found" />
        <div className="p-6">
          <Link href="/recipes" className="text-primary text-sm">
            ← Back to Recipes
          </Link>
        </div>
      </div>
    );
  }

  const dirty = Object.keys(draft).length > 0;

  // Approve validation — mirror server-side checks so the operator gets a
  // single clear blocker message instead of an opaque 400. Run against the
  // merged view (current row + unsaved draft) so the operator can fix
  // issues live, but require Save first because /approve operates on the
  // persisted row.
  const approveBlockers: string[] = [];
  if (!merged.title || !merged.title.trim()) approveBlockers.push("title is empty");
  if (!merged.imageUrl) approveBlockers.push("image is required");
  if ((merged.requiredIngredientIds ?? []).length === 0)
    approveBlockers.push("≥1 required ingredient");
  if ((merged.instructionsSteps ?? []).filter((s) => s.trim()).length === 0)
    approveBlockers.push("≥1 instruction step");
  if ((merged.instructionsSummary ?? "").trim().length < 40)
    approveBlockers.push("instructions summary ≥40 chars");
  if ((merged.qualityIssues ?? []).length > 0)
    approveBlockers.push(`clear ${merged.qualityIssues!.length} quality issue(s)`);
  const alreadyAcceptable = (merged.qualityTier ?? "") === "acceptable";
  const prodOrigin = isProdOriginRecipe({ id: recipe.id, sourceUrl: merged.sourceUrl ?? null });

  return (
    <div>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {merged.title ?? recipe.title}
            {prodOrigin && (
              <span
                title="Prod-origin recipe. Approving will set forceOverrideOrigin and rewrite the prod row."
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200"
                data-testid="badge-prod-origin"
              >
                prod-origin
              </span>
            )}
            {alreadyAcceptable && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                acceptable
              </span>
            )}
          </span>
        }
        description={`Recipe ${recipe.id} · ${detailQuery.data?.revisionCount ?? 0} revision(s)`}
        actions={
          <div className="flex items-center gap-2">
            <ApproveButton
              dirty={dirty}
              alreadyAcceptable={alreadyAcceptable}
              blockers={approveBlockers}
              prodOrigin={prodOrigin}
              pending={approveMutation.isPending}
              onApprove={() => approveMutation.mutate()}
            />
            <Link
              href="/recipes"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              data-testid="link-back-recipes"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Link>
          </div>
        }
      />

      <div className="p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <section className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
            <h2 className="text-sm font-semibold mb-3">Cover image</h2>
            <div className="flex items-start gap-4">
              <div className="w-40 h-32 rounded-md overflow-hidden bg-muted flex items-center justify-center text-xs text-muted-foreground">
                {merged.imageUrl ? (
                  // eslint-disable-next-line jsx-a11y/img-redundant-alt
                  <img
                    src={resolveImageSrc(merged.imageUrl)}
                    alt="cover"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  "no image"
                )}
              </div>
              <div className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.target.value = "";
                  }}
                  data-testid="input-image-file"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-input bg-background text-sm hover:bg-muted disabled:opacity-40"
                  data-testid="button-upload-image"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {uploading ? "Uploading…" : "Upload new image"}
                </button>
                <input
                  type="text"
                  value={merged.imageUrl ?? ""}
                  onChange={(e) => set("imageUrl", e.target.value)}
                  className="w-full px-2 py-1 text-xs font-mono rounded border border-input bg-background"
                  placeholder="/objects/... or https://"
                />
              </div>
            </div>
          </section>

          <section className="bg-card border border-card-border rounded-lg p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold">Basics</h2>
            <Field label="Title">
              <input
                value={merged.title ?? ""}
                onChange={(e) => set("title", e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                data-testid="input-title"
              />
            </Field>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Difficulty">
                <select
                  value={merged.difficulty ?? ""}
                  onChange={(e) => set("difficulty", e.target.value)}
                  className="w-full px-2 py-2 rounded-md border border-input bg-background text-sm"
                >
                  {["Easy", "Medium", "Hard"].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Time (min)">
                <input
                  type="number"
                  value={merged.estimatedTimeMin ?? 0}
                  onChange={(e) => set("estimatedTimeMin", parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </Field>
              <Field label="Budget">
                <select
                  value={merged.budget ?? ""}
                  onChange={(e) => set("budget", e.target.value)}
                  className="w-full px-2 py-2 rounded-md border border-input bg-background text-sm"
                >
                  {["$", "$$", "$$$", "$$$$"].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Servings">
                <input
                  type="number"
                  value={merged.defaultServings ?? 0}
                  onChange={(e) => set("defaultServings", parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </Field>
            </div>
            <Field label="Source URL">
              <input
                value={merged.sourceUrl ?? ""}
                onChange={(e) => set("sourceUrl", e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono text-xs"
              />
            </Field>
          </section>

          <section className="bg-card border border-card-border rounded-lg p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold">Tags & constraints</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Cuisine tags (comma-separated)">
                <input
                  value={listToText(merged.cuisineTags ?? [])}
                  onChange={(e) => set("cuisineTags", textToList(e.target.value))}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </Field>
              <Field label="Moods">
                <input
                  value={listToText(merged.moods ?? [])}
                  onChange={(e) => set("moods", textToList(e.target.value))}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </Field>
              <Field label="Constraints">
                <input
                  value={listToText(merged.constraints ?? [])}
                  onChange={(e) => set("constraints", textToList(e.target.value))}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </Field>
              <Field label="Dish type">
                <input
                  value={listToText(merged.dishType ?? [])}
                  onChange={(e) => set("dishType", textToList(e.target.value))}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </Field>
            </div>
          </section>

          <section className="bg-card border border-card-border rounded-lg p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold">Ingredients & steps</h2>
            <Field label="Required ingredient IDs (comma-separated)">
              <textarea
                value={listToText(merged.requiredIngredientIds ?? [])}
                onChange={(e) => set("requiredIngredientIds", textToList(e.target.value))}
                rows={3}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs font-mono"
              />
            </Field>
            <Field label="Optional ingredient IDs">
              <textarea
                value={listToText(merged.optionalIngredientIds ?? [])}
                onChange={(e) => set("optionalIngredientIds", textToList(e.target.value))}
                rows={2}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs font-mono"
              />
            </Field>
            <Field label="Instructions summary">
              <textarea
                value={merged.instructionsSummary ?? ""}
                onChange={(e) => set("instructionsSummary", e.target.value)}
                rows={8}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                data-testid="textarea-instructions"
              />
            </Field>
            <Field label="Instructions steps">
              <StepsEditor
                value={merged.instructionsSteps ?? []}
                onChange={(steps) => set("instructionsSteps", steps)}
              />
            </Field>
          </section>

          <section className="bg-card border border-card-border rounded-lg p-5 shadow-sm space-y-3 sticky bottom-4">
            <Field label="Edit note (will be saved with revision)">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="why this change?"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                data-testid="input-note"
              />
            </Field>
            <div className="flex items-center justify-end gap-2">
              <span
                className={cn(
                  "text-xs",
                  dirty ? "text-orange-600" : "text-muted-foreground"
                )}
              >
                {dirty ? `${Object.keys(draft).length} unsaved change(s)` : "No changes"}
              </span>
              <button
                onClick={handleSave}
                disabled={!dirty || saveMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
                data-testid="button-save"
              >
                <Save className="w-3.5 h-3.5" />
                {saveMutation.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </section>
        </div>

        <aside className="space-y-3">
          <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
            <h2 className="text-sm font-semibold mb-3">Revision history</h2>
            {revisionsQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : (revisionsQuery.data?.revisions ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No revisions yet. Save a change to create one.</p>
            ) : (
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                {(revisionsQuery.data?.revisions ?? []).map((r) => (
                  <li
                    key={r.id}
                    className="border border-border rounded-md p-3 text-xs space-y-1"
                    data-testid={`revision-${r.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString()}
                      </span>
                      <button
                        onClick={() => {
                          if (confirm("Restore this revision? Current state will be snapshotted first.")) {
                            restoreMutation.mutate(r.id);
                          }
                        }}
                        disabled={restoreMutation.isPending}
                        title="Restore this revision"
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-input hover:bg-muted disabled:opacity-40"
                        data-testid={`button-restore-${r.id}`}
                      >
                        <RotateCcw className="w-3 h-3" /> Restore
                      </button>
                    </div>
                    <p className="text-muted-foreground">
                      by {r.editedByEmail ?? "—"}
                    </p>
                    {r.note && <p className="text-foreground italic">“{r.note}”</p>}
                    <p className="font-medium truncate" title={r.snapshot?.title}>
                      {r.snapshot?.title ?? "(untitled snapshot)"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ApproveButton({
  dirty,
  alreadyAcceptable,
  blockers,
  prodOrigin,
  pending,
  onApprove,
}: {
  dirty: boolean;
  alreadyAcceptable: boolean;
  blockers: string[];
  prodOrigin: boolean;
  pending: boolean;
  onApprove: () => void;
}) {
  // alreadyAcceptable is NOT a blocker — re-approving on a row that's
  // already `acceptable` is the supported way to force a fresh push to
  // prod (e.g. when an older audit row for the same recipe is stuck in
  // the dead-letter queue with `origin_locked` because it pre-dated the
  // approve flow). The /approve endpoint is idempotent: same UPDATE,
  // new audit rows with the [approve-flow] marker.
  const disabled = dirty || blockers.length > 0 || pending;
  const tooltip = dirty
    ? "Save your changes before approving — Approve operates on the persisted row."
    : blockers.length > 0
      ? `Fix first: ${blockers.join("; ")}`
      : alreadyAcceptable
        ? prodOrigin
          ? "Already acceptable. Click to re-push to prod (forces forceOverrideOrigin)."
          : "Already acceptable. Click to re-push to prod via approve-flow."
        : prodOrigin
          ? "This is a prod-origin recipe. Approving will overwrite it on prod."
          : "Approve this recipe for prod.";
  return (
    <button
      type="button"
      disabled={disabled}
      title={tooltip}
      onClick={() => {
        const msg = alreadyAcceptable
          ? prodOrigin
            ? "Re-approve and push to PROD again? This writes a fresh [approve-flow] audit so the next sync overwrites the prod row with forceOverrideOrigin."
            : "Re-approve and push to prod again? This writes a fresh [approve-flow] audit so the next sync re-applies the row."
          : prodOrigin
            ? "Approve and overwrite the PROD row for this recipe? This sets forceOverrideOrigin on the next reverse-sync push."
            : "Approve this recipe? It will be marked acceptable and pushed to prod on the next reverse-sync run.";
        if (confirm(msg)) onApprove();
      }}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
      data-testid="button-approve-recipe"
    >
      <CheckCircle2 className="w-3.5 h-3.5" />
      {pending ? "Approving…" : alreadyAcceptable ? "Re-approve" : "Approve"}
    </button>
  );
}

function StepsEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function update(i: number, text: string) {
    const next = value.slice();
    next[i] = text;
    onChange(next);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...value, ""]);
  }
  return (
    <div className="space-y-2" data-testid="editor-instructions-steps">
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No steps yet. Click "Add step" below.</p>
      )}
      {value.map((step, i) => (
        <div key={i} className="flex items-start gap-2" data-testid={`step-row-${i}`}>
          <span className="mt-2 text-xs font-mono text-muted-foreground w-6 text-right tabular-nums">
            {i + 1}.
          </span>
          <textarea
            value={step}
            onChange={(e) => update(i, e.target.value)}
            rows={2}
            className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
            placeholder="Describe this step…"
            data-testid={`step-textarea-${i}`}
          />
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              title="Move up"
              className="p-1 rounded border border-input hover:bg-muted disabled:opacity-30"
              data-testid={`step-up-${i}`}
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === value.length - 1}
              title="Move down"
              className="p-1 rounded border border-input hover:bg-muted disabled:opacity-30"
              data-testid={`step-down-${i}`}
            >
              <ArrowDown className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => remove(i)}
              title="Remove step"
              className="p-1 rounded border border-input hover:bg-destructive/10 hover:text-destructive"
              data-testid={`step-remove-${i}`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-input bg-background text-xs hover:bg-muted"
        data-testid="step-add"
      >
        <Plus className="w-3 h-3" /> Add step
      </button>
    </div>
  );
}

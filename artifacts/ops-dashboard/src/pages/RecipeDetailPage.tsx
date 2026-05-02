import { useEffect, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { uploadImageFile, resolveImageSrc } from "@/lib/upload";
import { PageHeader } from "@/components/ui/page-header";
import { ArrowLeft, Upload, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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

  return (
    <div>
      <PageHeader
        title={merged.title ?? recipe.title}
        description={`Recipe ${recipe.id} · ${detailQuery.data?.revisionCount ?? 0} revision(s)`}
        actions={
          <Link
            href="/recipes"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            data-testid="link-back-recipes"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
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

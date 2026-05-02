import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { resolveImageSrc } from "@/lib/upload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CheckCircle, XCircle, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Props {
  recipeId: string | null;
  onClose: () => void;
}

interface UgcDetail {
  recipe: {
    id: string;
    title: string;
    servings: number;
    tags: string[];
    ingredients: Array<{ name?: string; quantity?: string; unit?: string } | string>;
    steps: Array<{ text?: string; description?: string } | string>;
    notes: string | null;
    submissionStatus: string;
    visibilityState: string;
    coverImageUrl: string | null;
    likesCount: number;
    saveCount: number;
    commentCount: number;
    reportCount: number;
    createdAt: string;
    publishedAt: string | null;
  };
  author: {
    id: string;
    email: string;
    username: string;
    role: string;
    joinedAt: string;
    otherPublishedCount: number;
    otherPendingCount: number;
    totalReportCount: number;
  } | null;
  reports: Array<{
    id: string;
    reporterEmail: string | null;
    reason: string;
    details: string | null;
    status: string;
    createdAt: string;
  }>;
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-destructive/10 text-destructive",
  needs_more_info: "bg-blue-100 text-blue-700",
};

function renderItem(it: unknown): string {
  if (typeof it === "string") return it;
  if (it && typeof it === "object") {
    const o = it as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (typeof o.description === "string") return o.description;
    const name = (o.name as string) ?? "";
    const qty = (o.quantity as string) ?? "";
    const unit = (o.unit as string) ?? "";
    return [qty, unit, name].filter(Boolean).join(" ");
  }
  return JSON.stringify(it);
}

export function UserCreatedRecipeModal({ recipeId, onClose }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const detailQuery = useQuery({
    queryKey: ["ops", "user-recipe-detail", recipeId],
    queryFn: () =>
      apiFetch(`/api/ops/recipes/user-created/${recipeId}`).then(
        (r) => r.json() as Promise<UgcDetail>
      ),
    enabled: !!recipeId,
  });

  const decideMutation = useMutation({
    mutationFn: (decision: string) =>
      apiFetch(`/api/ops/recipes/user-created/${recipeId}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      }).then(async (r) => {
        if (!r.ok) {
          const text = await r.text();
          let msg = `HTTP ${r.status}`;
          try {
            msg = (JSON.parse(text) as { error?: string }).error ?? msg;
          } catch {
            /* not json */
          }
          throw new Error(msg);
        }
        return r.json();
      }),
    onSuccess: (_d, decision) => {
      toast({ title: `Recipe ${decision}`, description: "Decision recorded." });
      qc.invalidateQueries({ queryKey: ["ops", "user-recipes"] });
      qc.invalidateQueries({ queryKey: ["ops", "user-recipe-detail", recipeId] });
      onClose();
    },
    onError: (e: Error) =>
      toast({ title: "Decision failed", description: e.message, variant: "destructive" }),
  });

  const data = detailQuery.data;

  return (
    <Dialog open={!!recipeId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-3xl max-h-[85vh] overflow-y-auto"
        data-testid="modal-ugc-detail"
      >
        <DialogHeader>
          <DialogTitle data-testid="text-ugc-title">{data?.recipe.title ?? "Loading…"}</DialogTitle>
          <DialogDescription>
            {data ? (
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-xs font-medium",
                    STATUS_BADGE[data.recipe.submissionStatus] ?? "bg-muted"
                  )}
                >
                  {data.recipe.submissionStatus}
                </span>
                <span className="text-xs text-muted-foreground">
                  Submitted {new Date(data.recipe.createdAt).toLocaleString()}
                </span>
              </span>
            ) : (
              "—"
            )}
          </DialogDescription>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground p-6">Failed to load recipe.</p>
        ) : (
          <div className="space-y-4">
            {data.recipe.coverImageUrl && (
              <img
                src={resolveImageSrc(data.recipe.coverImageUrl)}
                alt="cover"
                className="w-full h-48 object-cover rounded-md"
              />
            )}

            <div className="grid grid-cols-4 gap-2 text-xs">
              <Stat label="Servings" value={String(data.recipe.servings)} />
              <Stat label="Likes" value={String(data.recipe.likesCount)} />
              <Stat label="Saves" value={String(data.recipe.saveCount)} />
              <Stat
                label="Reports"
                value={String(data.recipe.reportCount)}
                tone={data.recipe.reportCount > 0 ? "warn" : undefined}
              />
            </div>

            {data.recipe.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {data.recipe.tags.map((t) => (
                  <span
                    key={t}
                    className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <section>
              <h3 className="text-sm font-semibold mb-2">
                Ingredients ({data.recipe.ingredients.length})
              </h3>
              <ul className="text-sm space-y-1 list-disc pl-5">
                {data.recipe.ingredients.map((ing, i) => (
                  <li key={i}>{renderItem(ing)}</li>
                ))}
                {data.recipe.ingredients.length === 0 && (
                  <li className="text-muted-foreground italic list-none">— none —</li>
                )}
              </ul>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">
                Steps ({data.recipe.steps.length})
              </h3>
              <ol className="text-sm space-y-1 list-decimal pl-5">
                {data.recipe.steps.map((s, i) => (
                  <li key={i}>{renderItem(s)}</li>
                ))}
                {data.recipe.steps.length === 0 && (
                  <li className="text-muted-foreground italic list-none">— none —</li>
                )}
              </ol>
            </section>

            {data.recipe.notes && (
              <section>
                <h3 className="text-sm font-semibold mb-1">Notes</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {data.recipe.notes}
                </p>
              </section>
            )}

            {data.author && (
              <section className="bg-muted/40 border border-border rounded-md p-3">
                <h3 className="text-xs font-semibold mb-2 text-muted-foreground">
                  Author
                </h3>
                <p className="text-sm font-medium">
                  {data.author.username}{" "}
                  <span className="text-muted-foreground text-xs">
                    ({data.author.email})
                  </span>
                </p>
                <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-muted-foreground">
                  <span>
                    Joined {new Date(data.author.joinedAt).toLocaleDateString()}
                  </span>
                  <span>
                    {data.author.otherPublishedCount} other published
                  </span>
                  <span>
                    {data.author.otherPendingCount} pending
                  </span>
                </div>
                {data.author.totalReportCount > 0 && (
                  <p className="text-xs text-orange-600 mt-1">
                    Author has {data.author.totalReportCount} total reports across all submissions.
                  </p>
                )}
              </section>
            )}

            {data.reports.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <Flag className="w-3.5 h-3.5 text-destructive" />
                  Reports ({data.reports.length})
                </h3>
                <ul className="space-y-2">
                  {data.reports.map((r) => (
                    <li
                      key={r.id}
                      className="border border-border rounded-md p-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{r.reason}</span>
                        <span className="text-muted-foreground">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {r.details && (
                        <p className="text-muted-foreground mt-1">{r.details}</p>
                      )}
                      <p className="text-muted-foreground mt-1">
                        by {r.reporterEmail ?? "anonymous"} · {r.status}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.recipe.submissionStatus === "pending" && (
              <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-background pt-3 border-t border-border">
                <button
                  onClick={() => decideMutation.mutate("rejected")}
                  disabled={decideMutation.isPending}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-input text-sm hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                  data-testid="button-reject"
                >
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
                <button
                  onClick={() => decideMutation.mutate("approved")}
                  disabled={decideMutation.isPending}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-40"
                  data-testid="button-approve"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Approve
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div
      className={cn(
        "border rounded-md p-2",
        tone === "warn"
          ? "border-orange-300 bg-orange-50"
          : "border-border bg-background"
      )}
    >
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

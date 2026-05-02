import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  Eye,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";

interface StagingRow {
  id: string;
  source: string;
  sourceRecipeId: string;
  title: string;
  status: string;
  cuisineTags: string[];
  estimatedTimeMin: number | null;
  difficulty: string | null;
  mappingRate: number | null;
  unmappedIngredientNames: string[];
  mappedIngredientCount: number;
  imageUrl: string | null;
  sourceUrl: string | null;
  notes: string | null;
  createdAt: string;
  promotedRecipeId: string | null;
}

interface StagingDetail extends StagingRow {
  instructionsSummary: string | null;
  instructionsSteps: string[];
  rawPayload: unknown;
}

interface StagingResponse {
  rows: StagingRow[];
  total: number;
  page: number;
  limit: number;
  facets: {
    sources: { source: string; count: number }[];
    statuses: { status: string; count: number }[];
  };
}

const STATUS_BADGE: Record<string, string> = {
  imported: "bg-blue-100 text-blue-700",
  ready: "bg-emerald-100 text-emerald-700",
  needs_review: "bg-orange-100 text-orange-700",
  promoted: "bg-purple-100 text-purple-700",
  rejected: "bg-destructive/10 text-destructive",
};

function MappingPill({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = Math.round(rate * 100);
  const color =
    pct >= 80
      ? "bg-emerald-100 text-emerald-700"
      : pct >= 50
      ? "bg-yellow-100 text-yellow-700"
      : "bg-red-100 text-red-700";
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium tabular-nums", color)}>
      {pct}%
    </span>
  );
}

function StagingDetailDrawer({
  stagingId,
  onClose,
  onAfterAction,
}: {
  stagingId: string | null;
  onClose: () => void;
  onAfterAction: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState("");

  const detail = useQuery<StagingDetail>({
    queryKey: ["ops", "staging", stagingId],
    queryFn: () => apiFetch(`/api/ops/recipes/staging/${stagingId}`).then((r) => r.json()),
    enabled: !!stagingId,
  });

  const promote = useMutation({
    mutationFn: () =>
      apiFetch(`/api/ops/recipes/staging/${stagingId}/promote`, {
        method: "POST",
        body: JSON.stringify({ note: note || undefined }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      toast({ title: "Promoted", description: `Recipe id ${data.recipeId?.slice(0, 8)}…` });
      qc.invalidateQueries({ queryKey: ["ops", "staging"] });
      onAfterAction();
      onClose();
    },
    onError: (e: Error) => toast({ title: "Promote failed", description: e.message, variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: () =>
      apiFetch(`/api/ops/recipes/staging/${stagingId}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: note || undefined }),
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Rejected" });
      qc.invalidateQueries({ queryKey: ["ops", "staging"] });
      onAfterAction();
      onClose();
    },
    onError: (e: Error) => toast({ title: "Reject failed", description: e.message, variant: "destructive" }),
  });

  if (!stagingId) return null;

  const d = detail.data;
  const isFinal = d ? ["promoted", "rejected"].includes(d.status) : true;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-[640px] max-w-[90vw] bg-card border-l border-border shadow-xl overflow-y-auto">
        {detail.isLoading ? (
          <div className="p-8 text-muted-foreground text-sm">Loading…</div>
        ) : !d ? (
          <div className="p-8 text-muted-foreground text-sm">Not found</div>
        ) : (
          <>
            <div className="px-6 py-5 border-b border-border sticky top-0 bg-card z-10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    {d.source} · {d.sourceRecipeId}
                  </p>
                  <h2 className="text-lg font-semibold leading-tight">{d.title}</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", STATUS_BADGE[d.status] ?? "bg-muted")}>
                      {d.status}
                    </span>
                    <MappingPill rate={d.mappingRate} />
                    {d.promotedRecipeId && (
                      <Link
                        href={`/recipes/${d.promotedRecipeId}`}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        recipe {d.promotedRecipeId.slice(0, 8)}
                      </Link>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                  aria-label="Close"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {d.imageUrl && (
                <img src={d.imageUrl} alt="" className="w-full max-h-56 object-cover rounded-md border border-border" />
              )}

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Mapped</p>
                  <p className="font-medium tabular-nums">{d.mappedIngredientCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unmapped</p>
                  <p className={cn("font-medium tabular-nums", d.unmappedIngredientNames.length > 0 && "text-orange-600")}>
                    {d.unmappedIngredientNames.length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Time</p>
                  <p className="font-medium tabular-nums">{d.estimatedTimeMin ? `${d.estimatedTimeMin}m` : "—"}</p>
                </div>
              </div>

              {d.unmappedIngredientNames.length > 0 && (
                <div className="rounded-md border border-orange-200 bg-orange-50 p-3">
                  <p className="text-xs font-medium text-orange-900 mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {d.unmappedIngredientNames.length} ingredient(s) won&apos;t map to your products catalog
                  </p>
                  <ul className="text-xs text-orange-900 list-disc pl-5 space-y-0.5">
                    {d.unmappedIngredientNames.slice(0, 12).map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                    {d.unmappedIngredientNames.length > 12 && (
                      <li className="text-orange-700">…+{d.unmappedIngredientNames.length - 12} more</li>
                    )}
                  </ul>
                </div>
              )}

              {d.cuisineTags.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Cuisine</p>
                  <div className="flex flex-wrap gap-1">
                    {d.cuisineTags.map((c) => (
                      <span key={c} className="px-1.5 py-0.5 rounded bg-muted text-xs">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {d.instructionsSummary && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Instructions</p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
                    {d.instructionsSummary.length > 600
                      ? d.instructionsSummary.slice(0, 600) + "…"
                      : d.instructionsSummary}
                  </p>
                </div>
              )}

              {d.sourceUrl && (
                <a
                  href={d.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Source URL
                </a>
              )}

              {!isFinal && (
                <div className="border-t border-border pt-4 space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Decision note (optional)</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Why are you promoting / rejecting this?"
                      rows={2}
                      className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (window.confirm(`Promote "${d.title}" into the live recipes catalog? This cannot be undone from the UI.`)) {
                          promote.mutate();
                        }
                      }}
                      disabled={promote.isPending}
                      data-testid="button-promote"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" /> Promote to recipes
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Reject "${d.title}"? It will be hidden from the staging queue.`)) {
                          reject.mutate();
                        }
                      }}
                      disabled={reject.isPending}
                      data-testid="button-reject"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function RecipesStagingPage() {
  const [status, setStatus] = useState("pending");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery<StagingResponse>({
    queryKey: ["ops", "staging", status, source, q, page],
    queryFn: () =>
      apiFetch(
        `/api/ops/recipes/staging?status=${encodeURIComponent(status)}&source=${encodeURIComponent(source)}&q=${encodeURIComponent(q)}&page=${page}&limit=50`
      ).then((r) => r.json()),
  });

  const totalPages = Math.ceil((list.data?.total ?? 0) / 50);
  const facets = list.data?.facets;

  return (
    <div>
      <PageHeader
        title="Recipe Staging"
        description="Imports from TheMealDB / Wikibooks waiting to be promoted into the catalog"
      />
      <div className="p-6 space-y-4">
        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {["pending", "imported", "ready", "needs_review", "promoted", "rejected", "all"].map((s) => {
            const facet = facets?.statuses.find((f) => f.status === s);
            const pendingTotal =
              s === "pending"
                ? (facets?.statuses ?? [])
                    .filter((f) => ["imported", "ready", "needs_review"].includes(f.status))
                    .reduce((sum, f) => sum + f.count, 0)
                : null;
            const allTotal =
              s === "all" ? (facets?.statuses ?? []).reduce((sum, f) => sum + f.count, 0) : null;
            const count = pendingTotal ?? allTotal ?? facet?.count ?? 0;
            return (
              <button
                key={s}
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                data-testid={`filter-status-${s}`}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  status === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                )}
              >
                {s.replace("_", " ")} <span className="opacity-60 tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search title…"
              className="w-full pl-9 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All sources</option>
            {(facets?.sources ?? []).map((s) => (
              <option key={s.source} value={s.source}>
                {s.source} ({s.count})
              </option>
            ))}
          </select>
        </div>

        <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Mapping</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Unmapped</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Imported</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (list.data?.rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    Nothing in {status}
                  </td>
                </tr>
              ) : (
                (list.data?.rows ?? []).map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setOpenId(r.id)}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    data-testid={`row-staging-${r.id}`}
                  >
                    <td className="px-4 py-3 font-medium text-foreground max-w-md truncate">{r.title}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.source}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", STATUS_BADGE[r.status] ?? "bg-muted")}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MappingPill rate={r.mappingRate} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">
                      <span className={r.unmappedIngredientNames.length > 0 ? "text-orange-600" : "text-muted-foreground"}>
                        {r.unmappedIngredientNames.length}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                        title="Open detail"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
              Page {page} of {totalPages} · {list.data?.total ?? 0} total
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <StagingDetailDrawer
        stagingId={openId}
        onClose={() => setOpenId(null)}
        onAfterAction={() => list.refetch()}
      />
    </div>
  );
}

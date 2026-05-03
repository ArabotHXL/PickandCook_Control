import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useListOpsStaging,
  useGetOpsStagingDetail,
  usePromoteOpsStaging,
  useRejectOpsStaging,
  useRemapOpsStagingIngredients,
  useReextractOpsStagingIngredients,
  getListOpsStagingQueryKey,
  type OpsStagingRow,
  type OpsStagingDetail,
  type ListOpsStagingDir,
  type ListOpsStagingStatus,
  OpsStagingReextractBodySource,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SortableHeader, type SortState } from "@/components/SortableHeader";
import {
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  Eye,
  ExternalLink,
  AlertTriangle,
  Wand2,
} from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  imported: "bg-blue-100 text-blue-700",
  ready: "bg-emerald-100 text-emerald-700",
  needs_review: "bg-orange-100 text-orange-700",
  promoted: "bg-purple-100 text-purple-700",
  rejected: "bg-destructive/10 text-destructive",
};

function MappingPill({ rate }: { rate: number | null | undefined }) {
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
  const [showAllUnmapped, setShowAllUnmapped] = useState(false);

  // Orval already sets `enabled: !!stagingId` and a stable detail query key
  // (`/api/ops/recipes/staging/{id}`); we don't override either, so the next
  // slice can copy this pattern verbatim without inventing key conventions.
  const detail = useGetOpsStagingDetail(stagingId ?? "");

  // Reset the "show all" toggle whenever a different row is opened.
  useEffect(() => {
    setShowAllUnmapped(false);
  }, [stagingId]);

  const invalidateLists = () => {
    qc.invalidateQueries({ queryKey: getListOpsStagingQueryKey().slice(0, 1) });
  };

  const promote = usePromoteOpsStaging({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: "Promoted",
          description: `Recipe id ${data.recipeId.slice(0, 8)}…`,
        });
        invalidateLists();
        onAfterAction();
        onClose();
      },
      onError: (e: Error) =>
        toast({ title: "Promote failed", description: e.message, variant: "destructive" }),
    },
  });

  const reject = useRejectOpsStaging({
    mutation: {
      onSuccess: () => {
        toast({ title: "Rejected" });
        invalidateLists();
        onAfterAction();
        onClose();
      },
      onError: (e: Error) =>
        toast({ title: "Reject failed", description: e.message, variant: "destructive" }),
    },
  });

  if (!stagingId) return null;

  const d = detail.data as OpsStagingDetail | undefined;
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
                <img src={d.imageUrl} alt={d.title} className="w-full max-h-56 object-cover rounded-md border border-border" />
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
                    {(showAllUnmapped
                      ? d.unmappedIngredientNames
                      : d.unmappedIngredientNames.slice(0, 12)
                    ).map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                  {d.unmappedIngredientNames.length > 12 && (
                    <button
                      type="button"
                      onClick={() => setShowAllUnmapped((v) => !v)}
                      data-testid="button-toggle-unmapped"
                      className="mt-2 text-xs font-medium text-orange-800 hover:text-orange-900 hover:underline"
                    >
                      {showAllUnmapped
                        ? "Show fewer"
                        : `Show all ${d.unmappedIngredientNames.length}`}
                    </button>
                  )}
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
                          promote.mutate({ stagingId, data: { note: note || undefined } });
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
                          reject.mutate({ stagingId, data: { note: note || undefined } });
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
  const [sort, setSort] = useState<SortState>({ col: "createdAt", dir: "desc" });
  const { toast } = useToast();
  const qc = useQueryClient();

  const list = useListOpsStaging({
    // `status` is a string union in the spec; cast at the boundary so the
    // filter chip handler stays a plain string (it always picks from the
    // closed list of chip values defined below).
    status: status as ListOpsStagingStatus,
    source: source || undefined,
    q: q || undefined,
    page,
    limit: 50,
    sort: sort.col,
    dir: sort.dir as ListOpsStagingDir,
  });

  const onSort = (s: SortState) => {
    setSort(s);
    setPage(1);
  };

  const invalidateLists = () => {
    qc.invalidateQueries({ queryKey: getListOpsStagingQueryKey().slice(0, 1) });
  };

  const remap = useRemapOpsStagingIngredients({
    mutation: {
      onSuccess: (d) => {
        toast({
          title: "Re-mapped staging rows",
          description: `Scanned ${d.scanned}, updated ${d.touched}, +${d.newlyMappedIngredients} ingredients mapped, ${d.promotedToReady} now ready.`,
        });
        invalidateLists();
      },
      onError: (e: Error) =>
        toast({ title: "Re-map failed", description: e.message, variant: "destructive" }),
    },
  });

  const reextract = useReextractOpsStagingIngredients({
    mutation: {
      onSuccess: (d) => {
        toast({
          title: "Re-extracted wikibooks rows",
          description: `Scanned ${d.scanned}, updated ${d.touched}, ${d.errors} errors, ${d.promotedToReady} now ready (Δ ${d.mappedDelta >= 0 ? "+" : ""}${d.mappedDelta} ingredients).`,
        });
        invalidateLists();
      },
      onError: (e: Error) =>
        toast({ title: "Re-extract failed", description: e.message, variant: "destructive" }),
    },
  });

  const totalPages = Math.ceil((list.data?.total ?? 0) / 50);
  const facets = list.data?.facets;
  const rows: OpsStagingRow[] = list.data?.rows ?? [];

  return (
    <div>
      <PageHeader
        title="Recipe Staging"
        description="Imports from TheMealDB / Wikibooks waiting to be promoted into the catalog"
        actions={
          <div className="flex items-center gap-2">
            {source === "wikibooks" && (
              <button
                onClick={() =>
                  reextract.mutate({
                    data: { source: OpsStagingReextractBodySource.wikibooks },
                  })
                }
                disabled={reextract.isPending}
                data-testid="button-reextract-wikibooks"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-input bg-background hover:bg-muted disabled:opacity-50"
                title="Re-fetch wikitext from Wikibooks and re-run structured ingredient extraction (capped at 50)"
              >
                <Wand2 className="w-4 h-4" />
                {reextract.isPending ? "Re-extracting…" : "Re-extract from source"}
              </button>
            )}
            <button
              onClick={() =>
                remap.mutate({ data: { source: source || undefined } })
              }
              disabled={remap.isPending}
              data-testid="button-remap"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-input bg-background hover:bg-muted disabled:opacity-50"
              title="Re-run ingredient mapping over imported / needs_review rows (capped at 200)"
            >
              <Wand2 className="w-4 h-4" />
              {remap.isPending ? "Re-mapping…" : "Re-map ingredients"}
            </button>
          </div>
        }
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
            const FILTER_LABELS: Record<string, string> = {
              pending: "In queue",
              imported: "Imported",
              ready: "Ready",
              needs_review: "Needs review",
              promoted: "Promoted",
              rejected: "Rejected",
              all: "All",
            };
            const FILTER_TITLES: Record<string, string> = {
              pending: "Everything not yet promoted or rejected (imported + ready + needs review)",
            };
            return (
              <button
                key={s}
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                data-testid={`filter-status-${s}`}
                title={FILTER_TITLES[s]}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  status === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                )}
              >
                {FILTER_LABELS[s] ?? s.replace("_", " ")}{" "}
                <span className="opacity-60 tabular-nums">({count})</span>
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
                <SortableHeader col="title" active={sort} onChange={onSort} defaultDir="asc">Title</SortableHeader>
                <SortableHeader col="source" active={sort} onChange={onSort} defaultDir="asc">Source</SortableHeader>
                <SortableHeader col="status" active={sort} onChange={onSort} defaultDir="asc">Status</SortableHeader>
                <SortableHeader col="mappingRate" active={sort} onChange={onSort} align="right">Mapping</SortableHeader>
                <SortableHeader col="unmappedCount" active={sort} onChange={onSort} align="right">Unmapped</SortableHeader>
                <SortableHeader col="createdAt" active={sort} onChange={onSort}>Imported</SortableHeader>
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
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    Nothing in {status}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
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
                disabled={page === totalPages}
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

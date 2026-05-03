import { useEffect, useMemo, useRef, useState } from "react";
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
  type ListOpsStagingStatus,
  OpsStagingReextractBodySource,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/ui/page-header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  XCircle,
  Search,
  ExternalLink,
  AlertTriangle,
  Wand2,
  Keyboard,
  Clock,
  BookOpen,
  ListFilter,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  imported: "bg-blue-100 text-blue-700 border-blue-200",
  ready: "bg-emerald-100 text-emerald-700 border-emerald-200",
  needs_review: "bg-orange-100 text-orange-700 border-orange-200",
  promoted: "bg-purple-100 text-purple-700 border-purple-200",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

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
  pending:
    "Everything not yet promoted or rejected (imported + ready + needs review)",
};

function MappingSwatch({ rate }: { rate: number | null | undefined }) {
  if (rate == null) return <div className="w-1.5 self-stretch bg-muted shrink-0" />;
  const pct = Math.round(rate * 100);
  const colorClass =
    pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return <div className={cn("w-1.5 self-stretch shrink-0", colorClass)} title={`${pct}% mapped`} />;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-medium font-mono text-muted-foreground bg-muted border border-border rounded uppercase shadow-sm">
      {children}
    </kbd>
  );
}

function QueueRow({
  r,
  selected,
  onClick,
  registerRef,
}: {
  r: OpsStagingRow;
  selected: boolean;
  onClick: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={registerRef}
      onClick={onClick}
      data-testid={`queue-row-${r.id}`}
      className={cn(
        "group flex cursor-pointer transition-colors border-l-[3px]",
        selected
          ? "bg-primary/5 border-l-primary"
          : "hover:bg-muted/50 border-l-transparent",
      )}
    >
      <MappingSwatch rate={r.mappingRate} />
      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
            {r.source}
          </span>
          <span className="text-xs font-medium tabular-nums opacity-60">
            {r.mappingRate != null ? `${Math.round(r.mappingRate * 100)}%` : "—"}
          </span>
        </div>
        <h3
          className={cn(
            "text-sm font-medium leading-tight truncate",
            selected ? "text-primary" : "text-foreground",
          )}
        >
          {r.title}
        </h3>
        <div className="flex items-center justify-between gap-2 mt-2">
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-medium border",
              STATUS_BADGE[r.status] ??
                "bg-muted text-muted-foreground border-transparent",
            )}
          >
            {r.status}
          </span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {r.unmappedIngredientNames.length > 0 && (
              <span className="flex items-center gap-1 text-orange-600 font-medium">
                <AlertTriangle className="w-3 h-3" />{" "}
                {r.unmappedIngredientNames.length}
              </span>
            )}
            {r.createdAt && (
              <span>
                {new Date(r.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailPane({
  detail,
  isLoading,
  note,
  onNoteChange,
  onPromote,
  onReject,
  promoteDisabled,
  rejectDisabled,
}: {
  detail: OpsStagingDetail | undefined;
  isLoading: boolean;
  note: string;
  onNoteChange: (v: string) => void;
  onPromote: () => void;
  onReject: () => void;
  promoteDisabled: boolean;
  rejectDisabled: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Not found
      </div>
    );
  }

  const isFinal = ["promoted", "rejected"].includes(detail.status);
  const promoteDisabledFinal = promoteDisabled || isFinal;
  const rejectDisabledFinal = rejectDisabled || isFinal;

  return (
    <>
      <ScrollArea className="flex-1">
        <div className="px-8 py-8 max-w-3xl mx-auto space-y-8 pb-32">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="uppercase tracking-wider font-semibold text-[10px] bg-muted px-2 py-0.5 rounded">
                {detail.source}
              </span>
              <span>
                ID: <span className="font-mono text-xs">{detail.sourceRecipeId}</span>
              </span>
              {detail.promotedRecipeId && (
                <Link
                  href={`/recipes/${detail.promotedRecipeId}`}
                  className="ml-2 text-primary hover:underline flex items-center gap-1 text-xs"
                >
                  <ExternalLink className="w-3 h-3" />
                  recipe {detail.promotedRecipeId.slice(0, 8)}
                </Link>
              )}
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground leading-tight">
              {detail.title}
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={cn(
                  "px-2 py-1 rounded text-xs font-semibold border uppercase tracking-wider",
                  STATUS_BADGE[detail.status] ?? "bg-muted",
                )}
              >
                {detail.status}
              </span>
              {detail.cuisineTags.length > 0 && (
                <div className="flex items-center gap-1.5 border-l border-border pl-3">
                  {detail.cuisineTags.map((tag) => (
                    <span key={tag} className="text-sm text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {detail.sourceUrl && (
                <a
                  href={detail.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1 ml-auto"
                >
                  <ExternalLink className="w-3 h-3" />
                  Source URL
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-[1.5fr_1fr] gap-8">
            <div className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2 border-b border-border pb-2">
                  <BookOpen className="w-5 h-5 text-muted-foreground" />
                  Ingredients analysis
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card border border-border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-1">
                      Mapped to catalog
                    </p>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">
                      {detail.mappedIngredientCount}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "border rounded-lg p-4",
                      detail.unmappedIngredientNames.length > 0
                        ? "border-orange-200 bg-orange-50/50"
                        : "border-border bg-card",
                    )}
                  >
                    <p
                      className={cn(
                        "text-sm mb-1",
                        detail.unmappedIngredientNames.length > 0
                          ? "text-orange-800"
                          : "text-muted-foreground",
                      )}
                    >
                      Unmapped
                    </p>
                    <p
                      className={cn(
                        "text-2xl font-semibold tabular-nums",
                        detail.unmappedIngredientNames.length > 0
                          ? "text-orange-600"
                          : "text-foreground",
                      )}
                    >
                      {detail.unmappedIngredientNames.length}
                    </p>
                  </div>
                </div>
                {detail.unmappedIngredientNames.length > 0 && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50/80 p-4">
                    <p className="text-sm font-medium text-orange-900 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      {detail.unmappedIngredientNames.length} ingredient(s) won&apos;t
                      map to your products catalog
                    </p>
                    <ul className="text-sm text-orange-900/90 space-y-1.5 pl-6 list-disc">
                      {detail.unmappedIngredientNames.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {detail.instructionsSummary && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2 border-b border-border pb-2">
                    <ListFilter className="w-5 h-5 text-muted-foreground" />
                    Instructions
                  </h3>
                  <p className="text-base text-foreground/90 leading-relaxed bg-muted/30 p-4 rounded-lg border border-border/50 whitespace-pre-wrap">
                    {detail.instructionsSummary.length > 1200
                      ? detail.instructionsSummary.slice(0, 1200) + "…"
                      : detail.instructionsSummary}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="rounded-lg overflow-hidden border border-border bg-card aspect-[4/3] flex items-center justify-center">
                {detail.imageUrl ? (
                  <img
                    src={detail.imageUrl}
                    alt={detail.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
                    <ImageIcon className="w-12 h-12" />
                    <span className="text-sm font-medium">No image</span>
                  </div>
                )}
              </div>
              <div className="bg-card border border-border rounded-lg divide-y divide-border">
                <div className="flex items-center justify-between p-3 text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Est. time
                  </span>
                  <span className="font-medium tabular-nums">
                    {detail.estimatedTimeMin ? `${detail.estimatedTimeMin}m` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <ListFilter className="w-4 h-4" /> Mapping rate
                  </span>
                  <span className="font-medium tabular-nums">
                    {detail.mappingRate != null
                      ? `${Math.round(detail.mappingRate * 100)}%`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 text-sm">
                  <span className="text-muted-foreground">Imported on</span>
                  <span className="font-medium">
                    {detail.createdAt
                      ? new Date(detail.createdAt).toLocaleDateString()
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="absolute bottom-0 left-0 right-0 bg-card border-t border-border p-4 px-8 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">
        <div className="max-w-3xl mx-auto flex items-end gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={
                isFinal
                  ? "This recipe is already finalized."
                  : "Add an optional decision note…"
              }
              className="w-full px-4 py-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition-all placeholder:text-muted-foreground/70"
              disabled={isFinal}
              data-testid="input-decision-note"
            />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              disabled={rejectDisabledFinal}
              onClick={onReject}
              data-testid="button-reject"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium border border-destructive/40 text-destructive hover:bg-destructive/10 bg-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XCircle className="w-4 h-4" /> Reject <Kbd>R</Kbd>
            </button>
            <button
              disabled={promoteDisabledFinal}
              onClick={onPromote}
              data-testid="button-promote"
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <CheckCircle className="w-4 h-4" /> Promote <Kbd>P</Kbd>
            </button>
          </div>
        </div>
        <div className="max-w-3xl mx-auto mt-3 flex justify-between items-center text-[10px] text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Keyboard className="w-3 h-3" /> Shortcuts
            </span>
            <span className="flex items-center gap-1">
              <Kbd>J</Kbd> <Kbd>K</Kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>P</Kbd> Promote
            </span>
            <span className="flex items-center gap-1">
              <Kbd>R</Kbd> Reject
            </span>
          </div>
          <span className="font-mono">{detail.id}</span>
        </div>
      </div>
    </>
  );
}

export function RecipesStagingPage() {
  const [status, setStatus] = useState<string>("pending");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const list = useListOpsStaging({
    status: status as ListOpsStagingStatus,
    source: source || undefined,
    q: q || undefined,
    page,
    limit: 50,
    sort: "createdAt",
    dir: "desc",
  });

  const rows: OpsStagingRow[] = list.data?.rows ?? [];
  const facets = list.data?.facets;
  const totalPages = Math.ceil((list.data?.total ?? 0) / 50);

  // Auto-select the first row whenever the list changes and nothing is selected
  // (or the selected row dropped out of the current filter).
  useEffect(() => {
    if (rows.length === 0) {
      if (openId !== null) setOpenId(null);
      return;
    }
    if (!openId || !rows.some((r) => r.id === openId)) {
      setOpenId(rows[0].id);
    }
  }, [rows, openId]);

  // Reset note whenever the selected row changes.
  useEffect(() => {
    setNote("");
  }, [openId]);

  // Scroll the selected row into view inside the queue list.
  useEffect(() => {
    if (!openId) return;
    const el = rowRefs.current.get(openId);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [openId]);

  const detail = useGetOpsStagingDetail(openId ?? "");

  const invalidateLists = () => {
    qc.invalidateQueries({ queryKey: getListOpsStagingQueryKey().slice(0, 1) });
    // Also refresh any open detail panes — remap/reextract may have changed
    // mapping rate, status, and unmapped lists for the currently-selected row.
    qc.invalidateQueries({
      predicate: (query) => {
        const k = query.queryKey?.[0];
        return typeof k === "string" && k.startsWith("/api/ops/recipes/staging/");
      },
    });
  };

  const goRelative = (delta: number) => {
    if (rows.length === 0) return;
    const idx = openId ? rows.findIndex((r) => r.id === openId) : -1;
    const next = Math.min(rows.length - 1, Math.max(0, idx + delta));
    if (next !== idx) setOpenId(rows[next].id);
  };

  const advanceAfterAction = () => {
    if (rows.length <= 1) {
      setOpenId(null);
      return;
    }
    const idx = openId ? rows.findIndex((r) => r.id === openId) : -1;
    const next = idx >= 0 && idx < rows.length - 1 ? rows[idx + 1] : rows[Math.max(0, idx - 1)];
    setOpenId(next.id);
  };

  const promote = usePromoteOpsStaging({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: "Promoted",
          description: `Recipe id ${data.recipeId.slice(0, 8)}…`,
        });
        advanceAfterAction();
        invalidateLists();
      },
      onError: (e: Error) =>
        toast({ title: "Promote failed", description: e.message, variant: "destructive" }),
    },
  });

  const reject = useRejectOpsStaging({
    mutation: {
      onSuccess: () => {
        toast({ title: "Rejected" });
        advanceAfterAction();
        invalidateLists();
      },
      onError: (e: Error) =>
        toast({ title: "Reject failed", description: e.message, variant: "destructive" }),
    },
  });

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

  const canAct = (): boolean => {
    if (!openId) return false;
    const d = detail.data;
    if (!d) return false;
    if (["promoted", "rejected"].includes(d.status)) return false;
    if (promote.isPending || reject.isPending) return false;
    return true;
  };

  const doPromote = () => {
    if (!canAct() || !openId || !detail.data) return;
    if (
      window.confirm(
        `Promote "${detail.data.title}" into the live recipes catalog? This cannot be undone from the UI.`,
      )
    ) {
      promote.mutate({ stagingId: openId, data: { note: note || undefined } });
    }
  };

  const doReject = () => {
    if (!canAct() || !openId || !detail.data) return;
    if (
      window.confirm(
        `Reject "${detail.data.title}"? It will be hidden from the staging queue.`,
      )
    ) {
      reject.mutate({ stagingId: openId, data: { note: note || undefined } });
    }
  };

  // Keyboard shortcuts (J/K navigate, P promote, R reject). Skip when typing in
  // an input so that search and the decision note are not hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case "j":
          e.preventDefault();
          goRelative(1);
          break;
        case "k":
          e.preventDefault();
          goRelative(-1);
          break;
        case "p":
          e.preventDefault();
          doPromote();
          break;
        case "r":
          e.preventDefault();
          doReject();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, openId, detail.data, note]);

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    (facets?.statuses ?? []).forEach((f) => {
      map[f.status] = f.count;
    });
    map.pending =
      (map.imported ?? 0) + (map.ready ?? 0) + (map.needs_review ?? 0);
    map.all = (facets?.statuses ?? []).reduce((s, f) => s + f.count, 0);
    return map;
  }, [facets]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
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
              onClick={() => remap.mutate({ data: { source: source || undefined } })}
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

      <div className="flex flex-1 overflow-hidden">
        {/* Queue */}
        <div className="w-[420px] flex flex-col border-r border-border bg-card z-10 shrink-0">
          <div className="p-3 border-b border-border space-y-3 bg-card shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search queue…"
                data-testid="input-queue-search"
                className="w-full pl-8 pr-3 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                data-testid="select-status"
                title={FILTER_TITLES[status]}
                className="flex-1 px-2 py-1.5 rounded border border-input bg-background text-xs focus:outline-none text-foreground"
              >
                {["pending", "imported", "ready", "needs_review", "promoted", "rejected", "all"].map(
                  (s) => (
                    <option key={s} value={s}>
                      {FILTER_LABELS[s]} ({statusCounts[s] ?? 0})
                    </option>
                  ),
                )}
              </select>
              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setPage(1);
                }}
                data-testid="select-source"
                className="flex-1 px-2 py-1.5 rounded border border-input bg-background text-xs focus:outline-none text-foreground"
              >
                <option value="">All sources</option>
                {(facets?.sources ?? []).map((s) => (
                  <option key={s.source} value={s.source}>
                    {s.source} ({s.count})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="divide-y divide-border/50">
              {list.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex">
                    <div className="w-1.5 bg-muted shrink-0" />
                    <div className="flex-1 p-3 space-y-2">
                      <div className="h-3 bg-muted rounded w-1/3 animate-pulse" />
                      <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
                      <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
                    </div>
                  </div>
                ))
              ) : rows.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Nothing in {FILTER_LABELS[status] ?? status}
                </div>
              ) : (
                rows.map((r) => (
                  <QueueRow
                    key={r.id}
                    r={r}
                    selected={openId === r.id}
                    onClick={() => setOpenId(r.id)}
                    registerRef={(el) => {
                      if (el) rowRefs.current.set(r.id, el);
                      else rowRefs.current.delete(r.id);
                    }}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          {totalPages > 1 && (
            <div className="border-t border-border p-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground tabular-nums">
                Page {page} of {totalPages} · {list.data?.total ?? 0} total
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-page-prev"
                  className="p-1 rounded border border-border hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  data-testid="button-page-next"
                  className="p-1 rounded border border-border hover:bg-muted disabled:opacity-40"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="flex-1 flex flex-col bg-background relative overflow-hidden">
          {!openId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">
                  {list.isLoading ? "Loading queue…" : "Queue is clear"}
                </p>
                <p className="text-sm mt-1">
                  {list.isLoading
                    ? "Fetching imported recipes"
                    : `${rows.length} recipe(s) match this filter`}
                </p>
              </div>
            </div>
          ) : (
            <DetailPane
              detail={detail.data}
              isLoading={detail.isLoading}
              note={note}
              onNoteChange={setNote}
              onPromote={doPromote}
              onReject={doReject}
              promoteDisabled={promote.isPending}
              rejectDisabled={reject.isPending}
            />
          )}
        </div>
      </div>
    </div>
  );
}

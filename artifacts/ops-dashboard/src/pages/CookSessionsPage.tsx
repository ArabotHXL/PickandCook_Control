import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ChefHat, Clock, CheckCircle, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExportMenu } from "@/components/ExportMenu";
import { SortableHeader } from "@/components/SortableHeader";
import { useSort } from "@/hooks/useSort";

function useCookSessions(status: string, page: number, sortQs: string) {
  return useQuery({
    queryKey: ["ops", "cookSessions", status, page, sortQs],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (status) params.set("status", status);
      return apiFetch(`/api/ops/cook-sessions?${params.toString()}${sortQs}`).then((r) => r.json());
    },
  });
}

function useDeductionReviews(status: string, page: number) {
  return useQuery({
    queryKey: ["ops", "deductionReviews", status, page],
    queryFn: () =>
      apiFetch(`/api/ops/cook-sessions/deduction-reviews?status=${status}&page=${page}&limit=50`).then((r) => r.json()),
  });
}

interface ItemizedRow {
  ingredientId: string;
  ingredientName: string;
  suggestedCount: number;
  confirmedCount: number;
  skippedCount: number;
  adjustedCount: number;
  nearExpiryCount: number;
  skipRate: number;
  adjustRate: number;
  suggestedQtySum: number;
  deductedQtySum: number;
  mostCommonUnit: string | null;
}

interface ItemizedResponse {
  items: ItemizedRow[];
  total: number;
  page: number;
  limit: number;
  since: string;
}

function useItemized(since: string, q: string, page: number, sortQs: string, enabled: boolean) {
  return useQuery<ItemizedResponse>({
    queryKey: ["ops", "cookSessions", "itemized", since, q, page, sortQs],
    enabled,
    queryFn: () => {
      const params = new URLSearchParams({ since, page: String(page), limit: "50" });
      if (q) params.set("q", q);
      return apiFetch(`/api/ops/cook-sessions/itemized?${params.toString()}${sortQs}`).then((r) => r.json());
    },
  });
}

// Debounce a value by `delay` ms so search input doesn't fire a query on
// every keystroke (the itemized aggregation is expensive at scale).
function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

const STATUS_BADGE: Record<string, string> = {
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  abandoned: "bg-muted text-muted-foreground",
  pending: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  skipped: "bg-muted text-muted-foreground",
};

export function CookSessionsPage() {
  const [tab, setTab] = useState<"sessions" | "reviews" | "itemized">("sessions");
  const [status, setStatus] = useState("");
  const [reviewStatus, setReviewStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const { sort, setSort, qs: sortQs } = useSort();
  const [itemizedSince, setItemizedSince] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [itemizedQ, setItemizedQ] = useState("");
  const itemizedSort = useSort({ col: "suggestedCount", dir: "desc" });

  const debouncedItemizedQ = useDebounced(itemizedQ, 300);
  const itemizedQuery = useItemized(itemizedSince, debouncedItemizedQ, page, itemizedSort.qs, tab === "itemized");
  const itemizedItems = itemizedQuery.data?.items ?? [];
  const itemizedTotal = itemizedQuery.data?.total ?? 0;

  const itemizedExportPath = (() => {
    const p = new URLSearchParams({ since: itemizedSince, limit: "5000" });
    if (itemizedQ) p.set("q", itemizedQ);
    return `/api/ops/cook-sessions/itemized?${p.toString()}${itemizedSort.qs}`;
  })();
  const itemizedExportStem = `cook-sessions-itemized-${itemizedSince}-${new Date().toISOString().slice(0, 10)}`;

  const exportPath = (() => {
    const p = new URLSearchParams({ limit: "5000" });
    if (status) p.set("status", status);
    return `/api/ops/cook-sessions?${p.toString()}${sortQs}`;
  })();
  const exportStem = `cook-sessions-${new Date().toISOString().slice(0, 10)}`;

  const sessionsQuery = useCookSessions(status, page, sortQs);
  const reviewsQuery = useDeductionReviews(reviewStatus, page);

  const sessions = sessionsQuery.data?.sessions ?? [];
  const summary = sessionsQuery.data?.summary;
  const sessionsTotal = sessionsQuery.data?.total ?? 0;
  const reviews = reviewsQuery.data?.reviews ?? [];
  const reviewsTotal = reviewsQuery.data?.total ?? 0;

  const total =
    tab === "sessions" ? sessionsTotal : tab === "reviews" ? reviewsTotal : itemizedTotal;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div>
      <PageHeader
        title="Cook Sessions"
        description="Active and completed cooking sessions and pantry deductions"
        actions={
          tab === "sessions" ? (
            <ExportMenu path={exportPath} filenameStem={exportStem} testId="button-export-csv" />
          ) : tab === "itemized" ? (
            <ExportMenu path={itemizedExportPath} filenameStem={itemizedExportStem} testId="button-export-itemized-csv" />
          ) : undefined
        }
      />

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Total Sessions" value={summary?.total ?? 0} icon={<ChefHat className="w-4 h-4" />} />
          <StatCard label="In Progress" value={summary?.inProgress ?? 0} icon={<Clock className="w-4 h-4" />} />
          <StatCard label="Completed" value={summary?.completed ?? 0} icon={<CheckCircle className="w-4 h-4" />} />
          <StatCard label="Abandoned" value={summary?.abandoned ?? 0} icon={<XCircle className="w-4 h-4" />} />
          <StatCard label="Pending Reviews" value={summary?.pendingReviews ?? 0} icon={<Clock className="w-4 h-4" />} />
        </div>

        <div className="flex gap-1 border-b border-border">
          {(["sessions", "reviews", "itemized"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setPage(1); }}
              data-testid={`tab-${t}`}
              className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
              {t === "sessions" ? "Sessions" : t === "reviews" ? "Pantry Deduction Reviews" : "Itemized Analysis"}
            </button>
          ))}
        </div>

        {tab === "sessions" && (
          <>
            <div className="flex gap-2">
              {["", "in_progress", "completed", "abandoned"].map((s) => (
                <button key={s} onClick={() => { setStatus(s); setPage(1); }}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    status === s ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  )}>
                  {s === "" ? "All" : s.replace("_", " ")}
                </button>
              ))}
            </div>

            <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <SortableHeader col="recipeTitle" active={sort} onChange={(s) => { setSort(s); setPage(1); }} defaultDir="asc">Recipe</SortableHeader>
                    <SortableHeader col="userEmail" active={sort} onChange={(s) => { setSort(s); setPage(1); }} defaultDir="asc">User</SortableHeader>
                    <SortableHeader col="status" active={sort} onChange={(s) => { setSort(s); setPage(1); }} defaultDir="asc">Status</SortableHeader>
                    <SortableHeader col="progressPct" active={sort} onChange={(s) => { setSort(s); setPage(1); }}>Progress</SortableHeader>
                    <SortableHeader col="servings" active={sort} onChange={(s) => { setSort(s); setPage(1); }} align="right">Servings</SortableHeader>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Review</th>
                    <SortableHeader col="startedAt" active={sort} onChange={(s) => { setSort(s); setPage(1); }}>Started</SortableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sessionsQuery.isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => <tr key={i}>{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
                  ) : sessions.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No cook sessions</td></tr>
                  ) : (
                    sessions.map((s: { id: string; recipeTitle: string | null; recipeId: string; userEmail: string | null; userId: string; status: string; progressPct: number; completedSteps: number; totalSteps: number; servings: number | null; reviewStatus: string | null; startedAt: string }) => (
                      <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground truncate max-w-xs">{s.recipeTitle ?? <span className="text-muted-foreground italic">unknown</span>}</p>
                          <p className="text-xs text-muted-foreground font-mono">{s.recipeId} · sid:{s.id.slice(0, 6)}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{s.userEmail ?? <span className="font-mono">{s.userId.slice(0, 8)}</span>}</td>
                        <td className="px-4 py-3">
                          <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", STATUS_BADGE[s.status] ?? "bg-muted")}>
                            {s.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${s.progressPct}%` }} />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground">{s.completedSteps}/{s.totalSteps}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">{s.servings ?? "—"}</td>
                        <td className="px-4 py-3">
                          {s.reviewStatus ? (
                            <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", STATUS_BADGE[s.reviewStatus] ?? "bg-muted")}>
                              {s.reviewStatus}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(s.startedAt).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "reviews" && (
          <>
            <div className="flex gap-2">
              {["pending", "confirmed", "skipped"].map((s) => (
                <button key={s} onClick={() => { setReviewStatus(s); setPage(1); }}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    reviewStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  )}>
                  {s}
                </button>
              ))}
            </div>

            <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Recipe</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Suggested</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Confirmed</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Skipped</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Adjusted</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reviewsQuery.isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => <tr key={i}>{Array.from({ length: 8 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
                  ) : reviews.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No reviews</td></tr>
                  ) : (
                    reviews.map((r: { id: string; recipeId: string | null; userEmail: string | null; userId: string; suggestedCount: number; confirmedCount: number; skippedCount: number; adjustedCount: number; status: string; createdAt: string }) => (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">{r.recipeId ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{r.userEmail ?? <span className="font-mono">{r.userId.slice(0, 8)}</span>}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.suggestedCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{r.confirmedCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.skippedCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-orange-600">{r.adjustedCount}</td>
                        <td className="px-4 py-3">
                          <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", STATUS_BADGE[r.status] ?? "bg-muted")}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "itemized" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {(["7d", "30d", "90d", "all"] as const).map((s) => (
                <button key={s} onClick={() => { setItemizedSince(s); setPage(1); }}
                  data-testid={`filter-since-${s}`}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    itemizedSince === s ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  )}>
                  {s === "all" ? "All time" : `Last ${s}`}
                </button>
              ))}
              <input
                type="search"
                placeholder="Search ingredient…"
                value={itemizedQ}
                onChange={(e) => { setItemizedQ(e.target.value); setPage(1); }}
                data-testid="input-itemized-search"
                className="ml-auto px-3 py-1.5 text-xs rounded-md border border-border bg-background w-64"
              />
            </div>

            <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <SortableHeader col="ingredientName" active={itemizedSort.sort} onChange={(s) => { itemizedSort.setSort(s); setPage(1); }} defaultDir="asc">Ingredient</SortableHeader>
                    <SortableHeader col="suggestedCount" active={itemizedSort.sort} onChange={(s) => { itemizedSort.setSort(s); setPage(1); }} align="right">Suggested</SortableHeader>
                    <SortableHeader col="confirmedCount" active={itemizedSort.sort} onChange={(s) => { itemizedSort.setSort(s); setPage(1); }} align="right">Confirmed</SortableHeader>
                    <SortableHeader col="skippedCount" active={itemizedSort.sort} onChange={(s) => { itemizedSort.setSort(s); setPage(1); }} align="right">Skipped</SortableHeader>
                    <SortableHeader col="adjustedCount" active={itemizedSort.sort} onChange={(s) => { itemizedSort.setSort(s); setPage(1); }} align="right">Adjusted</SortableHeader>
                    <SortableHeader col="skipRate" active={itemizedSort.sort} onChange={(s) => { itemizedSort.setSort(s); setPage(1); }} align="right">Skip&nbsp;%</SortableHeader>
                    <SortableHeader col="adjustRate" active={itemizedSort.sort} onChange={(s) => { itemizedSort.setSort(s); setPage(1); }} align="right">Adjust&nbsp;%</SortableHeader>
                    <SortableHeader col="nearExpiryCount" active={itemizedSort.sort} onChange={(s) => { itemizedSort.setSort(s); setPage(1); }} align="right">Near&nbsp;exp.</SortableHeader>
                    <SortableHeader col="suggestedQtySum" active={itemizedSort.sort} onChange={(s) => { itemizedSort.setSort(s); setPage(1); }} align="right">Sugg.&nbsp;qty</SortableHeader>
                    <SortableHeader col="deductedQtySum" active={itemizedSort.sort} onChange={(s) => { itemizedSort.setSort(s); setPage(1); }} align="right">Deducted&nbsp;qty</SortableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {itemizedQuery.isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => <tr key={i}>{Array.from({ length: 10 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
                  ) : itemizedItems.length === 0 ? (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No itemized data in this window</td></tr>
                  ) : (
                    itemizedItems.map((it) => {
                      const skipPct = (it.skipRate * 100).toFixed(1);
                      const adjPct = (it.adjustRate * 100).toFixed(1);
                      return (
                        <tr key={`${it.ingredientId}|${it.ingredientName}`} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{it.ingredientName}</p>
                            {it.ingredientId && <p className="text-xs text-muted-foreground font-mono">{it.ingredientId}</p>}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{it.suggestedCount}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{it.confirmedCount}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{it.skippedCount}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-orange-600">{it.adjustedCount}</td>
                          <td className={cn("px-4 py-3 text-right tabular-nums text-xs", it.skipRate >= 0.3 && "text-red-600 font-medium")}>{skipPct}%</td>
                          <td className={cn("px-4 py-3 text-right tabular-nums text-xs", it.adjustRate >= 0.3 && "text-orange-700 font-medium")}>{adjPct}%</td>
                          <td className="px-4 py-3 text-right tabular-nums text-xs text-amber-600">{it.nearExpiryCount || ""}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
                            {it.suggestedQtySum > 0 ? `${it.suggestedQtySum.toFixed(1)} ${it.mostCommonUnit ?? ""}`.trim() : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
                            {it.deductedQtySum > 0 ? `${it.deductedQtySum.toFixed(1)} ${it.mostCommonUnit ?? ""}`.trim() : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Aggregated across pantry deduction reviews in the selected window.
              Skip&nbsp;% and Adjust&nbsp;% are relative to suggested count. Quantities use the most-common suggested unit per ingredient.
            </p>
          </>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

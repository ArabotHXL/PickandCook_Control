import { useState } from "react";
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

const STATUS_BADGE: Record<string, string> = {
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  abandoned: "bg-muted text-muted-foreground",
  pending: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  skipped: "bg-muted text-muted-foreground",
};

export function CookSessionsPage() {
  const [tab, setTab] = useState<"sessions" | "reviews">("sessions");
  const [status, setStatus] = useState("");
  const [reviewStatus, setReviewStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const { sort, setSort, qs: sortQs } = useSort();

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

  const total = tab === "sessions" ? sessionsTotal : reviewsTotal;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div>
      <PageHeader
        title="Cook Sessions"
        description="Active and completed cooking sessions and pantry deductions"
        actions={
          tab === "sessions" ? (
            <ExportMenu path={exportPath} filenameStem={exportStem} testId="button-export-csv" />
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
          {(["sessions", "reviews"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setPage(1); }}
              className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
              {t === "sessions" ? "Sessions" : "Pantry Deduction Reviews"}
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

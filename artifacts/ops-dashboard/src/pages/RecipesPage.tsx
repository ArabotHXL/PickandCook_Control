import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { Search, CheckCircle, XCircle, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserCreatedRecipeModal } from "@/components/UserCreatedRecipeModal";
import { useToast } from "@/hooks/use-toast";
import { ExportMenu } from "@/components/ExportMenu";
import { SortableHeader } from "@/components/SortableHeader";
import { useSort } from "@/hooks/useSort";

const TIER_BADGE: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-700",
  needs_rewrite: "bg-orange-100 text-orange-700",
  duplicate: "bg-purple-100 text-purple-700",
  unrated: "bg-muted text-muted-foreground",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-destructive/10 text-destructive",
  needs_more_info: "bg-blue-100 text-blue-700",
};

function useRecipes(q: string, tier: string, page: number, sortQs: string) {
  return useQuery({
    queryKey: ["ops", "recipes", q, tier, page, sortQs],
    queryFn: () =>
      apiFetch(
        `/api/ops/recipes?q=${encodeURIComponent(q)}&qualityTier=${tier}&page=${page}&limit=50${sortQs}`
      ).then((r) => r.json()),
  });
}

function useUserRecipes(status: string, page: number, sortQs: string) {
  return useQuery({
    queryKey: ["ops", "user-recipes", status, page, sortQs],
    queryFn: () =>
      apiFetch(
        `/api/ops/recipes/user-created?submissionStatus=${status}&page=${page}&limit=50${sortQs}`
      ).then((r) => r.json()),
  });
}

function useRecipeReports(status: string, page: number) {
  return useQuery({
    queryKey: ["ops", "recipe-reports", status, page],
    queryFn: () => apiFetch(`/api/ops/recipes/reports?status=${status}&page=${page}&limit=50`).then((r) => r.json()),
  });
}

export function RecipesPage() {
  const [tab, setTab] = useState<"catalog" | "user" | "reports">("catalog");
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState("pending");
  const [reportStatus, setReportStatus] = useState("open");
  const [page, setPage] = useState(1);
  const [openUgcId, setOpenUgcId] = useState<string | null>(null);
  const catalogSort = useSort();
  const ugcSort = useSort();
  const qc = useQueryClient();
  const { toast } = useToast();

  const recipesQuery = useRecipes(q, tier, page, catalogSort.qs);
  const userRecipesQuery = useUserRecipes(submissionStatus, page, ugcSort.qs);
  const reportsQuery = useRecipeReports(reportStatus, page);

  const exportPath =
    tab === "catalog"
      ? `/api/ops/recipes?q=${encodeURIComponent(q)}&qualityTier=${tier}&limit=1000${catalogSort.qs}`
      : `/api/ops/recipes/user-created?submissionStatus=${submissionStatus}&limit=1000${ugcSort.qs}`;
  const exportStem =
    tab === "catalog"
      ? `recipes-${new Date().toISOString().slice(0, 10)}`
      : `user-recipes-${new Date().toISOString().slice(0, 10)}`;

  const setQualityMutation = useMutation({
    mutationFn: ({ id, qualityTier }: { id: string; qualityTier: string }) =>
      apiFetch(`/api/ops/recipes/${id}/quality`, { method: "PATCH", body: JSON.stringify({ qualityTier }) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "recipes"] }),
  });

  const decideUserRecipeMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      apiFetch(`/api/ops/recipes/user-created/${id}/decide`, { method: "POST", body: JSON.stringify({ decision }) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "user-recipes"] }),
    onError: (e: Error) =>
      toast({ title: "Decision failed", description: e.message, variant: "destructive" }),
  });

  const totalPages = Math.ceil(
    (tab === "catalog" ? recipesQuery.data?.total : tab === "user" ? userRecipesQuery.data?.total : reportsQuery.data?.total) ?? 0
    / 50
  );

  return (
    <div>
      <PageHeader
        title="Recipe Ops"
        description="Catalog quality, user submissions, reports"
        actions={
          tab !== "reports" ? (
            <ExportMenu path={exportPath} filenameStem={exportStem} testId="button-export-csv" />
          ) : undefined
        }
      />

      <div className="p-6 space-y-4">
        <div className="flex gap-1 border-b border-border">
          {(["catalog", "user", "reports"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setPage(1); }}
              className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "catalog" ? "Catalog" : t === "user" ? "User Submissions" : "Reports"}
            </button>
          ))}
        </div>

        {tab === "catalog" && (
          <>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes…"
                  className="w-full pl-9 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <select value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }}
                className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">All tiers</option>
                <option value="good">Good</option>
                <option value="needs_rewrite">Needs rewrite</option>
                <option value="duplicate">Duplicate</option>
                <option value="unrated">Unrated</option>
              </select>
            </div>
            <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <SortableHeader col="title" active={catalogSort.sort} onChange={(s) => { catalogSort.setSort(s); setPage(1); }} defaultDir="asc">Title</SortableHeader>
                    <SortableHeader col="qualityTier" active={catalogSort.sort} onChange={(s) => { catalogSort.setSort(s); setPage(1); }} defaultDir="asc">Quality</SortableHeader>
                    <SortableHeader col="difficulty" active={catalogSort.sort} onChange={(s) => { catalogSort.setSort(s); setPage(1); }} defaultDir="asc">Difficulty</SortableHeader>
                    <SortableHeader col="estimatedTimeMin" active={catalogSort.sort} onChange={(s) => { catalogSort.setSort(s); setPage(1); }} align="right">Time</SortableHeader>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recipesQuery.isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => <tr key={i}>{Array.from({ length: 5 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
                  ) : (recipesQuery.data?.recipes ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No recipes found</td></tr>
                  ) : (
                    (recipesQuery.data?.recipes ?? []).map((r: { id: string; title: string; qualityTier: string; difficulty: string; estimatedTimeMin: number }) => (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-recipe-${r.id}`}>
                        <td className="px-4 py-3 font-medium text-foreground max-w-sm truncate">
                          <Link
                            href={`/recipes/${r.id}`}
                            className="hover:text-primary hover:underline"
                            data-testid={`link-recipe-${r.id}`}
                          >
                            {r.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", TIER_BADGE[r.qualityTier] ?? "bg-muted")}>{r.qualityTier ?? "unrated"}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{r.difficulty ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">{r.estimatedTimeMin ? `${r.estimatedTimeMin}m` : "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <Link
                              href={`/recipes/${r.id}`}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Open detail"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Link>
                            <select
                              defaultValue=""
                              onChange={(e) => { if (e.target.value) setQualityMutation.mutate({ id: r.id, qualityTier: e.target.value }); }}
                              className="text-xs px-2 py-1 rounded border border-input bg-background focus:outline-none"
                            >
                              <option value="" disabled>Set tier…</option>
                              <option value="good">Good</option>
                              <option value="needs_rewrite">Needs rewrite</option>
                              <option value="duplicate">Duplicate</option>
                              <option value="unrated">Unrated</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "user" && (
          <>
            <div className="flex gap-2">
              {["pending", "approved", "rejected", "needs_more_info"].map((s) => (
                <button key={s} onClick={() => { setSubmissionStatus(s); setPage(1); }}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    submissionStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  )}>
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>
            <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <SortableHeader col="title" active={ugcSort.sort} onChange={(s) => { ugcSort.setSort(s); setPage(1); }} defaultDir="asc">Title</SortableHeader>
                    <SortableHeader col="userEmail" active={ugcSort.sort} onChange={(s) => { ugcSort.setSort(s); setPage(1); }} defaultDir="asc">Author</SortableHeader>
                    <SortableHeader col="submissionStatus" active={ugcSort.sort} onChange={(s) => { ugcSort.setSort(s); setPage(1); }} defaultDir="asc">Status</SortableHeader>
                    <SortableHeader col="reportCount" active={ugcSort.sort} onChange={(s) => { ugcSort.setSort(s); setPage(1); }} align="right">Reports</SortableHeader>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {userRecipesQuery.isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => <tr key={i}>{Array.from({ length: 5 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
                  ) : (userRecipesQuery.data?.recipes ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No recipes</td></tr>
                  ) : (
                    (userRecipesQuery.data?.recipes ?? []).map((r: { id: string; title: string; userEmail: string; submissionStatus: string; reportCount: number }) => (
                      <tr
                        key={r.id}
                        onClick={() => setOpenUgcId(r.id)}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        data-testid={`row-ugc-${r.id}`}
                      >
                        <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">{r.title}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{r.userEmail ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", STATUS_BADGE[r.submissionStatus] ?? "bg-muted")}>{r.submissionStatus}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.reportCount ?? 0}</td>
                        <td className="px-4 py-3">
                          {r.submissionStatus === "pending" && (
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => decideUserRecipeMutation.mutate({ id: r.id, decision: "approved" })} className="p-1.5 rounded hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600 transition-colors">
                                <CheckCircle className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => decideUserRecipeMutation.mutate({ id: r.id, decision: "rejected" })} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "reports" && (
          <>
            <div className="flex gap-2">
              {["open", "resolved", "dismissed"].map((s) => (
                <button key={s} onClick={() => { setReportStatus(s); setPage(1); }}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    reportStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"
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
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reason</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reporter</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reportsQuery.isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => <tr key={i}>{Array.from({ length: 5 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
                  ) : (reportsQuery.data?.reports ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No reports</td></tr>
                  ) : (
                    (reportsQuery.data?.reports ?? []).map((r: { id: string; recipeTitle: string; reason: string; reporterEmail: string; createdAt: string; status: string }) => (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">{r.recipeTitle ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.reason}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{r.reporterEmail ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", STATUS_BADGE[r.status] ?? "bg-muted")}>{r.status}</span>
                        </td>
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
            <p className="text-muted-foreground">Page {page}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
      <UserCreatedRecipeModal recipeId={openUgcId} onClose={() => setOpenUgcId(null)} />
    </div>
  );
}

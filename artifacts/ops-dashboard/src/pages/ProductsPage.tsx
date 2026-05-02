import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { Search, CheckCircle, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function useProducts(q: string, issue: string, page: number) {
  return useQuery({
    queryKey: ["ops", "products", q, issue, page],
    queryFn: () => apiFetch(`/api/ops/products?q=${encodeURIComponent(q)}&issue=${issue}&page=${page}&limit=50`).then((r) => r.json()),
  });
}

function useUnknownBarcodes(page: number) {
  return useQuery({
    queryKey: ["ops", "barcodes", "unknown", page],
    queryFn: () => apiFetch(`/api/ops/products/barcodes/unknown?page=${page}&limit=50`).then((r) => r.json()),
  });
}

function useProposals(status: string, page: number) {
  return useQuery({
    queryKey: ["ops", "proposals", status, page],
    queryFn: () => apiFetch(`/api/ops/products/proposals?status=${status}&page=${page}&limit=50`).then((r) => r.json()),
  });
}

const ISSUE_COLORS: Record<string, string> = {
  missing_brand: "bg-orange-100 text-orange-700",
  missing_category: "bg-yellow-100 text-yellow-700",
  missing_nutrition: "bg-blue-100 text-blue-700",
};

export function ProductsPage() {
  const [tab, setTab] = useState<"products" | "barcodes" | "proposals">("products");
  const [q, setQ] = useState("");
  const [issue, setIssue] = useState("all");
  const [page, setPage] = useState(1);
  const [proposalStatus, setProposalStatus] = useState("pending");
  const qc = useQueryClient();

  const productsQuery = useProducts(q, issue, page);
  const barcodesQuery = useUnknownBarcodes(page);
  const proposalsQuery = useProposals(proposalStatus, page);

  const decideMutation = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: string; note?: string }) =>
      apiFetch(`/api/ops/products/proposals/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, note }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "proposals"] }),
  });

  const tabs = ["products", "barcodes", "proposals"] as const;

  const activeQuery =
    tab === "products" ? productsQuery : tab === "barcodes" ? barcodesQuery : proposalsQuery;
  const activeData = activeQuery.data as { total?: number; limit?: number } | undefined;
  const totalPages = Math.max(
    1,
    Math.ceil((activeData?.total ?? 0) / (activeData?.limit ?? 50))
  );

  return (
    <div>
      <PageHeader title="Products & Barcodes" description="Product quality, unknown barcodes, and edit proposals" />

      <div className="p-6 space-y-4">
        <div className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setPage(1); }}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "products" ? "Products" : t === "barcodes" ? "Unknown Barcodes" : "Edit Proposals"}
            </button>
          ))}
        </div>

        {tab === "products" && (
          <>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search products…"
                  className="w-full pl-9 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <select
                value={issue}
                onChange={(e) => { setIssue(e.target.value); setPage(1); }}
                className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All issues</option>
                <option value="missing_brand">Missing brand</option>
                <option value="missing_category">Missing category</option>
                <option value="missing_nutrition">Missing nutrition</option>
              </select>
            </div>

            <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Brand</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Barcodes</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {productsQuery.isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 5 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>
                    ))
                  ) : (productsQuery.data?.products ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No products found</td></tr>
                  ) : (
                    (productsQuery.data?.products ?? []).map((p: { id: string; name: string; brand: string | null; department: string | null; barcodeCount: number; issues: string[] }) => (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.brand ?? <span className="text-destructive/70 italic">missing</span>}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.department ?? <span className="text-destructive/70 italic">missing</span>}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{p.barcodeCount}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {p.issues.map((iss: string) => (
                              <span key={iss} className={cn("px-1.5 py-0.5 rounded text-xs font-medium", ISSUE_COLORS[iss] ?? "bg-muted")}>
                                {iss.replace("missing_", "")}
                              </span>
                            ))}
                            {p.issues.length === 0 && <span className="text-emerald-600 text-xs">✓ OK</span>}
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

        {tab === "barcodes" && (
          <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Barcode</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Scans</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {barcodesQuery.isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => <tr key={i}>{Array.from({ length: 3 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
                ) : (barcodesQuery.data?.barcodes ?? []).length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No unknown barcodes</td></tr>
                ) : (
                  (barcodesQuery.data?.barcodes ?? []).map((b: { barcode: string; scanCount: number; lastScannedAt: string }) => (
                    <tr key={b.barcode} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-foreground">{b.barcode}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{b.scanCount}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{b.lastScannedAt ? new Date(b.lastScannedAt).toLocaleString() : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "proposals" && (
          <>
            <div className="flex gap-2">
              {["pending", "approved", "rejected", "needs_research"].map((s) => (
                <button
                  key={s}
                  onClick={() => { setProposalStatus(s); setPage(1); }}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    proposalStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  )}
                >
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>
            <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Object</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Risk</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created by</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {proposalsQuery.isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => <tr key={i}>{Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
                  ) : (proposalsQuery.data?.proposals ?? []).length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No proposals</td></tr>
                  ) : (
                    (proposalsQuery.data?.proposals ?? []).map((p: { id: string; proposalType: string; objectType: string; objectId: string; riskLevel: string; creatorEmail: string; status: string }) => (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{p.proposalType}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{p.objectType} <span className="font-mono">{p.objectId?.slice(0, 8)}</span></td>
                        <td className="px-4 py-3">
                          <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium",
                            p.riskLevel === "high" ? "bg-destructive/10 text-destructive" :
                            p.riskLevel === "medium" ? "bg-orange-100 text-orange-700" :
                            "bg-muted text-muted-foreground"
                          )}>
                            {p.riskLevel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{p.creatorEmail ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{p.status}</td>
                        <td className="px-4 py-3">
                          {p.status === "pending" && (
                            <div className="flex gap-1">
                              <button onClick={() => decideMutation.mutate({ id: p.id, decision: "approved" })} className="p-1.5 rounded hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600 transition-colors">
                                <CheckCircle className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => decideMutation.mutate({ id: p.id, decision: "rejected" })} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
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

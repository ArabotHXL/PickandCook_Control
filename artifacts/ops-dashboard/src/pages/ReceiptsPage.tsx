import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Receipt, CheckCircle, AlertTriangle, DollarSign, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExportMenu } from "@/components/ExportMenu";
import { SortableHeader } from "@/components/SortableHeader";
import { useSort } from "@/hooks/useSort";

function useReceipts(status: string, page: number, sortQs: string) {
  return useQuery({
    queryKey: ["ops", "receipts", status, page, sortQs],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (status) params.set("status", status);
      return apiFetch(`/api/ops/receipts?${params.toString()}${sortQs}`).then((r) => r.json());
    },
  });
}

function useReceiptDetail(receiptId: string | null) {
  return useQuery({
    queryKey: ["ops", "receipts", "detail", receiptId],
    queryFn: () => apiFetch(`/api/ops/receipts/${receiptId}`).then((r) => r.json()),
    enabled: receiptId !== null,
  });
}

const STATUS_BADGE: Record<string, string> = {
  uploaded: "bg-blue-100 text-blue-700",
  processing: "bg-yellow-100 text-yellow-700",
  extracting: "bg-yellow-100 text-yellow-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-destructive/10 text-destructive",
  error: "bg-destructive/10 text-destructive",
};

const BAND_BADGE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-orange-100 text-orange-700",
};

export function ReceiptsPage() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { sort, setSort, qs: sortQs } = useSort();

  const exportPath = (() => {
    const p = new URLSearchParams({ limit: "5000" });
    if (status) p.set("status", status);
    return `/api/ops/receipts?${p.toString()}${sortQs}`;
  })();
  const exportStem = `receipts-${new Date().toISOString().slice(0, 10)}`;

  const { data, isLoading } = useReceipts(status, page, sortQs);
  const detailQuery = useReceiptDetail(selectedId);

  const receipts = data?.receipts ?? [];
  const summary = data?.summary;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div>
      <PageHeader
        title="Receipts"
        description="OCR pipeline and item extraction review"
        actions={<ExportMenu path={exportPath} filenameStem={exportStem} testId="button-export-csv" />}
      />

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Total Receipts" value={summary?.total ?? 0} icon={<Receipt className="w-4 h-4" />} />
          <StatCard label="Processing" value={(summary?.uploaded ?? 0) + (summary?.processing ?? 0)} icon={<Receipt className="w-4 h-4" />} />
          <StatCard label="Completed" value={summary?.completed ?? 0} icon={<CheckCircle className="w-4 h-4" />} />
          <StatCard label="Failed" value={summary?.failed ?? 0} icon={<AlertTriangle className="w-4 h-4" />} />
          <StatCard label="LLM Cost (all-time)" value={`$${(summary?.totalLlmCostUsd ?? 0).toFixed(4)}`} icon={<DollarSign className="w-4 h-4" />} />
        </div>

        <div className="flex gap-2">
          {["", "uploaded", "processing", "completed", "failed"].map((s) => (
            <button key={s} onClick={() => { setStatus(s); setPage(1); }}
              className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                status === s ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"
              )}>
              {s === "" ? "All" : s}
            </button>
          ))}
        </div>

        <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <SortableHeader col="storeName" active={sort} onChange={(s) => { setSort(s); setPage(1); }} defaultDir="asc">Store</SortableHeader>
                <SortableHeader col="userEmail" active={sort} onChange={(s) => { setSort(s); setPage(1); }} defaultDir="asc">User</SortableHeader>
                <SortableHeader col="status" active={sort} onChange={(s) => { setSort(s); setPage(1); }} defaultDir="asc">Status</SortableHeader>
                <SortableHeader col="itemCount" active={sort} onChange={(s) => { setSort(s); setPage(1); }} align="right">Items</SortableHeader>
                <SortableHeader col="totalCents" active={sort} onChange={(s) => { setSort(s); setPage(1); }} align="right">Total</SortableHeader>
                <SortableHeader col="llmCostUsd" active={sort} onChange={(s) => { setSort(s); setPage(1); }} align="right">LLM Cost</SortableHeader>
                <SortableHeader col="llmLatencyMs" active={sort} onChange={(s) => { setSort(s); setPage(1); }} align="right">Latency</SortableHeader>
                <SortableHeader col="createdAt" active={sort} onChange={(s) => { setSort(s); setPage(1); }}>Created</SortableHeader>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <tr key={i}>{Array.from({ length: 9 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
              ) : receipts.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No receipts</td></tr>
              ) : (
                receipts.map((r: { id: string; storeName: string | null; userEmail: string | null; userId: string; status: string; itemCount: number; totalCents: number | null; llmCostUsd: number | null; llmLatencyMs: number | null; createdAt: string; errorMessage: string | null }) => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{r.storeName ?? <span className="text-muted-foreground italic">unknown</span>}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.userEmail ?? <span className="font-mono">{r.userId.slice(0, 8)}</span>}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", STATUS_BADGE[r.status] ?? "bg-muted")}>
                        {r.status}
                      </span>
                      {r.errorMessage && <p className="text-xs text-destructive mt-0.5 max-w-xs truncate">{r.errorMessage}</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.itemCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.totalCents != null ? `$${(r.totalCents / 100).toFixed(2)}` : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{r.llmCostUsd != null ? `$${r.llmCostUsd.toFixed(4)}` : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{r.llmLatencyMs ? `${r.llmLatencyMs}ms` : "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setSelectedId(r.id)} className="text-xs text-primary hover:underline">View</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">Page {page} of {totalPages} • {total.toLocaleString()} receipts</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {selectedId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={() => setSelectedId(null)}>
          <div className="bg-card border border-card-border rounded-lg shadow-xl max-w-4xl w-full max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card">
              <h2 className="text-lg font-semibold">Receipt Detail</h2>
              <button onClick={() => setSelectedId(null)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              {detailQuery.isLoading ? (
                <div className="h-40 bg-muted animate-pulse rounded" />
              ) : detailQuery.data ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><p className="text-xs text-muted-foreground">Store</p><p className="font-medium">{detailQuery.data.receipt.storeName ?? "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Total</p><p className="font-medium tabular-nums">{detailQuery.data.receipt.totalCents != null ? `$${(detailQuery.data.receipt.totalCents / 100).toFixed(2)}` : "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Status</p><p className="font-medium">{detailQuery.data.receipt.status}</p></div>
                    <div><p className="text-xs text-muted-foreground">User</p><p className="font-medium text-xs">{detailQuery.data.receipt.userEmail ?? detailQuery.data.receipt.userId?.slice(0, 8)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Model</p><p className="font-medium text-xs">{detailQuery.data.receipt.llmModel ?? "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">LLM Cost</p><p className="font-medium tabular-nums text-xs">${(detailQuery.data.receipt.llmCostUsd ?? 0).toFixed(4)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Tokens (in/out)</p><p className="font-medium tabular-nums text-xs">{detailQuery.data.receipt.llmInputTokens ?? "—"} / {detailQuery.data.receipt.llmOutputTokens ?? "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Latency</p><p className="font-medium tabular-nums text-xs">{detailQuery.data.receipt.llmLatencyMs ? `${detailQuery.data.receipt.llmLatencyMs}ms` : "—"}</p></div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">Items ({detailQuery.data.items.length})</h3>
                    <div className="bg-muted/30 border border-border rounded-md overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/60 border-b border-border">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium">Raw name</th>
                            <th className="text-right px-3 py-2 font-medium">Qty</th>
                            <th className="text-left px-3 py-2 font-medium">Normalized</th>
                            <th className="text-left px-3 py-2 font-medium">Match</th>
                            <th className="text-left px-3 py-2 font-medium">Confidence</th>
                            <th className="text-right px-3 py-2 font-medium">Price</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {detailQuery.data.items.length === 0 ? (
                            <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">No items extracted</td></tr>
                          ) : detailQuery.data.items.map((it: { id: string; rawName: string; rawQty: number | null; rawUnit: string | null; rawPriceCents: number | null; normalizedName: string | null; proposedProductId: string | null; proposedConfidence: number | null; proposedBand: string | null }) => (
                            <tr key={it.id}>
                              <td className="px-3 py-2 font-medium">{it.rawName}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{it.rawQty ?? "—"} {it.rawUnit ?? ""}</td>
                              <td className="px-3 py-2 text-muted-foreground">{it.normalizedName ?? "—"}</td>
                              <td className="px-3 py-2 font-mono text-xs">{it.proposedProductId ?? "—"}</td>
                              <td className="px-3 py-2">
                                {it.proposedBand ? (
                                  <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", BAND_BADGE[it.proposedBand] ?? "bg-muted")}>
                                    {it.proposedBand}{it.proposedConfidence != null ? ` (${(it.proposedConfidence * 100).toFixed(0)}%)` : ""}
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{it.rawPriceCents != null ? `$${(it.rawPriceCents / 100).toFixed(2)}` : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {detailQuery.data.receipt.rawOcrText && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Raw OCR Text</h3>
                      <pre className="bg-muted/30 border border-border rounded-md p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap">{detailQuery.data.receipt.rawOcrText}</pre>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">Receipt not found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

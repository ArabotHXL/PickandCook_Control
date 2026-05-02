import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { CheckCircle, XCircle, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-destructive/10 text-destructive",
  needs_more_info: "bg-blue-100 text-blue-700",
  escalated: "bg-purple-100 text-purple-700",
};

function useModeration(contentType: string, status: string, page: number) {
  return useQuery({
    queryKey: ["ops", "moderation", contentType, status, page],
    queryFn: () =>
      apiFetch(`/api/ops/moderation?status=${status}${contentType ? `&contentType=${contentType}` : ""}&page=${page}&limit=50`).then((r) => r.json()),
  });
}

export function ModerationPage() {
  const [contentType, setContentType] = useState("");
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const qc = useQueryClient();

  const { data, isLoading } = useModeration(contentType, status, page);

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      apiFetch(`/api/ops/moderation/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "moderation"] }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <PageHeader title="Moderation Queue" description={`${total.toLocaleString()} items`} />

      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-2">
            {["pending", "approved", "rejected", "escalated"].map((s) => (
              <button
                key={s}
                onClick={() => { setStatus(s); setPage(1); }}
                className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  status === s ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <select
            value={contentType}
            onChange={(e) => { setContentType(e.target.value); setPage(1); }}
            className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All types</option>
            <option value="recipe">Recipe</option>
            <option value="user">User</option>
            <option value="comment">Comment</option>
          </select>
        </div>

        <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reason</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Details</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reporter</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No items in queue</td></tr>
              ) : (
                items.map((item: { id: string; contentType: string; reason: string; details: string | null; reporterEmail: string; createdAt: string; status: string }) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="px-1.5 py-0.5 rounded bg-muted text-xs font-medium">{item.contentType}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{item.reason}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">{item.details ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{item.reporterEmail ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", STATUS_BADGE[item.status] ?? "bg-muted")}>{item.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {item.status === "pending" && (
                        <div className="flex gap-1">
                          <button onClick={() => decideMutation.mutate({ id: item.id, decision: "approved" })} title="Approve" className="p-1.5 rounded hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600 transition-colors">
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => decideMutation.mutate({ id: item.id, decision: "rejected" })} title="Reject" className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => decideMutation.mutate({ id: item.id, decision: "escalated" })} title="Escalate" className="p-1.5 rounded hover:bg-purple-50 text-muted-foreground hover:text-purple-600 transition-colors">
                            <AlertTriangle className="w-3.5 h-3.5" />
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

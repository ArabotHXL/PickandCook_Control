import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { CheckCircle, XCircle, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-destructive/10 text-destructive",
  needs_more_info: "bg-blue-100 text-blue-700",
  escalated: "bg-purple-100 text-purple-700",
};

interface ModerationItem {
  id: string;
  contentType: string;
  reason: string;
  details: string | null;
  reporterEmail: string;
  createdAt: string;
  status: string;
}

function useModeration(contentType: string, status: string, page: number) {
  return useQuery<{ items: ModerationItem[]; total: number }>({
    queryKey: ["ops", "moderation", contentType, status, page],
    queryFn: () =>
      apiFetch(`/api/ops/moderation?status=${status}${contentType ? `&contentType=${contentType}` : ""}&page=${page}&limit=50`).then((r) => r.json()),
  });
}

export function ModerationPage() {
  const [contentType, setContentType] = useState("");
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useModeration(contentType, status, page);

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      apiFetch(`/api/ops/moderation/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "moderation"] }),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, decision }: { ids: string[]; decision: string }) =>
      apiFetch(`/api/ops/moderation/bulk-decide`, {
        method: "POST",
        body: JSON.stringify({ ids, decision }),
      }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      }),
    onSuccess: (result: { updated: number }) => {
      toast({ title: "Bulk decision applied", description: `${result.updated} item(s) updated.` });
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["ops", "moderation"] });
    },
    onError: (e: Error) =>
      toast({ title: "Bulk decision failed", description: e.message, variant: "destructive" }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  const visiblePendingIds = useMemo(
    () => items.filter((i) => i.status === "pending").map((i) => i.id),
    [items]
  );
  const allVisibleSelected = visiblePendingIds.length > 0 && visiblePendingIds.every((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visiblePendingIds.forEach((id) => next.delete(id));
      } else {
        visiblePendingIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function bulkDecide(decision: string) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (ids.length > 100) {
      toast({ title: "Too many items", description: "Bulk operations are capped at 100.", variant: "destructive" });
      return;
    }
    bulkMutation.mutate({ ids, decision });
  }

  return (
    <div>
      <PageHeader title="Moderation Queue" description={`${total.toLocaleString()} items`} />

      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-2">
            {["pending", "approved", "rejected", "escalated"].map((s) => (
              <button
                key={s}
                onClick={() => { setStatus(s); setPage(1); setSelected(new Set()); }}
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
            onChange={(e) => { setContentType(e.target.value); setPage(1); setSelected(new Set()); }}
            className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All types</option>
            <option value="recipe">Recipe</option>
            <option value="user">User</option>
            <option value="comment">Comment</option>
          </select>
        </div>

        {selected.size > 0 && status === "pending" && (
          <div
            data-testid="bulk-action-bar"
            className="bg-primary/5 border border-primary/30 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3"
          >
            <p className="text-sm font-medium text-foreground">
              {selected.size} selected
              {selected.size > 100 && <span className="text-destructive ml-2">(max 100 per batch)</span>}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => bulkDecide("approved")}
                disabled={bulkMutation.isPending || selected.size > 100}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                data-testid="bulk-approve"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Approve
              </button>
              <button
                onClick={() => bulkDecide("rejected")}
                disabled={bulkMutation.isPending || selected.size > 100}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                data-testid="bulk-reject"
              >
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
              <button
                onClick={() => bulkDecide("escalated")}
                disabled={bulkMutation.isPending || selected.size > 100}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                data-testid="bulk-escalate"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Escalate
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-3 py-3 w-10">
                  {status === "pending" && (
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      disabled={visiblePendingIds.length === 0}
                      className="cursor-pointer"
                      data-testid="bulk-select-all"
                    />
                  )}
                </th>
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
                  <tr key={i}>{Array.from({ length: 8 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No items in queue</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-moderation-${item.id}`}>
                    <td className="px-3 py-3">
                      {item.status === "pending" && (
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleOne(item.id)}
                          className="cursor-pointer"
                          data-testid={`bulk-select-${item.id}`}
                        />
                      )}
                    </td>
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
              <button onClick={() => { setPage((p) => Math.max(1, p - 1)); setSelected(new Set()); }} disabled={page === 1} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); setSelected(new Set()); }} disabled={page >= totalPages} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

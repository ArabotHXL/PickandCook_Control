import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { ChevronLeft, ChevronRight } from "lucide-react";

function useAuditLog(adminUserId: string, targetType: string, actionType: string, page: number) {
  return useQuery({
    queryKey: ["ops", "audit", adminUserId, targetType, actionType, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (adminUserId) params.set("adminUserId", adminUserId);
      if (targetType) params.set("targetType", targetType);
      if (actionType) params.set("actionType", actionType);
      return apiFetch(`/api/ops/audit?${params.toString()}`).then((r) => r.json());
    },
  });
}

const TARGET_TYPES = ["user", "recipe", "user_recipe", "pantry_item", "edit_proposal", "abuse_report"];

export function AuditLogPage() {
  const [adminUserId, setAdminUserId] = useState("");
  const [targetType, setTargetType] = useState("");
  const [actionType, setActionType] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAuditLog(adminUserId, targetType, actionType, page);

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <PageHeader title="Audit Log" description={`${total.toLocaleString()} actions recorded`} />

      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={adminUserId}
            onChange={(e) => { setAdminUserId(e.target.value); setPage(1); }}
            placeholder="Admin user ID…"
            className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-48"
          />
          <select
            value={targetType}
            onChange={(e) => { setTargetType(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All target types</option>
            {TARGET_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
          <input
            type="text"
            value={actionType}
            onChange={(e) => { setActionType(e.target.value); setPage(1); }}
            placeholder="Action type…"
            className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-40"
          />
        </div>

        <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Admin</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Target</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Note</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>
                ))
              ) : entries.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No audit entries found</td></tr>
              ) : (
                entries.map((entry: {
                  id: string;
                  createdAt: string;
                  adminEmail: string;
                  actionType: string;
                  targetType: string;
                  targetId: string | null;
                  decisionNote: string | null;
                  oldValue: unknown;
                  newValue: unknown;
                }) => (
                  <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{entry.adminEmail ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium font-mono">
                        {entry.actionType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      <span className="font-medium text-foreground">{entry.targetType}</span>
                      {entry.targetId && <span className="ml-1 font-mono opacity-60">{entry.targetId.slice(0, 8)}</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">{entry.decisionNote ?? "—"}</td>
                    <td className="px-4 py-3">
                      {Boolean(entry.oldValue || entry.newValue) && (
                        <div className="flex gap-2 text-xs font-mono">
                          {Boolean(entry.oldValue) && (
                            <span className="text-destructive">{JSON.stringify(entry.oldValue).slice(0, 40)}</span>
                          )}
                          {Boolean(entry.newValue) && (
                            <span className="text-emerald-600">→ {JSON.stringify(entry.newValue).slice(0, 40)}</span>
                          )}
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
            <p className="text-muted-foreground">Page {page} of {totalPages} • {total.toLocaleString()} entries</p>
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

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function useTemplates() {
  return useQuery({
    queryKey: ["ops", "notifications", "templates"],
    queryFn: () => apiFetch("/api/ops/notifications/templates").then((r) => r.json()),
  });
}

function useNotificationLog(userId: string, category: string, page: number) {
  return useQuery({
    queryKey: ["ops", "notifications", "log", userId, category, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (userId) params.set("userId", userId);
      if (category) params.set("category", category);
      return apiFetch(`/api/ops/notifications/log?${params.toString()}`).then((r) => r.json());
    },
  });
}

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-destructive/10 text-destructive",
  pending: "bg-yellow-100 text-yellow-700",
  skipped: "bg-muted text-muted-foreground",
};

export function NotificationsPage() {
  const [tab, setTab] = useState<"templates" | "log">("log");
  const [userId, setUserId] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  const templatesQuery = useTemplates();
  const logQuery = useNotificationLog(userId, category, page);

  const templates = templatesQuery.data?.templates ?? [];
  const logs = logQuery.data?.logs ?? [];
  const total = logQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <PageHeader title="Notifications" description="Templates and delivery log" />

      <div className="p-6 space-y-4">
        <div className="flex gap-1 border-b border-border">
          {(["log", "templates"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "log" ? "Delivery Log" : "Templates"}
            </button>
          ))}
        </div>

        {tab === "templates" && (
          <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Stage</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Body</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {templatesQuery.isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => <tr key={i}>{Array.from({ length: 4 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
                ) : templates.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No templates found</td></tr>
                ) : (
                  templates.map((t: { id: string; stage: string; title: string; body: string; enabled: boolean }) => (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{t.stage ?? "—"}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{t.title}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">{t.body}</td>
                      <td className="px-4 py-3">
                        <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium",
                          t.enabled ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                        )}>
                          {t.enabled ? "enabled" : "disabled"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "log" && (
          <>
            <div className="flex items-center gap-3">
              <input type="text" value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }} placeholder="Filter by user ID…"
                className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-48" />
              <input type="text" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} placeholder="Category…"
                className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-36" />
            </div>

            <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sent At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logQuery.isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => <tr key={i}>{Array.from({ length: 5 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
                  ) : logs.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No notifications found</td></tr>
                  ) : (
                    logs.map((l: { id: string; title: string; category: string; userId: string; status: string; sentAt: string }) => (
                      <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">{l.title}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{l.category ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{l.userId?.slice(0, 8) ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", STATUS_BADGE[l.status] ?? "bg-muted")}>{l.status}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{l.sentAt ? new Date(l.sentAt).toLocaleString() : "—"}</td>
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
          </>
        )}
      </div>
    </div>
  );
}

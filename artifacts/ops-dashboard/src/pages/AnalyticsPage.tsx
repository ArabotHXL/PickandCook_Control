import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function useAnalyticsSummary(days: number) {
  return useQuery({
    queryKey: ["ops", "analytics", "summary", days],
    queryFn: () => apiFetch(`/api/ops/analytics/summary?days=${days}`).then((r) => r.json()),
  });
}

function useAnalyticsEvents(event: string, view: string, userId: string, from: string, to: string, page: number) {
  return useQuery({
    queryKey: ["ops", "analytics", "events", event, view, userId, from, to, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (event) params.set("event", event);
      if (view && view !== "all") params.set("view", view);
      if (userId) params.set("userId", userId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("page", String(page));
      params.set("limit", "100");
      return apiFetch(`/api/ops/analytics/events?${params.toString()}`).then((r) => r.json());
    },
  });
}

const VIEWS = ["all", "onboarding", "pantry", "recommendation", "shopping", "cook", "reports"];

export function AnalyticsPage() {
  const [days, setDays] = useState(7);
  const [view, setView] = useState("all");
  const [event, setEvent] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const summaryQuery = useAnalyticsSummary(days);
  const eventsQuery = useAnalyticsEvents(event, view, userId, from, to, page);

  const summary = summaryQuery.data;
  const events = eventsQuery.data?.events ?? [];
  const total = eventsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / 100);

  return (
    <div>
      <PageHeader title="Analytics Explorer" description="Event data and user behavior analysis" />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 bg-card border border-card-border rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Top Events</h3>
              <div className="flex gap-2">
                {[7, 14, 30].map((d) => (
                  <button key={d} onClick={() => setDays(d)}
                    className={cn("px-2.5 py-1 rounded text-xs font-medium transition-colors",
                      days === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                    )}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            {summaryQuery.isLoading ? (
              <div className="h-48 bg-muted rounded animate-pulse" />
            ) : (summary?.topEvents ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No events</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={(summary?.topEvents ?? []).slice(0, 12)} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="event" tick={{ fontSize: 10 }} width={160} />
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Bar dataKey="count" fill="hsl(224 76% 57%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
            <h3 className="text-sm font-semibold mb-4">Summary ({days}d)</h3>
            {summaryQuery.isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">Total Events</p>
                  <p className="text-2xl font-bold tabular-nums">{(summary?.totalEvents ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unique Users</p>
                  <p className="text-2xl font-bold tabular-nums">{(summary?.uniqueUsers ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg events/user</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {summary?.uniqueUsers > 0
                      ? Math.round(summary.totalEvents / summary.uniqueUsers).toLocaleString()
                      : "—"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {VIEWS.map((v) => (
                <button key={v} onClick={() => { setView(v); setPage(1); }}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    view === v ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  )}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input type="text" value={event} onChange={(e) => setEvent(e.target.value)} placeholder="Event name…"
              className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-44" />
            <input type="text" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID…"
              className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-44" />
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            <span className="text-muted-foreground text-sm">to</span>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }}
              className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Event</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Properties</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {eventsQuery.isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => <tr key={i}>{Array.from({ length: 4 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
                ) : events.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No events found</td></tr>
                ) : (
                  events.map((e: { id: string; event: string; userId: string | null; properties: Record<string, unknown>; createdAt: string }) => (
                    <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{e.event}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{e.userId?.slice(0, 8) ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate font-mono">
                        {e.properties ? JSON.stringify(e.properties).slice(0, 80) : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {e.createdAt ? new Date(e.createdAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <p className="text-muted-foreground">Page {page} of {totalPages} • {total.toLocaleString()} events</p>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

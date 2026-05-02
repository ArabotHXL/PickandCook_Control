import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebounced } from "@/hooks/useDebounced";

interface AnalyticsSummary {
  topEvents: Array<{ event: string; count: number }>;
  totalEvents: number;
  uniqueUsers: number;
  days: number;
}

interface AnalyticsEvent {
  id: string;
  event: string;
  userId: string | null;
  sessionId: string | null;
  properties: Record<string, unknown> | null;
  createdAt: string;
}

interface AnalyticsEventsResponse {
  events: AnalyticsEvent[];
  total: number;
  page: number;
  limit: number;
}

interface SearchSummaryResponse {
  days: number;
  totals: { total: number; uniqueUsers: number; zeroResults: number; zeroResultRate: number };
  byType: Array<{ searchType: string; count: number; avgResults: number; avgDurationMs: number }>;
  topQueries: Array<{ query: string; searchType: string; count: number; avgResults: number }>;
  zeroResultQueries?: Array<{ query: string; searchType: string; count: number }>;
}

interface RecsysSummaryResponse {
  days: number;
  totals: { events: number; performanceLogs: number; uniqueUsers: number };
  bySurface: Array<{ surface: string; count: number }>;
  byEventType: Array<{ eventType: string; count: number }>;
  byAlgoVersion: Array<{ algoVersion: string; count: number }>;
  performanceBySection: Array<{ section: string; action: string; count: number }>;
}

function useAnalyticsSummary(days: number) {
  return useQuery<AnalyticsSummary>({
    queryKey: ["ops", "analytics", "summary", days],
    queryFn: () => apiFetch(`/api/ops/analytics/summary?days=${days}`).then((r) => r.json()),
  });
}

function useAnalyticsEvents(
  days: number,
  event: string,
  view: string,
  userId: string,
  from: string,
  to: string,
  page: number,
  enabled: boolean,
) {
  return useQuery<AnalyticsEventsResponse>({
    queryKey: ["ops", "analytics", "events", days, event, view, userId, from, to, page],
    enabled,
    queryFn: () => {
      const params = new URLSearchParams();
      if (event) params.set("event", event);
      if (view && view !== "all") params.set("view", view);
      if (userId) params.set("userId", userId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      // Only apply rolling-window when explicit dates aren't set; the backend
      // honours from/to first regardless, but sending `days` here keeps the
      // events table in sync with the chart at top.
      if (!from && !to) params.set("days", String(days));
      params.set("page", String(page));
      params.set("limit", "100");
      return apiFetch(`/api/ops/analytics/events?${params.toString()}`).then((r) => r.json());
    },
  });
}

function useSearchSummary(days: number, enabled: boolean) {
  return useQuery<SearchSummaryResponse>({
    queryKey: ["ops", "analytics", "search", days],
    enabled,
    queryFn: () => apiFetch(`/api/ops/analytics/search?days=${days}`).then((r) => r.json()),
  });
}

function useRecsysSummary(days: number, enabled: boolean) {
  return useQuery<RecsysSummaryResponse>({
    queryKey: ["ops", "analytics", "recsys", days],
    enabled,
    queryFn: () => apiFetch(`/api/ops/analytics/recsys?days=${days}`).then((r) => r.json()),
  });
}

const VIEWS = ["all", "onboarding", "pantry", "recommendation", "shopping", "cook", "reports"];

export function AnalyticsPage() {
  const [tab, setTab] = useState<"events" | "search" | "recsys">("events");
  const [days, setDaysRaw] = useState(30);
  const [view, setViewRaw] = useState("all");
  const [event, setEvent] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFromRaw] = useState("");
  const [to, setToRaw] = useState("");
  const [page, setPage] = useState(1);

  // Any filter change must reset to page 1; collect helpers so we never forget.
  const setDays = (d: number) => { setDaysRaw(d); setPage(1); };
  const setView = (v: string) => { setViewRaw(v); setPage(1); };
  const setFrom = (v: string) => { setFromRaw(v); setPage(1); };
  const setTo = (v: string) => { setToRaw(v); setPage(1); };

  // Debounce free-text inputs so we don't fire a query on every keystroke.
  // The debounced value is what feeds the query key — page reset still happens
  // immediately when the user types, so the moment the new query fires we're
  // already on page 1.
  const debouncedEvent = useDebounced(event, 300);
  const debouncedUserId = useDebounced(userId, 300);
  const handleEventChange = (v: string) => { setEvent(v); setPage(1); };
  const handleUserIdChange = (v: string) => { setUserId(v); setPage(1); };

  const handleTab = (t: "events" | "search" | "recsys") => {
    setTab(t);
    setPage(1);
  };

  const summaryQuery = useAnalyticsSummary(days);
  const eventsQuery = useAnalyticsEvents(
    days,
    debouncedEvent,
    view,
    debouncedUserId,
    from,
    to,
    page,
    tab === "events",
  );
  const searchQuery = useSearchSummary(days, tab === "search");
  const recsysQuery = useRecsysSummary(days, tab === "recsys");

  const summary = summaryQuery.data;
  const events = eventsQuery.data?.events ?? [];
  const total = eventsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 100));

  return (
    <div>
      <PageHeader title="Analytics Explorer" description="Event data, search, and recommendations" />

      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-1 border-b border-border">
            {(["events", "search", "recsys"] as const).map((t) => (
              <button key={t} onClick={() => handleTab(t)}
                data-testid={`tab-analytics-${t}`}
                className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}>
                {t === "events" ? "Events" : t === "search" ? "Search" : "Recommendations"}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {[7, 14, 30].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                data-testid={`button-days-${d}`}
                className={cn("px-2.5 py-1 rounded text-xs font-medium transition-colors",
                  days === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                )}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {tab === "events" && (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2 bg-card border border-card-border rounded-lg p-5 shadow-sm">
                <h3 className="text-sm font-semibold mb-4">Top Events</h3>
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
                        {summary && summary.uniqueUsers > 0
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
                    <button key={v} onClick={() => setView(v)}
                      data-testid={`button-view-${v}`}
                      className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                        view === v ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"
                      )}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <input type="text" value={event} onChange={(e) => handleEventChange(e.target.value)} placeholder="Event name…"
                  data-testid="input-event-filter"
                  className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-44" />
                <input type="text" value={userId} onChange={(e) => handleUserIdChange(e.target.value)} placeholder="User ID…"
                  data-testid="input-user-filter"
                  className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-44" />
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                  className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                <span className="text-muted-foreground text-sm">to</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                  className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                {(from || to) && (
                  <span className="text-xs text-muted-foreground" title="Custom date range overrides the rolling window">
                    custom range overrides {days}d
                  </span>
                )}
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
                      events.map((e) => (
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
          </>
        )}

        {tab === "search" && (
          <SearchTab data={searchQuery.data} loading={searchQuery.isLoading} days={days} />
        )}

        {tab === "recsys" && (
          <RecsysTab data={recsysQuery.data} loading={recsysQuery.isLoading} days={days} />
        )}
      </div>
    </div>
  );
}

function SearchTab({ data, loading, days }: { data: SearchSummaryResponse | undefined; loading: boolean; days: number }) {
  if (loading) {
    return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 bg-muted rounded animate-pulse" />)}</div>;
  }
  if (!data) return <p className="text-muted-foreground text-sm">No data</p>;
  const totals = data.totals ?? { total: 0, uniqueUsers: 0, zeroResults: 0, zeroResultRate: 0 };
  const byType = data.byType ?? [];
  const topQueries = data.topQueries ?? [];
  const zero = data.zeroResultQueries ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label={`Searches (${days}d)`} value={(totals.total ?? 0).toLocaleString()} />
        <Stat label="Unique Users" value={(totals.uniqueUsers ?? 0).toLocaleString()} />
        <Stat label="Zero-result Queries" value={(totals.zeroResults ?? 0).toLocaleString()} />
        <Stat label="Zero-result Rate" value={`${(totals.zeroResultRate ?? 0).toFixed(1)}%`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-semibold mb-3">By Search Type</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2">Type</th>
                <th className="py-2 text-right">Count</th>
                <th className="py-2 text-right">Avg Results</th>
                <th className="py-2 text-right">Avg Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {byType.length === 0 ? (
                <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">—</td></tr>
              ) : byType.map((b) => (
                <tr key={b.searchType}>
                  <td className="py-2 font-medium">{b.searchType}</td>
                  <td className="py-2 text-right tabular-nums">{b.count.toLocaleString()}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{b.avgResults}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{b.avgDurationMs}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="xl:col-span-2 bg-card border border-card-border rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-semibold mb-3">Top Queries</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2">Query</th>
                <th className="py-2">Type</th>
                <th className="py-2 text-right">Count</th>
                <th className="py-2 text-right">Avg Results</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topQueries.length === 0 ? (
                <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">—</td></tr>
              ) : topQueries.map((q, idx) => (
                <tr key={`${q.searchType}-${q.query}-${idx}`}>
                  <td className="py-2 font-mono text-xs">{q.query}</td>
                  <td className="py-2 text-xs text-muted-foreground">{q.searchType}</td>
                  <td className="py-2 text-right tabular-nums">{q.count}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{q.avgResults}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
        <h3 className="text-sm font-semibold mb-3 text-destructive">Zero-Result Queries (need attention)</h3>
        {zero.length === 0 ? (
          <p className="text-sm text-muted-foreground">No queries returned zero results — nice!</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {zero.map((q, idx) => (
              <span key={`${q.searchType}-${q.query}-${idx}`} className="px-2 py-1 rounded-full text-xs font-mono bg-destructive/10 text-destructive">
                {q.query} <span className="text-destructive/60">×{q.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecsysTab({ data, loading, days }: { data: RecsysSummaryResponse | undefined; loading: boolean; days: number }) {
  if (loading) {
    return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 bg-muted rounded animate-pulse" />)}</div>;
  }
  if (!data) return <p className="text-muted-foreground text-sm">No data</p>;
  const totals = data.totals ?? { events: 0, performanceLogs: 0, uniqueUsers: 0 };
  const bySurface = data.bySurface ?? [];
  const byEventType = data.byEventType ?? [];
  const byAlgo = data.byAlgoVersion ?? [];
  const perfBySection = data.performanceBySection ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label={`Rec Events (${days}d)`} value={(totals.events ?? 0).toLocaleString()} />
        <Stat label="Performance Logs" value={(totals.performanceLogs ?? 0).toLocaleString()} />
        <Stat label="Unique Users" value={(totals.uniqueUsers ?? 0).toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="By Surface">
          {bySurface.length === 0 ? <Empty /> : <SimpleTable rows={bySurface.map((r) => ({ k: r.surface, v: r.count }))} />}
        </Card>
        <Card title="By Event Type">
          {byEventType.length === 0 ? <Empty /> : <SimpleTable rows={byEventType.map((r) => ({ k: r.eventType, v: r.count }))} />}
        </Card>
        <Card title="By Algo Version">
          {byAlgo.length === 0 ? <Empty /> : <SimpleTable rows={byAlgo.map((r) => ({ k: r.algoVersion, v: r.count }))} />}
        </Card>
      </div>

      <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
        <h3 className="text-sm font-semibold mb-3">Performance by Section × Action</h3>
        {perfBySection.length === 0 ? (
          <p className="text-sm text-muted-foreground">No performance logs yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2">Section</th>
                <th className="py-2">Action</th>
                <th className="py-2 text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {perfBySection.map((r, idx) => (
                <tr key={`${r.section}-${r.action}-${idx}`}>
                  <td className="py-2 font-medium">{r.section}</td>
                  <td className="py-2 text-muted-foreground">{r.action}</td>
                  <td className="py-2 text-right tabular-nums">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums mt-1">{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-muted-foreground py-2">—</p>;
}

function SimpleTable({ rows }: { rows: Array<{ k: string; v: number }> }) {
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-border">
        {rows.map((r) => (
          <tr key={r.k}>
            <td className="py-1.5 truncate">{r.k}</td>
            <td className="py-1.5 text-right tabular-nums">{r.v.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

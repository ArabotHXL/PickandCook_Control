import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { DollarSign, Activity, CheckCircle, Sparkles, ChevronLeft, ChevronRight, AlertTriangle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface AiAlert {
  todayUsd: number;
  yesterdayUsd: number;
  thresholdUsd: number;
  exceeded: boolean;
  nearLimit: boolean;
  todayRequests: number;
}

function useAiAlerts() {
  return useQuery({
    queryKey: ["ops", "ai", "alerts"],
    queryFn: () => apiFetch("/api/ops/ai/alerts").then((r) => r.json() as Promise<AiAlert>),
    refetchInterval: 60_000,
  });
}

function AiCostAlertBanner() {
  const { data } = useAiAlerts();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const setMutation = useMutation({
    mutationFn: (thresholdUsd: number) =>
      apiFetch("/api/ops/ai/alerts/threshold", {
        method: "PATCH",
        body: JSON.stringify({ thresholdUsd }),
      }).then(async (r) => {
        if (!r.ok) {
          const text = await r.text();
          let msg = `HTTP ${r.status}`;
          try {
            msg = (JSON.parse(text) as { error?: string }).error ?? msg;
          } catch {
            /* not json */
          }
          throw new Error(msg);
        }
        return r.json();
      }),
    onSuccess: () => {
      toast({ title: "Threshold updated" });
      qc.invalidateQueries({ queryKey: ["ops", "ai", "alerts"] });
      setEditing(false);
    },
    onError: (e: Error) =>
      toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  if (!data) return null;
  const tone = data.exceeded ? "exceeded" : data.nearLimit ? "near" : "ok";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 flex items-center justify-between gap-4",
        tone === "exceeded" && "bg-destructive/10 border-destructive/30 text-destructive",
        tone === "near" && "bg-orange-50 border-orange-300 text-orange-800",
        tone === "ok" && "bg-emerald-50 border-emerald-200 text-emerald-800"
      )}
      data-testid={`banner-ai-cost-${tone}`}
    >
      <div className="flex items-center gap-3 text-sm">
        {tone === "exceeded" ? (
          <AlertTriangle className="w-4 h-4" />
        ) : (
          <DollarSign className="w-4 h-4" />
        )}
        <span data-testid="text-ai-alert-status">
          <strong className="tabular-nums">${data.todayUsd.toFixed(4)}</strong> spent today
          {" · "}threshold{" "}
          <strong className="tabular-nums">${data.thresholdUsd.toFixed(2)}</strong>
          {tone === "exceeded" && " — DAILY LIMIT EXCEEDED"}
          {tone === "near" && " — approaching limit (≥80%)"}
          {tone === "ok" && " — within budget"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <input
              type="number"
              step="0.01"
              min="0"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder={String(data.thresholdUsd)}
              className="w-24 px-2 py-1 rounded border border-input bg-background text-foreground text-xs"
              data-testid="input-threshold"
            />
            <button
              onClick={() => {
                const n = parseFloat(val);
                if (!isNaN(n) && n > 0) setMutation.mutate(n);
              }}
              disabled={setMutation.isPending}
              className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              data-testid="button-save-threshold"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs px-2 py-1 rounded border border-input bg-background text-foreground"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              setVal(String(data.thresholdUsd));
              setEditing(true);
            }}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-current opacity-70 hover:opacity-100"
            data-testid="button-edit-threshold"
          >
            <Settings className="w-3 h-3" /> Threshold
          </button>
        )}
      </div>
    </div>
  );
}

function useAiSummary() {
  return useQuery({
    queryKey: ["ops", "ai", "summary"],
    queryFn: () => apiFetch("/api/ops/ai/summary").then((r) => r.json()),
  });
}

function useAiInteractions(type: string, success: string, page: number) {
  return useQuery({
    queryKey: ["ops", "ai", "interactions", type, success, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (type) params.set("interactionType", type);
      if (success) params.set("success", success);
      return apiFetch(`/api/ops/ai/interactions?${params.toString()}`).then((r) => r.json());
    },
  });
}

export function AIUsagePage() {
  const [tab, setTab] = useState<"summary" | "interactions">("summary");
  const [type, setType] = useState("");
  const [success, setSuccess] = useState("");
  const [page, setPage] = useState(1);

  const summaryQuery = useAiSummary();
  const interactionsQuery = useAiInteractions(type, success, page);

  const summary = summaryQuery.data;
  const interactions = interactionsQuery.data?.interactions ?? [];
  const total = interactionsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div>
      <PageHeader title="AI / LLM Usage" description="Cost monitoring and interaction logs" />

      <div className="p-6 space-y-4">
        <AiCostAlertBanner />
        <div className="flex gap-1 border-b border-border">
          {(["summary", "interactions"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
              {t === "summary" ? "Summary (30d)" : "All Interactions"}
            </button>
          ))}
        </div>

        {tab === "summary" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard label="Cost Today" value={`$${(summary?.totals?.costToday ?? 0).toFixed(4)}`} icon={<DollarSign className="w-4 h-4" />} />
              <StatCard label="Cost (7d)" value={`$${(summary?.totals?.cost7d ?? 0).toFixed(2)}`} icon={<DollarSign className="w-4 h-4" />} />
              <StatCard label="Cost (30d)" value={`$${(summary?.totals?.cost30d ?? 0).toFixed(2)}`} icon={<DollarSign className="w-4 h-4" />} />
              <StatCard label="Interactions (30d)" value={summary?.totals?.interactions30d ?? 0} icon={<Sparkles className="w-4 h-4" />} />
              <StatCard label="Success Rate" value={`${(summary?.totals?.successRate ?? 0).toFixed(1)}%`} icon={<CheckCircle className="w-4 h-4" />} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
                <h3 className="text-sm font-semibold mb-4">Daily LLM Cost (30d)</h3>
                {summaryQuery.isLoading ? (
                  <div className="h-48 bg-muted rounded animate-pulse" />
                ) : (summary?.daily ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No usage data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={summary?.daily ?? []}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                      <Tooltip formatter={(v: number) => `$${v.toFixed(4)}`} />
                      <Line type="monotone" dataKey="cost" stroke="hsl(224 76% 57%)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
                <h3 className="text-sm font-semibold mb-4">Cost by Feature (30d)</h3>
                {summaryQuery.isLoading ? (
                  <div className="h-48 bg-muted rounded animate-pulse" />
                ) : (summary?.byFeature ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No feature usage</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={summary?.byFeature ?? []} layout="vertical" margin={{ left: 30 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                      <YAxis type="category" dataKey="feature" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip formatter={(v: number) => `$${v.toFixed(4)}`} />
                      <Bar dataKey="cost" fill="hsl(160 50% 45%)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
                <h3 className="text-sm font-semibold mb-3">By Model (30d)</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="py-2">Model</th>
                      <th className="py-2 text-right">Reqs</th>
                      <th className="py-2 text-right">In tok</th>
                      <th className="py-2 text-right">Out tok</th>
                      <th className="py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(summary?.byModel ?? []).length === 0 ? (
                      <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">—</td></tr>
                    ) : (summary?.byModel ?? []).map((m: { model: string; requests: number; inputTokens: number; outputTokens: number; cost: number }) => (
                      <tr key={m.model}>
                        <td className="py-2 font-medium">{m.model}</td>
                        <td className="py-2 text-right tabular-nums">{m.requests.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{m.inputTokens.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{m.outputTokens.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums font-medium">${m.cost.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  Recent Interactions
                </h3>
                <div className="space-y-1">
                  {(summary?.recentInteractions ?? []).slice(0, 10).map((i: { id: string; interactionType: string; model: string | null; success: boolean; latencyMs: number | null; createdAt: string }) => (
                    <div key={i.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0 text-xs">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                        i.success ? "bg-emerald-500" : "bg-destructive"
                      )} />
                      <span className="font-mono font-medium flex-1">{i.interactionType}</span>
                      <span className="text-muted-foreground">{i.model ?? "—"}</span>
                      <span className="text-muted-foreground tabular-nums w-12 text-right">{i.latencyMs ? `${i.latencyMs}ms` : "—"}</span>
                      <span className="text-muted-foreground">{new Date(i.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                  {(summary?.recentInteractions ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">No interactions yet</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "interactions" && (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}
                className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">All types</option>
                <option value="recommend">recommend</option>
                <option value="parse_intent">parse_intent</option>
                <option value="receipt_extract">receipt_extract</option>
              </select>
              <select value={success} onChange={(e) => { setSuccess(e.target.value); setPage(1); }}
                className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">All</option>
                <option value="true">Success only</option>
                <option value="false">Failures only</option>
              </select>
            </div>

            <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Model</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Latency</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Results</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {interactionsQuery.isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => <tr key={i}>{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
                  ) : interactions.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No interactions found</td></tr>
                  ) : (
                    interactions.map((i: { id: string; interactionType: string; model: string | null; latencyMs: number | null; resultCount: number | null; success: boolean; userId: string | null; createdAt: string; errorMessage: string | null }) => (
                      <tr key={i.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-medium">{i.interactionType}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{i.model ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">{i.latencyMs ? `${i.latencyMs}ms` : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">{i.resultCount ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium",
                            i.success ? "bg-emerald-100 text-emerald-700" : "bg-destructive/10 text-destructive"
                          )}>
                            {i.success ? "ok" : "fail"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{i.userId?.slice(0, 8) ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(i.createdAt).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <p className="text-muted-foreground">Page {page} of {totalPages} • {total.toLocaleString()} interactions</p>
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

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Flag,
  Clock,
  Trash2,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ExternalHealthCard } from "@/components/ExternalHealthCard";
import { AlertWebhookCard } from "@/components/AlertWebhookCard";
import { JobSchedulesCard } from "@/components/JobSchedulesCard";
import { ReverseSyncDeadLetterCard } from "@/components/ReverseSyncDeadLetterCard";
import { TwoFactorCard } from "@/components/TwoFactorCard";
import { SortableHeader, type SortState } from "@/components/SortableHeader";

type Job = Record<string, unknown> | null;

interface TrackedJob {
  jobName: string;
  latest: Job;
  lastSuccess: Job;
  lastSuccessAt: string | null;
  stale: boolean;
  staleSinceDays: number | null;
}

interface Zombie {
  id: string;
  jobName: string;
  startedAt: string;
  ageSeconds: number;
}

interface SystemHealth {
  lastRecipeImport: Job;
  lastBarcodeImport: Job;
  lastNotificationJob: Job;
  recentFailedJobs: Job[];
  totalJobsToday: number;
  failedJobsToday: number;
  llmCostToday: number;
  llmCostThisWeek: number;
  trackedJobs: TrackedJob[];
  zombies: Zombie[];
  thresholds: { staleDays: number; zombieHours: number };
}

function useSystemHealth() {
  return useQuery<SystemHealth>({
    queryKey: ["ops", "system", "health"],
    queryFn: () => apiFetch("/api/ops/system/health").then((r) => r.json()),
    refetchInterval: 30_000,
  });
}

function useJobRuns(jobName: string, status: string, page: number, sort: SortState) {
  return useQuery({
    queryKey: ["ops", "system", "jobs", jobName, status, page, sort.col, sort.dir],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        sort: sort.col,
        dir: sort.dir,
      });
      if (jobName) params.set("jobName", jobName);
      if (status) params.set("status", status);
      return apiFetch(`/api/ops/system/jobs?${params.toString()}`).then((r) => r.json());
    },
  });
}

function useFlags() {
  return useQuery({
    queryKey: ["ops", "system", "flags"],
    queryFn: () => apiFetch("/api/ops/system/flags").then((r) => r.json()),
  });
}

const STATUS_BADGE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-destructive/10 text-destructive",
  running: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
};

function formatAge(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function JobRow({ job }: { job: Record<string, unknown> }) {
  if (!job) return null;
  const status = String(job.status ?? "");
  return (
    <div className="flex items-center gap-4 py-3 border-b border-border last:border-0">
      <div className={cn("w-2 h-2 rounded-full shrink-0",
        status === "success" || status === "completed" ? "bg-emerald-500" :
        status === "failed" ? "bg-destructive" :
        status === "running" ? "bg-blue-500 animate-pulse" : "bg-yellow-400"
      )} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{String(job.jobName ?? "—")}</p>
        {job.errorMessage ? (
          <p className="text-xs text-destructive truncate">{String(job.errorMessage)}</p>
        ) : null}
      </div>
      <div className="text-right">
        <p className="text-xs text-muted-foreground">{job.startedAt ? new Date(String(job.startedAt)).toLocaleString() : "—"}</p>
        {job.durationMs ? <p className="text-xs text-muted-foreground">{(Number(job.durationMs) / 1000).toFixed(1)}s</p> : null}
      </div>
    </div>
  );
}

export function SystemPage() {
  const [tab, setTab] = useState<"health" | "jobs" | "flags" | "security">("health");
  const [jobName, setJobName] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const [page, setPage] = useState(1);
  const [jobsSort, setJobsSort] = useState<SortState>({ col: "startedAt", dir: "desc" });
  const qc = useQueryClient();

  const healthQuery = useSystemHealth();
  const jobsQuery = useJobRuns(jobName, jobStatus, page, jobsSort);
  const onJobsSort = (s: SortState) => {
    setJobsSort(s);
    setPage(1);
  };
  const flagsQuery = useFlags();

  const clearStuckMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/ops/system/jobs/clear-stuck", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "system", "health"] });
      qc.invalidateQueries({ queryKey: ["ops", "system", "jobs"] });
    },
  });

  const triggerJobMutation = useMutation({
    mutationFn: (jobName: string) =>
      apiFetch(`/api/ops/system/jobs/${encodeURIComponent(jobName)}/trigger`, {
        method: "POST",
      }).then((r) => r.json()),
    onSuccess: () => {
      // Poll a few times so the new running → success transition shows up.
      qc.invalidateQueries({ queryKey: ["ops", "system", "health"] });
      qc.invalidateQueries({ queryKey: ["ops", "system", "jobs"] });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["ops", "system", "health"] }), 2000);
      setTimeout(() => qc.invalidateQueries({ queryKey: ["ops", "system", "health"] }), 8000);
    },
  });

  const availableJobsQuery = useQuery<{ jobs: Array<{ name: string; cronExpr: string; description: string }> }>({
    queryKey: ["ops", "system", "available-jobs"],
    queryFn: () => apiFetch("/api/ops/system/jobs/available").then((r) => r.json()),
  });
  const availableJobNames = new Set((availableJobsQuery.data?.jobs ?? []).map((j) => j.name));

  const updateFlagMutation = useMutation({
    mutationFn: ({ scopeId, key, value }: { scopeId: string; key: string; value: unknown }) =>
      apiFetch(`/api/ops/system/flags/${scopeId}`, {
        method: "PATCH",
        body: JSON.stringify({ key, value }),
      }).then((r) => r.json()),
    onMutate: async ({ scopeId, key, value }) => {
      await qc.cancelQueries({ queryKey: ["ops", "system", "flags"] });
      const prev = qc.getQueryData<{ scopes: Array<{ id: string; flags: Record<string, unknown> }> }>([
        "ops", "system", "flags",
      ]);
      if (prev) {
        qc.setQueryData(["ops", "system", "flags"], {
          ...prev,
          scopes: prev.scopes.map((s) =>
            s.id === scopeId ? { ...s, flags: { ...s.flags, [key]: value } } : s
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(["ops", "system", "flags"], context.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["ops", "system", "flags"] }),
  });

  const health = healthQuery.data;
  const jobs = jobsQuery.data?.jobs ?? [];
  const total = jobsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  const trackedJobs = health?.trackedJobs ?? [];
  const staleJobs = trackedJobs.filter((t) => t.stale);
  const zombies = health?.zombies ?? [];

  return (
    <div>
      <PageHeader title="System Health" description="Job monitoring, infrastructure, and feature flags" />

      <div className="p-6 space-y-4">
        <div className="flex gap-1 border-b border-border">
          {(["health", "jobs", "flags", "security"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              data-testid={`tab-system-${t}`}
              className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
              {t === "health" ? "Overview" : t === "jobs" ? "All Job Runs" : t === "flags" ? "Feature Flags" : "Security"}
            </button>
          ))}
        </div>

        {tab === "health" && (
          <>
            {/* Pipeline-health banner: stale data + zombie jobs */}
            {(staleJobs.length > 0 || zombies.length > 0) && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-amber-900">Pipeline issues detected</h3>
                    <p className="text-xs text-amber-800 mt-0.5">
                      Worker process appears absent. The dashboard surfaces job state — it does not run jobs.
                    </p>

                    {staleJobs.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-amber-900 mb-1">
                          Stale data (no successful run in &gt; {health?.thresholds.staleDays} days):
                        </p>
                        <ul className="text-xs text-amber-800 space-y-0.5">
                          {staleJobs.map((j) => (
                            <li key={j.jobName} className="font-mono">
                              • {j.jobName} —{" "}
                              {j.staleSinceDays === null
                                ? "never succeeded"
                                : `last success ${j.staleSinceDays}d ago`}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {zombies.length > 0 && (
                      <div className="mt-3 flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-xs font-medium text-amber-900 mb-1">
                            Stuck jobs (running &gt; {health?.thresholds.zombieHours}h, no progress):
                          </p>
                          <ul className="text-xs text-amber-800 space-y-0.5">
                            {zombies.map((z) => (
                              <li key={z.id} className="font-mono">
                                • {z.jobName} — running for {formatAge(z.ageSeconds)}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <button
                          onClick={() => clearStuckMutation.mutate()}
                          disabled={clearStuckMutation.isPending}
                          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {clearStuckMutation.isPending ? "Clearing…" : "Clear stuck jobs"}
                        </button>
                      </div>
                    )}

                    {clearStuckMutation.data ? (
                      <p className="text-xs text-emerald-700 mt-2">
                        ✓ Cleared {clearStuckMutation.data.cleared} stuck job(s).
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Jobs Today" value={health?.totalJobsToday ?? 0} icon={<Activity className="w-4 h-4" />} />
              <StatCard label="Failed Today" value={health?.failedJobsToday ?? 0} icon={<AlertTriangle className="w-4 h-4" />} />
              <StatCard label="LLM Cost Today" value={`$${(health?.llmCostToday ?? 0).toFixed(4)}`} icon={<DollarSign className="w-4 h-4" />} />
              <StatCard label="LLM Cost (7d)" value={`$${(health?.llmCostThisWeek ?? 0).toFixed(2)}`} icon={<DollarSign className="w-4 h-4" />} />
            </div>

            <ExternalHealthCard />

            <JobSchedulesCard />

            <ReverseSyncDeadLetterCard />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" /> Tracked Jobs
                </h3>
                {healthQuery.isLoading ? (
                  <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
                ) : trackedJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No jobs have ever run</p>
                ) : (
                  <div>
                    {trackedJobs.map((tj) => {
                      const canRun = availableJobNames.has(tj.jobName);
                      const isPending = triggerJobMutation.isPending && triggerJobMutation.variables === tj.jobName;
                      return (
                        <div key={tj.jobName} className="flex items-center justify-between py-2.5 border-b border-border last:border-0 gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground font-mono truncate">{tj.jobName}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {tj.lastSuccessAt
                                ? `last success ${tj.staleSinceDays}d ago`
                                : "never succeeded"}
                            </p>
                          </div>
                          {tj.latest ? (
                            <span className={cn(
                              "px-2 py-0.5 rounded text-xs font-medium shrink-0",
                              STATUS_BADGE[String(tj.latest.status)] ?? "bg-muted",
                              tj.stale && "ring-1 ring-amber-400"
                            )}>
                              {String(tj.latest.status)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {canRun && (
                            <button
                              onClick={() => triggerJobMutation.mutate(tj.jobName)}
                              disabled={triggerJobMutation.isPending}
                              title={`Run ${tj.jobName} now`}
                              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                            >
                              <Play className="w-3 h-3" />
                              {isPending ? "Running…" : "Run"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="xl:col-span-2 bg-card border border-card-border rounded-lg p-5 shadow-sm">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" /> Recent Failures
                </h3>
                {healthQuery.isLoading ? (
                  <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
                ) : (health?.recentFailedJobs ?? []).length === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle className="w-4 h-4" />
                    <p className="text-sm">No recent failures</p>
                  </div>
                ) : (
                  (health?.recentFailedJobs ?? []).map((job: Job) => (
                    job ? <JobRow key={String(job.id)} job={job} /> : null
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {tab === "jobs" && (
          <>
            <div className="flex items-center gap-3">
              <input type="text" value={jobName} onChange={(e) => { setJobName(e.target.value); setPage(1); }} placeholder="Job name…"
                className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-44" />
              <select value={jobStatus} onChange={(e) => { setJobStatus(e.target.value); setPage(1); }}
                className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">All statuses</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="running">Running</option>
              </select>
            </div>

            <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <SortableHeader col="jobName" active={jobsSort} onChange={onJobsSort} defaultDir="asc">Job</SortableHeader>
                    <SortableHeader col="status" active={jobsSort} onChange={onJobsSort} defaultDir="asc">Status</SortableHeader>
                    <SortableHeader col="startedAt" active={jobsSort} onChange={onJobsSort}>Started</SortableHeader>
                    <SortableHeader col="durationMs" active={jobsSort} onChange={onJobsSort} align="right">Duration</SortableHeader>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {jobsQuery.isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => <tr key={i}>{Array.from({ length: 5 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
                  ) : jobs.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No job runs found</td></tr>
                  ) : (
                    jobs.map((j: Record<string, unknown>) => (
                      <tr key={String(j.id)} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{String(j.jobName ?? "—")}</td>
                        <td className="px-4 py-3">
                          <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", STATUS_BADGE[String(j.status)] ?? "bg-muted")}>{String(j.status)}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{j.startedAt ? new Date(String(j.startedAt)).toLocaleString() : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">{j.durationMs ? `${(Number(j.durationMs) / 1000).toFixed(1)}s` : "—"}</td>
                        <td className="px-4 py-3 text-destructive text-xs max-w-xs truncate">{String(j.errorMessage ?? "")}</td>
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

        {tab === "security" && (
          <div className="space-y-4">
            <AlertWebhookCard flagsData={flagsQuery.data} flagsLoading={flagsQuery.isLoading} />
            <TwoFactorCard />
          </div>
        )}

        {tab === "flags" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Flag className="w-4 h-4" />
              Toggle feature flags by scope. Changes are audited.
            </p>
            {flagsQuery.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-32 bg-muted rounded animate-pulse" />)}</div>
            ) : (flagsQuery.data?.scopes ?? []).length === 0 ? (
              <div className="bg-card border border-card-border rounded-lg p-8 text-center">
                <p className="text-sm text-muted-foreground">No feature flag scopes configured</p>
              </div>
            ) : (
              (flagsQuery.data?.scopes ?? []).map((scope: { id: string; flags: Record<string, unknown>; updatedAt: string; updatedBy: string | null }) => {
                const entries = Object.entries(scope.flags ?? {});
                return (
                  <div key={scope.id} className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold font-mono">{scope.id}</h3>
                      <p className="text-xs text-muted-foreground">
                        Updated {scope.updatedAt ? new Date(scope.updatedAt).toLocaleString() : "never"}
                        {scope.updatedBy && ` • by ${scope.updatedBy.slice(0, 8)}`}
                      </p>
                    </div>
                    {entries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No flags set in this scope</p>
                    ) : (
                      <div className="space-y-2">
                        {entries.map(([key, value]) => (
                          <FlagRow
                            key={key}
                            scopeId={scope.id}
                            flagKey={key}
                            value={value}
                            disabled={updateFlagMutation.isPending}
                            onToggle={(newValue) => updateFlagMutation.mutate({ scopeId: scope.id, key, value: newValue })}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FlagRow({ scopeId: _scopeId, flagKey, value, disabled, onToggle }: { scopeId: string; flagKey: string; value: unknown; disabled: boolean; onToggle: (v: unknown) => void }) {
  const isBool = typeof value === "boolean";
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-mono font-medium">{flagKey}</p>
        {!isBool && <p className="text-xs text-muted-foreground font-mono">{JSON.stringify(value)}</p>}
      </div>
      {isBool ? (
        <button
          onClick={() => onToggle(!value)}
          disabled={disabled}
          className={cn("relative w-10 h-5 rounded-full transition-colors disabled:opacity-50",
            value ? "bg-primary" : "bg-muted"
          )}
        >
          <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
            value ? "translate-x-5" : "translate-x-0.5"
          )} />
        </button>
      ) : (
        <span className="text-xs text-muted-foreground italic">non-boolean (read-only)</span>
      )}
    </div>
  );
}

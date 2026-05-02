import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Activity, AlertTriangle, CheckCircle, Clock, DollarSign, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function useSystemHealth() {
  return useQuery({
    queryKey: ["ops", "system", "health"],
    queryFn: () => apiFetch("/api/ops/system/health").then((r) => r.json()),
    refetchInterval: 30_000,
  });
}

function useJobRuns(jobName: string, status: string, page: number) {
  return useQuery({
    queryKey: ["ops", "system", "jobs", jobName, status, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (jobName) params.set("jobName", jobName);
      if (status) params.set("status", status);
      return apiFetch(`/api/ops/system/jobs?${params.toString()}`).then((r) => r.json());
    },
  });
}

const STATUS_BADGE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-destructive/10 text-destructive",
  running: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
};

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
        {job.errorMessage && (
          <p className="text-xs text-destructive truncate">{String(job.errorMessage)}</p>
        )}
      </div>
      <div className="text-right">
        <p className="text-xs text-muted-foreground">{job.startedAt ? new Date(String(job.startedAt)).toLocaleString() : "—"}</p>
        {job.durationMs && <p className="text-xs text-muted-foreground">{(Number(job.durationMs) / 1000).toFixed(1)}s</p>}
      </div>
    </div>
  );
}

export function SystemPage() {
  const [tab, setTab] = useState<"health" | "jobs">("health");
  const [jobName, setJobName] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const [page, setPage] = useState(1);

  const healthQuery = useSystemHealth();
  const jobsQuery = useJobRuns(jobName, jobStatus, page);

  const health = healthQuery.data;
  const jobs = jobsQuery.data?.jobs ?? [];
  const total = jobsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <PageHeader title="System Health" description="Job monitoring and infrastructure" />

      <div className="p-6 space-y-4">
        <div className="flex gap-1 border-b border-border">
          {(["health", "jobs"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
              {t === "health" ? "Overview" : "All Job Runs"}
            </button>
          ))}
        </div>

        {tab === "health" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Jobs Today" value={health?.totalJobsToday ?? 0} icon={<Activity className="w-4 h-4" />} />
              <StatCard label="Failed Today" value={health?.failedJobsToday ?? 0} icon={<AlertTriangle className="w-4 h-4" />} />
              <StatCard label="LLM Cost Today" value={`$${(health?.llmCostToday ?? 0).toFixed(4)}`} icon={<DollarSign className="w-4 h-4" />} />
              <StatCard label="LLM Cost (7d)" value={`$${(health?.llmCostThisWeek ?? 0).toFixed(2)}`} icon={<DollarSign className="w-4 h-4" />} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" /> Key Jobs
                </h3>
                {healthQuery.isLoading ? (
                  <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
                ) : (
                  <div>
                    {[
                      { label: "Recipe Import", job: health?.lastRecipeImport },
                      { label: "Barcode Import", job: health?.lastBarcodeImport },
                      { label: "Notification Job", job: health?.lastNotificationJob },
                    ].map(({ label, job }) => (
                      <div key={label} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        {job ? (
                          <span className={cn("px-2 py-0.5 rounded text-xs font-medium", STATUS_BADGE[String(job.status)] ?? "bg-muted")}>
                            {String(job.status)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Never run</span>
                        )}
                      </div>
                    ))}
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
                  (health?.recentFailedJobs ?? []).map((job: Record<string, unknown>) => (
                    <JobRow key={String(job.id)} job={job} />
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
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Job</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Started</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Duration</th>
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
      </div>
    </div>
  );
}

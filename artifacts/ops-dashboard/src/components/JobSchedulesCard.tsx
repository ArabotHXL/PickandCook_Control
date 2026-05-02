import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface JobSchedule {
  name: string;
  description: string;
  defaultCronExpr: string;
  effectiveCronExpr: string;
  isOverride: boolean;
}

interface JobSchedulesResponse {
  schedules: JobSchedule[];
}

const PRESETS: Array<{ label: string; expr: string }> = [
  { label: "Every 5 min", expr: "*/5 * * * *" },
  { label: "Hourly", expr: "0 * * * *" },
  { label: "Every 6h", expr: "0 */6 * * *" },
  { label: "Daily 3am UTC", expr: "0 3 * * *" },
  { label: "Weekly Sun 5am UTC", expr: "0 5 * * 0" },
];

export function JobSchedulesCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const schedulesQuery = useQuery<JobSchedulesResponse>({
    queryKey: ["ops", "system", "job-schedules"],
    queryFn: () => apiFetch("/api/ops/system/jobs/schedules").then((r) => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ jobName, cronExpr }: { jobName: string; cronExpr: string | null }) => {
      const res = await apiFetch(`/api/ops/system/jobs/${encodeURIComponent(jobName)}/schedule`, {
        method: "PATCH",
        body: JSON.stringify({ cronExpr }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      return res.json() as Promise<JobSchedule>;
    },
    onSuccess: (_data, vars) => {
      setDrafts((d) => {
        const { [vars.jobName]: _omit, ...rest } = d;
        return rest;
      });
      qc.invalidateQueries({ queryKey: ["ops", "system", "job-schedules"] });
      toast({
        title: vars.cronExpr ? "Schedule updated" : "Schedule reverted",
        description: `${vars.jobName} — change is live, no restart needed.`,
      });
    },
    onError: (err: Error, vars) => {
      toast({
        title: "Schedule update failed",
        description: `${vars.jobName}: ${err.message}`,
        variant: "destructive",
      });
    },
  });

  const schedules = schedulesQuery.data?.schedules ?? [];

  return (
    <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" /> Job Schedules
        </h3>
        <p className="text-xs text-muted-foreground">
          Cron in UTC. Changes apply immediately to the running worker.
        </p>
      </div>

      {schedulesQuery.isLoading ? (
        <div className="space-y-2 mt-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-3">No jobs registered.</p>
      ) : (
        <div className="mt-3 divide-y divide-border">
          {schedules.map((s) => {
            const draft = drafts[s.name];
            const value = draft ?? s.effectiveCronExpr;
            const dirty = draft !== undefined && draft !== s.effectiveCronExpr;
            const pending =
              updateMutation.isPending && updateMutation.variables?.jobName === s.name;
            return (
              <div key={s.name} className="py-3 flex flex-col md:flex-row md:items-center gap-3">
                <div className="md:w-56 min-w-0">
                  <p className="text-sm font-medium font-mono truncate" title={s.name}>
                    {s.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate" title={s.description}>
                    {s.description}
                  </p>
                </div>

                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <input
                    type="text"
                    value={value}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [s.name]: e.target.value }))
                    }
                    spellCheck={false}
                    placeholder={s.defaultCronExpr}
                    data-testid={`input-cron-${s.name}`}
                    className={cn(
                      "px-2 py-1 rounded border bg-background text-sm font-mono w-44 focus:outline-none focus:ring-2 focus:ring-ring",
                      dirty ? "border-amber-400" : "border-input",
                    )}
                  />
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        setDrafts((d) => ({ ...d, [s.name]: e.target.value }));
                      }
                    }}
                    className="px-2 py-1 rounded border border-input bg-background text-xs text-muted-foreground"
                    title="Apply preset"
                  >
                    <option value="">Preset…</option>
                    {PRESETS.map((p) => (
                      <option key={p.expr} value={p.expr}>
                        {p.label} ({p.expr})
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {s.isOverride ? (
                      <span title={`Default: ${s.defaultCronExpr}`}>
                        override • default <code>{s.defaultCronExpr}</code>
                      </span>
                    ) : (
                      <span>using default</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={!dirty || pending}
                    onClick={() =>
                      updateMutation.mutate({ jobName: s.name, cronExpr: value.trim() })
                    }
                    data-testid={`button-save-cron-${s.name}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                  >
                    <Save className="w-3 h-3" />
                    {pending && updateMutation.variables?.cronExpr ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={pending || (!s.isOverride && !dirty)}
                    onClick={() => {
                      if (dirty) {
                        setDrafts((d) => {
                          const { [s.name]: _omit, ...rest } = d;
                          return rest;
                        });
                      } else {
                        updateMutation.mutate({ jobName: s.name, cronExpr: null });
                      }
                    }}
                    data-testid={`button-reset-cron-${s.name}`}
                    title={dirty ? "Discard unsaved edit" : "Revert to default"}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-input hover:bg-muted disabled:opacity-40"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {dirty ? "Discard" : "Revert"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

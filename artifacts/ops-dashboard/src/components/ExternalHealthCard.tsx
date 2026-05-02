import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { CheckCircle, XCircle, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthTarget {
  name: string;
  usedBy: string;
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  error?: string;
}

interface ExternalHealth {
  checkedAt: string;
  targets: HealthTarget[];
}

export function ExternalHealthCard() {
  const { data, isLoading, refetch, isFetching } = useQuery<ExternalHealth>({
    queryKey: ["ops", "system", "external-health"],
    queryFn: () => apiFetch("/api/ops/system/external-health").then((r) => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return (
    <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm" data-testid="external-health-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground" /> Downstream APIs
        </h3>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {isFetching ? "Checking…" : "Refresh"}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
      ) : (
        <div className="divide-y divide-border">
          {(data?.targets ?? []).map((t) => (
            <div key={t.name} className="flex items-center justify-between py-2.5 gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {t.ok ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.usedBy}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={cn("text-xs font-medium", t.ok ? "text-emerald-600" : "text-destructive")}>
                  {t.ok ? `${t.status} OK` : t.status ? `${t.status}` : "down"}
                </p>
                {t.latencyMs !== null ? (
                  <p className="text-xs text-muted-foreground tabular-nums">{t.latencyMs}ms</p>
                ) : t.error ? (
                  <p className="text-xs text-destructive truncate max-w-[12rem]">{t.error}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {data?.checkedAt && (
        <p className="text-xs text-muted-foreground mt-3">
          Checked {new Date(data.checkedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

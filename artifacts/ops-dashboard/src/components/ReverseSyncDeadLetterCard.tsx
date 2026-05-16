import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { AlertOctagon, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface DeadLetterRow {
  id: string;
  endpoint: string;
  auditId: string;
  reason: string;
  firstSeenAt: string;
  retryCount: number;
  resolvedAt: string | null;
  lastError: string | null;
}

const ENDPOINT_LABEL: Record<string, string> = {
  "moderation-decisions": "moderation",
  recipes: "recipes",
  products: "products",
};

export function ReverseSyncDeadLetterCard() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const listQuery = useQuery<{ rows: DeadLetterRow[]; total: number }>({
    queryKey: ["ops", "reverse-sync", "dead-letter"],
    queryFn: () =>
      apiFetch("/api/ops/system/reverse-sync/dead-letter?resolved=false&limit=50").then((r) =>
        r.json(),
      ),
    refetchInterval: 60_000,
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/ops/system/reverse-sync/dead-letter/${id}/retry`, {
        method: "POST",
      }).then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? body.message ?? "Retry failed");
        return body as { ok: boolean; resolved: boolean; message: string };
      }),
    onSuccess: (data, id) => {
      toast({
        title: data.resolved ? "Retry resolved" : "Retry still rejected",
        description: data.resolved
          ? `Dead-letter row ${id.slice(0, 8)} accepted by prod.`
          : `${data.message}. retry_count incremented.`,
        variant: data.resolved ? "default" : "destructive",
      });
      qc.invalidateQueries({ queryKey: ["ops", "reverse-sync", "dead-letter"] });
      qc.invalidateQueries({ queryKey: ["ops", "system", "health"] });
    },
    onError: (e: Error) =>
      toast({ title: "Retry failed", description: e.message, variant: "destructive" }),
  });

  const rows = listQuery.data?.rows ?? [];

  return (
    <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <AlertOctagon
          className={cn(
            "w-4 h-4",
            rows.length > 0 ? "text-destructive" : "text-muted-foreground",
          )}
        />
        Reverse Sync — Rejected Pushes
        {rows.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/10 text-destructive">
            {rows.length}
          </span>
        )}
      </h3>
      {listQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No outstanding rejections. Cursor is advancing cleanly.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-dead-letter">
            <thead className="text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left font-medium py-1.5 pr-3">Endpoint</th>
                <th className="text-left font-medium py-1.5 pr-3">Audit</th>
                <th className="text-left font-medium py-1.5 pr-3">Reason</th>
                <th className="text-left font-medium py-1.5 pr-3">First seen</th>
                <th className="text-right font-medium py-1.5 pr-3">Retries</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} data-testid={`row-dead-letter-${r.id}`}>
                  <td className="py-2 pr-3 text-xs">
                    {ENDPOINT_LABEL[r.endpoint] ?? r.endpoint}
                  </td>
                  <td className="py-2 pr-3 text-xs font-mono text-muted-foreground" title={r.auditId}>
                    {r.auditId.slice(0, 8)}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    <span
                      className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-mono"
                      title={r.lastError ?? r.reason}
                    >
                      {r.reason}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {new Date(r.firstSeenAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-xs text-right tabular-nums">{r.retryCount}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => retryMutation.mutate(r.id)}
                      disabled={retryMutation.isPending && retryMutation.variables === r.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-input bg-background text-xs hover:bg-muted disabled:opacity-40"
                      data-testid={`button-retry-${r.id}`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      {retryMutation.isPending && retryMutation.variables === r.id
                        ? "Retrying…"
                        : "Retry"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

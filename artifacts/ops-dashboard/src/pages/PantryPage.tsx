import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { Flag, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function usePantryItems(issue: string, page: number) {
  return useQuery({
    queryKey: ["ops", "pantry", issue, page],
    queryFn: () =>
      apiFetch(`/api/ops/pantry/items?issue=${issue}&page=${page}&limit=50`).then((r) => r.json()),
  });
}

const ISSUE_BADGE: Record<string, string> = {
  missing_quantity: "bg-orange-100 text-orange-700",
  missing_unit: "bg-yellow-100 text-yellow-700",
  stale: "bg-blue-100 text-blue-700",
  duplicate: "bg-purple-100 text-purple-700",
};

export function PantryPage() {
  const [issue, setIssue] = useState("all");
  const [page, setPage] = useState(1);
  const qc = useQueryClient();

  const { data, isLoading } = usePantryItems(issue, page);

  const flagMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiFetch(`/api/ops/pantry/items/${itemId}/flag`, {
        method: "POST",
        body: JSON.stringify({ note: "Flagged by admin" }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "pantry"] }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <PageHeader title="Pantry Ops" description={`${total.toLocaleString()} items`} />

      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          {["all", "missing_quantity", "missing_unit", "stale", "duplicate"].map((opt) => (
            <button
              key={opt}
              onClick={() => { setIssue(opt); setPage(1); }}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                issue === opt
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50"
              )}
            >
              {opt === "all" ? "All items" : opt.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ingredient</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Qty / Unit</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Issues</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Added</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No pantry items found</td>
                </tr>
              ) : (
                items.map((item: { id: string; ingredientId: string; userEmail: string; quantity: number | null; unit: string | null; sourceType: string | null; issues: string[]; addedAt: string }) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{item.ingredientId}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{item.userEmail ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {item.quantity != null ? item.quantity : <span className="text-destructive">—</span>}
                      {" "}
                      {item.unit ?? <span className="text-destructive">no unit</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{item.sourceType ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.issues.map((iss: string) => (
                          <span key={iss} className={cn("px-1.5 py-0.5 rounded text-xs font-medium", ISSUE_BADGE[iss] ?? "bg-muted")}>
                            {iss.replace("_", " ")}
                          </span>
                        ))}
                        {item.issues.length === 0 && <span className="text-emerald-600 text-xs">OK</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {item.addedAt ? new Date(item.addedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => flagMutation.mutate(item.id)}
                        title="Flag for review"
                        className="p-1.5 rounded hover:bg-orange-100 text-muted-foreground hover:text-orange-600 transition-colors"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    </td>
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
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

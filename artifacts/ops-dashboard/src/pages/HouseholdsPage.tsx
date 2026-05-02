import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { Home, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

function useHouseholds(page: number) {
  return useQuery({
    queryKey: ["ops", "households", page],
    queryFn: () => apiFetch(`/api/ops/households?page=${page}&limit=50`).then((r) => r.json()),
  });
}

function useHouseholdMembers(householdId: string | null) {
  return useQuery({
    queryKey: ["ops", "households", "members", householdId],
    queryFn: () => apiFetch(`/api/ops/households/${householdId}/members`).then((r) => r.json()),
    enabled: householdId !== null,
  });
}

export function HouseholdsPage() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");

  const { data, isLoading } = useHouseholds(page);
  const membersQuery = useHouseholdMembers(selectedId);

  const households = data?.households ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div>
      <PageHeader title="Households" description={`${total.toLocaleString()} households • shared pantries and member preferences`} />

      <div className="p-6 space-y-4">
        <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Household</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Owner</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Members</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <tr key={i}>{Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>)
              ) : households.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No households</td></tr>
              ) : (
                households.map((h: { id: string; name: string; ownerEmail: string | null; ownerUserId: string; memberCount: number; createdAt: string; updatedAt: string }) => (
                  <tr key={h.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center text-primary"><Home className="w-3.5 h-3.5" /></div>
                        <div>
                          <p className="font-medium">{h.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{h.id.slice(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{h.ownerEmail ?? <span className="font-mono">{h.ownerUserId.slice(0, 8)}</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{h.memberCount}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(h.updatedAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setSelectedId(h.id); setSelectedName(h.name); }} className="text-xs text-primary hover:underline">Members</button>
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
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {selectedId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={() => setSelectedId(null)}>
          <div className="bg-card border border-card-border rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card">
              <h2 className="text-lg font-semibold">{selectedName}</h2>
              <button onClick={() => setSelectedId(null)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-3">
              {membersQuery.isLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}</div>
              ) : (membersQuery.data?.members ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">No members</p>
              ) : (
                (membersQuery.data?.members ?? []).map((m: { id: string; displayName: string; ageGroup: string; allergies: string[]; allergyGroups: string[]; dislikedIngredients: string[]; dietaryRestrictions: string[]; notes: string | null; isPrimary: boolean }) => (
                  <div key={m.id} className="border border-border rounded-md p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{m.displayName}</h3>
                        {m.isPrimary && <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">primary</span>}
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">{m.ageGroup}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <TagList label="Allergies" items={m.allergies} className="text-destructive" />
                      <TagList label="Allergy groups" items={m.allergyGroups} className="text-destructive" />
                      <TagList label="Dislikes" items={m.dislikedIngredients} className="text-orange-600" />
                      <TagList label="Dietary" items={m.dietaryRestrictions} className="text-blue-600" />
                    </div>
                    {m.notes && <p className="text-xs text-muted-foreground mt-2 italic">"{m.notes}"</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TagList({ label, items, className }: { label: string; items: string[]; className?: string }) {
  return (
    <div>
      <p className="text-muted-foreground mb-1">{label}</p>
      {items.length === 0 ? (
        <p className="text-muted-foreground italic">none</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map((it) => (
            <span key={it} className={cn("px-1.5 py-0.5 rounded bg-muted font-medium", className)}>{it}</span>
          ))}
        </div>
      )}
    </div>
  );
}

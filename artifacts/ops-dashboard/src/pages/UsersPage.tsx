import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/query-client";
import { PageHeader } from "@/components/ui/page-header";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserDetailDrawer } from "@/components/UserDetailDrawer";
import { useToast } from "@/hooks/use-toast";
import { ExportMenu } from "@/components/ExportMenu";
import { SortableHeader } from "@/components/SortableHeader";
import { useSort } from "@/hooks/useSort";

interface UserRow {
  id: string;
  email: string;
  username: string;
  role: string;
  provider: string;
  isGuest: boolean;
  pantryCount: number;
  cookSessionCount: number;
  createdAt: string;
}

function useUsers(q: string, page: number, role: string, sortQs: string) {
  return useQuery({
    queryKey: ["ops", "users", q, page, role, sortQs],
    queryFn: () =>
      apiFetch(
        `/api/ops/users?q=${encodeURIComponent(q)}&page=${page}&limit=50${role ? `&role=${role}` : ""}${sortQs}`
      ).then((r) => r.json()),
  });
}

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-primary/10 text-primary",
  read_only_admin: "bg-blue-100 text-blue-700",
  user: "bg-muted text-muted-foreground",
};

const ROLE_OPTIONS = ["user", "read_only_admin", "admin"] as const;

export function UsersPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [openUser, setOpenUser] = useState<UserRow | null>(null);
  const { sort, setSort, qs: sortQs } = useSort();
  const qc = useQueryClient();
  const { toast } = useToast();

  const exportPath = `/api/ops/users?q=${encodeURIComponent(search)}${role ? `&role=${role}` : ""}&limit=5000${sortQs}`;
  const exportStem = `users-${new Date().toISOString().slice(0, 10)}`;

  const { data, isLoading } = useUsers(search, page, role, sortQs);

  const setRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiFetch(`/api/ops/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "users"] }),
    onError: (e: Error) =>
      toast({ title: "Role update failed", description: e.message, variant: "destructive" }),
  });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <PageHeader
        title="Users"
        description={`${total.toLocaleString()} total users`}
        actions={<ExportMenu path={exportPath} filenameStem={exportStem} testId="button-export-csv" />}
      />

      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setSearch(q); setPage(1); }}}
              placeholder="Search by email or username…"
              className="w-full pl-9 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={role}
            onChange={(e) => { setRole(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All roles</option>
            <option value="user">User</option>
            <option value="read_only_admin">Read-only admin</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <SortableHeader col="email" active={sort} onChange={(s) => { setSort(s); setPage(1); }} defaultDir="asc">User</SortableHeader>
                <SortableHeader col="role" active={sort} onChange={(s) => { setSort(s); setPage(1); }} defaultDir="asc">Role</SortableHeader>
                <SortableHeader col="provider" active={sort} onChange={(s) => { setSort(s); setPage(1); }} defaultDir="asc">Provider</SortableHeader>
                <SortableHeader col="pantryCount" active={sort} onChange={(s) => { setSort(s); setPage(1); }} align="right">Pantry</SortableHeader>
                <SortableHeader col="cookSessionCount" active={sort} onChange={(s) => { setSort(s); setPage(1); }} align="right">Cook Sessions</SortableHeader>
                <SortableHeader col="createdAt" active={sort} onChange={(s) => { setSort(s); setPage(1); }}>Joined</SortableHeader>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((u: UserRow) => (
                  <tr
                    key={u.id}
                    onClick={() => setOpenUser(u)}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    data-testid={`row-user-${u.id}`}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-foreground">{u.username}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", ROLE_BADGE[u.role] ?? "bg-muted text-muted-foreground")}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.isGuest ? "guest" : (u.provider ?? "email")}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{u.pantryCount ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{u.cookSessionCount ?? 0}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={u.role}
                        onChange={(e) => setRoleMutation.mutate({ userId: u.id, role: e.target.value })}
                        disabled={setRoleMutation.isPending}
                        title="Change role"
                        className="px-2 py-1 rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                        data-testid={`select-role-${u.id}`}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                        {!ROLE_OPTIONS.includes(u.role as typeof ROLE_OPTIONS[number]) && (
                          <option value={u.role}>{u.role}</option>
                        )}
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">Page {page} of {totalPages} • {total.toLocaleString()} users</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      <UserDetailDrawer user={openUser} onClose={() => setOpenUser(null)} />
    </div>
  );
}

import "./_group.css";
import { useState } from "react";
import {
  CheckCircle, XCircle, ChevronLeft, ChevronRight, Search, Eye,
  ExternalLink, AlertTriangle, Wand2, ArrowUp, ArrowDown,
} from "lucide-react";
import { MOCK_ROWS, FACETS, type StagingRow } from "./_data";

function cn(...cls: (string | false | null | undefined)[]) {
  return cls.filter(Boolean).join(" ");
}

const STATUS_BADGE: Record<string, string> = {
  imported: "bg-blue-100 text-blue-700",
  ready: "bg-emerald-100 text-emerald-700",
  needs_review: "bg-orange-100 text-orange-700",
  promoted: "bg-purple-100 text-purple-700",
  rejected: "bg-red-100 text-red-700",
};

function MappingPill({ rate }: { rate: number | null | undefined }) {
  if (rate == null) return <span className="text-[hsl(var(--muted-foreground))] text-xs">—</span>;
  const pct = Math.round(rate * 100);
  const color =
    pct >= 80 ? "bg-emerald-100 text-emerald-700"
    : pct >= 50 ? "bg-yellow-100 text-yellow-700"
    : "bg-red-100 text-red-700";
  return <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium tabular-nums", color)}>{pct}%</span>;
}

function SortableHeader({ children, active, dir, onClick, align }: {
  children: React.ReactNode; active: boolean; dir: "asc" | "desc"; onClick: () => void; align?: "right";
}) {
  return (
    <th className={cn("px-4 py-3 text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))] cursor-pointer select-none hover:text-[hsl(var(--foreground))]", align === "right" ? "text-right" : "text-left")} onClick={onClick}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active && (dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </span>
    </th>
  );
}

function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]">
      <div>
        <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">{title}</h1>
        {description && <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 mt-1">{actions}</div>}
    </div>
  );
}

function StagingDetailDrawer({ row, onClose }: { row: StagingRow | null; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);
  if (!row) return null;
  const isFinal = ["promoted", "rejected"].includes(row.status);
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-[640px] max-w-[90vw] bg-[hsl(var(--card))] border-l border-[hsl(var(--border))] shadow-xl overflow-y-auto">
        <div className="px-6 py-5 border-b border-[hsl(var(--border))] sticky top-0 bg-[hsl(var(--card))] z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))] mb-1">{row.source} · {row.sourceRecipeId}</p>
              <h2 className="text-lg font-semibold leading-tight">{row.title}</h2>
              <div className="flex items-center gap-2 mt-2">
                <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", STATUS_BADGE[row.status] ?? "bg-[hsl(var(--muted))]")}>{row.status}</span>
                <MappingPill rate={row.mappingRate} />
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><XCircle className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="p-6 space-y-5">
          {row.imageUrl && <img src={row.imageUrl} alt={row.title} className="w-full max-h-56 object-cover rounded-md border border-[hsl(var(--border))]" />}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-xs text-[hsl(var(--muted-foreground))]">Mapped</p><p className="font-medium tabular-nums">{row.mappedIngredientCount}</p></div>
            <div><p className="text-xs text-[hsl(var(--muted-foreground))]">Unmapped</p><p className={cn("font-medium tabular-nums", row.unmappedIngredientNames.length > 0 && "text-orange-600")}>{row.unmappedIngredientNames.length}</p></div>
            <div><p className="text-xs text-[hsl(var(--muted-foreground))]">Time</p><p className="font-medium tabular-nums">{row.estimatedTimeMin ? `${row.estimatedTimeMin}m` : "—"}</p></div>
          </div>
          {row.unmappedIngredientNames.length > 0 && (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-3">
              <p className="text-xs font-medium text-orange-900 mb-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{row.unmappedIngredientNames.length} ingredient(s) won't map to your products catalog</p>
              <ul className="text-xs text-orange-900 list-disc pl-5 space-y-0.5">
                {(showAll ? row.unmappedIngredientNames : row.unmappedIngredientNames.slice(0, 12)).map((n) => <li key={n}>{n}</li>)}
              </ul>
              {row.unmappedIngredientNames.length > 12 && (
                <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-medium text-orange-800 hover:text-orange-900 hover:underline">{showAll ? "Show fewer" : `Show all ${row.unmappedIngredientNames.length}`}</button>
              )}
            </div>
          )}
          {row.cuisineTags.length > 0 && (
            <div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Cuisine</p>
              <div className="flex flex-wrap gap-1">{row.cuisineTags.map((c) => <span key={c} className="px-1.5 py-0.5 rounded bg-[hsl(var(--muted))] text-xs">{c}</span>)}</div>
            </div>
          )}
          {row.instructionsSummary && (
            <div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">Instructions</p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed text-[hsl(var(--foreground))]/90">{row.instructionsSummary}</p>
            </div>
          )}
          {!isFinal && (
            <div className="border-t border-[hsl(var(--border))] pt-4 space-y-3">
              <div>
                <label className="text-xs text-[hsl(var(--muted-foreground))] block mb-1">Decision note (optional)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why are you promoting / rejecting this?" rows={2} className="w-full px-3 py-2 text-sm rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] focus:outline-none" />
              </div>
              <div className="flex gap-2">
                <button className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"><CheckCircle className="w-4 h-4" /> Promote to recipes</button>
                <button className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-red-300 text-red-600 hover:bg-red-50"><XCircle className="w-4 h-4" /> Reject</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Current() {
  const [status, setStatus] = useState("pending");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "createdAt", dir: "desc" });

  const FILTER_LABELS: Record<string, string> = {
    pending: "In queue", imported: "Imported", ready: "Ready",
    needs_review: "Needs review", promoted: "Promoted", rejected: "Rejected", all: "All",
  };

  const filtered = MOCK_ROWS.filter((r) => {
    if (status === "pending") {
      if (!["imported", "ready", "needs_review"].includes(r.status)) return false;
    } else if (status !== "all" && r.status !== status) return false;
    if (source && r.source !== source) return false;
    if (q && !r.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const openRow = filtered.find((r) => r.id === openId) ?? null;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <PageHeader
        title="Recipe Staging"
        description="Imports from TheMealDB / Wikibooks waiting to be promoted into the catalog"
        actions={
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-[hsl(var(--input))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted))]">
            <Wand2 className="w-4 h-4" /> Re-map ingredients
          </button>
        }
      />
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {["pending", "imported", "ready", "needs_review", "promoted", "rejected", "all"].map((s) => {
            const facet = FACETS.statuses.find((f) => f.status === s);
            const pendingTotal = s === "pending" ? FACETS.statuses.filter((f) => ["imported", "ready", "needs_review"].includes(f.status)).reduce((sum, f) => sum + f.count, 0) : null;
            const allTotal = s === "all" ? FACETS.statuses.reduce((sum, f) => sum + f.count, 0) : null;
            const count = pendingTotal ?? allTotal ?? facet?.count ?? 0;
            return (
              <button key={s} onClick={() => setStatus(s)} className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors", status === s ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]" : "bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50")}>
                {FILTER_LABELS[s] ?? s} <span className="opacity-60 tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title…" className="w-full pl-9 pr-4 py-2 rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-sm focus:outline-none" />
          </div>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="px-3 py-2 rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-sm focus:outline-none">
            <option value="">All sources</option>
            {FACETS.sources.map((s) => <option key={s.source} value={s.source}>{s.source} ({s.count})</option>)}
          </select>
        </div>

        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--card-border))] rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--muted))]/50 border-b border-[hsl(var(--border))]">
              <tr>
                <SortableHeader active={sort.col === "title"} dir={sort.dir} onClick={() => setSort({ col: "title", dir: sort.dir === "asc" ? "desc" : "asc" })}>Title</SortableHeader>
                <SortableHeader active={sort.col === "source"} dir={sort.dir} onClick={() => setSort({ col: "source", dir: sort.dir === "asc" ? "desc" : "asc" })}>Source</SortableHeader>
                <SortableHeader active={sort.col === "status"} dir={sort.dir} onClick={() => setSort({ col: "status", dir: sort.dir === "asc" ? "desc" : "asc" })}>Status</SortableHeader>
                <SortableHeader active={sort.col === "mappingRate"} dir={sort.dir} onClick={() => setSort({ col: "mappingRate", dir: sort.dir === "asc" ? "desc" : "asc" })} align="right">Mapping</SortableHeader>
                <SortableHeader active={sort.col === "unmappedCount"} dir={sort.dir} onClick={() => setSort({ col: "unmappedCount", dir: sort.dir === "asc" ? "desc" : "asc" })} align="right">Unmapped</SortableHeader>
                <SortableHeader active={sort.col === "createdAt"} dir={sort.dir} onClick={() => setSort({ col: "createdAt", dir: sort.dir === "asc" ? "desc" : "asc" })}>Imported</SortableHeader>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-[hsl(var(--muted-foreground))]">Nothing in {status}</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} onClick={() => setOpenId(r.id)} className="hover:bg-[hsl(var(--muted))]/30 transition-colors cursor-pointer">
                  <td className="px-4 py-3 font-medium text-[hsl(var(--foreground))] max-w-md truncate">{r.title}</td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] text-xs">{r.source}</td>
                  <td className="px-4 py-3"><span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", STATUS_BADGE[r.status] ?? "bg-[hsl(var(--muted))]")}>{r.status}</span></td>
                  <td className="px-4 py-3 text-right"><MappingPill rate={r.mappingRate} /></td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs"><span className={r.unmappedIngredientNames.length > 0 ? "text-orange-600" : "text-[hsl(var(--muted-foreground))]"}>{r.unmappedIngredientNames.length}</span></td>
                  <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3"><button className="p-1.5 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><Eye className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <p className="text-[hsl(var(--muted-foreground))]">Page 1 of 1 · {filtered.length} total</p>
          <div className="flex gap-2">
            <button disabled className="p-1.5 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <button disabled className="p-1.5 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      <StagingDetailDrawer row={openRow} onClose={() => setOpenId(null)} />
    </div>
  );
}

import "./_group.css";
import React, { useState, useMemo } from "react";
import {
  CheckCircle,
  XCircle,
  Search,
  Eye,
  AlertTriangle,
  Wand2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Inbox,
  Filter,
  Image as ImageIcon,
  Clock,
  BookOpen
} from "lucide-react";
import { MOCK_ROWS, FACETS, type StagingRow } from "./_data";
import { cn } from "@/lib/utils";

// Helper components

function StatusBadge({ status }: { status: StagingRow["status"] }) {
  const styles = {
    imported: "bg-blue-100 text-blue-700 border-blue-200",
    ready: "bg-emerald-100 text-emerald-700 border-emerald-200",
    needs_review: "bg-amber-100 text-amber-700 border-amber-200",
    promoted: "bg-purple-100 text-purple-700 border-purple-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
  };
  
  const labels = {
    imported: "Imported",
    ready: "Ready",
    needs_review: "Needs Review",
    promoted: "Promoted",
    rejected: "Rejected",
  };

  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border", styles[status] || "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]")}>
      {labels[status]}
    </span>
  );
}

function MappingQualityBar({ rate, unmappedCount, mappedCount }: { rate: number | null, unmappedCount: number, mappedCount: number }) {
  const total = unmappedCount + mappedCount;
  if (total === 0 || rate === null) {
    return <div className="h-1.5 w-full bg-[hsl(var(--muted))] rounded-full overflow-hidden" />;
  }
  
  const pct = Math.round((mappedCount / total) * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  
  return (
    <div className="w-full flex items-center gap-2">
      <div className="h-1.5 flex-1 bg-[hsl(var(--muted))] rounded-full overflow-hidden flex">
        <div className={cn("h-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums text-[hsl(var(--muted-foreground))] w-8 text-right">{pct}%</span>
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
      <div className="flex-1 bg-[hsl(var(--foreground))]/20 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="w-[640px] max-w-[90vw] bg-[hsl(var(--card))] border-l border-[hsl(var(--border))] shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200">
        <div className="px-6 py-5 border-b border-[hsl(var(--border))] sticky top-0 bg-[hsl(var(--card))]/95 backdrop-blur z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{row.source} · {row.sourceRecipeId}</p>
                <StatusBadge status={row.status} />
              </div>
              <h2 className="text-xl font-bold leading-tight text-[hsl(var(--foreground))]">{row.title}</h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] transition-colors">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {row.imageUrl ? (
            <img src={row.imageUrl} alt={row.title} className="w-full h-64 object-cover rounded-xl border border-[hsl(var(--border))] shadow-sm" />
          ) : (
            <div className="w-full h-64 rounded-xl border border-[hsl(var(--border))] bg-gradient-to-br from-[hsl(var(--muted))] to-[hsl(var(--secondary))] flex items-center justify-center shadow-sm">
              <ImageIcon className="w-12 h-12 text-[hsl(var(--muted-foreground))]/40" />
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[hsl(var(--muted))]/50 border border-[hsl(var(--border))]">
              <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-1">Mapped</p>
              <p className="text-2xl font-bold tabular-nums text-[hsl(var(--foreground))]">{row.mappedIngredientCount}</p>
            </div>
            <div className={cn("p-4 rounded-xl border", row.unmappedIngredientNames.length > 0 ? "bg-amber-50 border-amber-200" : "bg-[hsl(var(--muted))]/50 border-[hsl(var(--border))]")}>
              <p className={cn("text-xs font-medium uppercase tracking-wide mb-1", row.unmappedIngredientNames.length > 0 ? "text-amber-800" : "text-[hsl(var(--muted-foreground))]")}>Unmapped</p>
              <p className={cn("text-2xl font-bold tabular-nums", row.unmappedIngredientNames.length > 0 ? "text-amber-900" : "text-[hsl(var(--foreground))]")}>{row.unmappedIngredientNames.length}</p>
            </div>
            <div className="p-4 rounded-xl bg-[hsl(var(--muted))]/50 border border-[hsl(var(--border))]">
              <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-1">Est. Time</p>
              <p className="text-2xl font-bold tabular-nums text-[hsl(var(--foreground))]">{row.estimatedTimeMin ? `${row.estimatedTimeMin}m` : "—"}</p>
            </div>
          </div>
          
          {row.unmappedIngredientNames.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
              <h3 className="text-sm font-semibold text-amber-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                {row.unmappedIngredientNames.length} unmapped ingredients
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {(showAll ? row.unmappedIngredientNames : row.unmappedIngredientNames.slice(0, 12)).map((n) => (
                  <span key={n} className="inline-flex px-2 py-1 rounded-md bg-amber-100/80 text-amber-800 border border-amber-200/50 text-xs font-medium">
                    {n}
                  </span>
                ))}
              </div>
              {row.unmappedIngredientNames.length > 12 && (
                <button onClick={() => setShowAll((v) => !v)} className="mt-3 text-xs font-semibold text-amber-700 hover:text-amber-900 hover:underline">
                  {showAll ? "Show fewer" : `+ ${row.unmappedIngredientNames.length - 12} more`}
                </button>
              )}
            </div>
          )}
          
          {row.cuisineTags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-2 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                Tags & Metadata
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {row.cuisineTags.map((c) => (
                  <span key={c} className="px-2.5 py-1 rounded-md bg-[hsl(var(--muted))] border border-[hsl(var(--border))] text-xs font-medium text-[hsl(var(--foreground))]">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {row.instructionsSummary && (
            <div className="pt-2">
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-2">Instructions Summary</h3>
              <div className="p-4 rounded-xl bg-[hsl(var(--muted))]/30 border border-[hsl(var(--border))]">
                <p className="text-sm leading-relaxed text-[hsl(var(--foreground))]/80">{row.instructionsSummary}</p>
              </div>
            </div>
          )}
          
          {!isFinal && (
            <div className="pt-6 border-t border-[hsl(var(--border))] space-y-4">
              <div>
                <label className="text-sm font-medium text-[hsl(var(--foreground))] block mb-1.5">Decision Note</label>
                <textarea 
                  value={note} 
                  onChange={(e) => setNote(e.target.value)} 
                  placeholder="Optional context for promotion or rejection..." 
                  rows={2} 
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20" 
                />
              </div>
              <div className="flex gap-3">
                <button className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors">
                  <CheckCircle2 className="w-4 h-4" /> 
                  Promote to Catalog
                </button>
                <button className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-white text-red-600 border border-red-200 hover:bg-red-50 shadow-sm transition-colors">
                  <XCircle className="w-4 h-4" /> 
                  Reject Recipe
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PriorityInbox() {
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  
  // Section toggle states
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    ready: true,
    new: false,
    archived: true
  });

  const toggleSection = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredRows = useMemo(() => {
    return MOCK_ROWS.filter(r => {
      if (source && r.source !== source) return false;
      if (q && !r.title.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [q, source]);

  const needsReviewRows = filteredRows.filter(r => r.status === "needs_review");
  const readyRows = filteredRows.filter(r => r.status === "ready");
  const newRows = filteredRows.filter(r => r.status === "imported");
  const archivedRows = filteredRows.filter(r => ["promoted", "rejected"].includes(r.status));

  const openRow = MOCK_ROWS.find((r) => r.id === openId) ?? null;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[hsl(var(--background))]/90 backdrop-blur-md border-b border-[hsl(var(--border))]">
        <div className="max-w-6xl mx-auto px-6 pt-6 pb-4">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))] flex items-center gap-2">
                <Inbox className="w-6 h-6 text-[hsl(var(--primary))]" />
                Priority Inbox
              </h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Triage imported recipes before they hit the live catalog.</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-[hsl(var(--input))] bg-[hsl(var(--card))] shadow-sm hover:bg-[hsl(var(--muted))] transition-colors">
                <Wand2 className="w-4 h-4 text-[hsl(var(--primary))]" /> Re-map ingredients
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <input 
                type="search" 
                value={q} 
                onChange={(e) => setQ(e.target.value)} 
                placeholder="Filter by title..." 
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20" 
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <select 
                value={source} 
                onChange={(e) => setSource(e.target.value)} 
                className="pl-9 pr-8 py-2 rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] text-sm shadow-sm focus:outline-none appearance-none cursor-pointer font-medium text-[hsl(var(--foreground))]"
              >
                <option value="">All Sources</option>
                {FACETS.sources.map((s) => <option key={s.source} value={s.source}>{s.source} ({s.count})</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-8 space-y-10">
        
        {/* Needs Review Section (Heavy weight) */}
        {needsReviewRows.length > 0 && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-amber-900 flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-sm">!</span>
                  Needs Your Eye
                </h2>
                <p className="text-sm text-amber-700/80 mt-0.5">Low mapping confidence or missing data. Review required.</p>
              </div>
            </div>
            <div className="grid gap-3">
              {needsReviewRows.map(row => (
                <div 
                  key={row.id}
                  onClick={() => setOpenId(row.id)}
                  className="group relative flex flex-col sm:flex-row gap-4 p-4 rounded-xl bg-white border border-amber-200 shadow-sm hover:shadow-md hover:border-amber-300 transition-all cursor-pointer overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400" />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">{row.source}</span>
                        <span className="text-[hsl(var(--muted-foreground))] text-xs">•</span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {new Date(row.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity text-amber-700 hover:text-amber-900 bg-amber-50 p-1.5 rounded-md text-xs font-medium flex items-center gap-1">
                        Review <Eye className="w-3 h-3" />
                      </button>
                    </div>
                    
                    <h3 className="text-lg font-bold text-[hsl(var(--foreground))] truncate mb-3">{row.title}</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">Ingredient Mapping</p>
                        <MappingQualityBar 
                          rate={row.mappingRate} 
                          mappedCount={row.mappedIngredientCount} 
                          unmappedCount={row.unmappedIngredientNames.length} 
                        />
                      </div>
                      {row.unmappedIngredientNames.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">Unmapped ({row.unmappedIngredientNames.length})</p>
                          <div className="flex flex-wrap gap-1.5 max-h-16 overflow-hidden">
                            {row.unmappedIngredientNames.slice(0, 5).map(name => (
                              <span key={name} className="px-2 py-0.5 bg-amber-50 border border-amber-100 text-amber-800 rounded text-xs truncate max-w-[120px]">
                                {name}
                              </span>
                            ))}
                            {row.unmappedIngredientNames.length > 5 && (
                              <span className="px-2 py-0.5 bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] rounded text-xs">
                                +{row.unmappedIngredientNames.length - 5}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Ready to Promote (Collapsible) */}
        {readyRows.length > 0 && (
          <section className="bg-emerald-50/50 rounded-2xl border border-emerald-100 overflow-hidden transition-all">
            <div 
              className={cn("px-5 py-4 flex items-center justify-between cursor-pointer select-none hover:bg-emerald-50 transition-colors", !collapsed.ready && "border-b border-emerald-100")}
              onClick={() => toggleSection("ready")}
            >
              <div className="flex items-center gap-3">
                <button className="p-1 rounded hover:bg-emerald-100/50 text-emerald-700">
                  {collapsed.ready ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
                <div>
                  <h2 className="text-lg font-bold text-emerald-900">Ready to Promote</h2>
                  <p className="text-sm text-emerald-700/80">High mapping rate. Safe to batch process.</p>
                </div>
                <span className="ml-2 px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-800 text-sm font-bold tabular-nums">
                  {readyRows.length}
                </span>
              </div>
              <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                {collapsed.ready && readyRows.length > 0 && (
                  <div className="hidden sm:flex -space-x-2 mr-2">
                    {readyRows.slice(0, 5).map(r => (
                      <div key={r.id} className="w-8 h-8 rounded-full border-2 border-emerald-50 bg-emerald-100 overflow-hidden shrink-0 shadow-sm relative z-0">
                        {r.imageUrl ? (
                          <img src={r.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-emerald-600 bg-emerald-100">
                            {r.title.charAt(0)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors">
                  <CheckCircle2 className="w-4 h-4" /> Promote All
                </button>
              </div>
            </div>
            
            {!collapsed.ready && (
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {readyRows.map(row => (
                    <div 
                      key={row.id} 
                      onClick={() => setOpenId(row.id)}
                      className="group flex gap-3 p-3 bg-white rounded-xl border border-emerald-100 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-emerald-50 border border-emerald-100/50">
                        {row.imageUrl ? (
                          <img src={row.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-emerald-200" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 py-0.5">
                        <h4 className="text-sm font-bold text-[hsl(var(--foreground))] truncate mb-1">{row.title}</h4>
                        <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                          <span className="font-medium text-emerald-700 bg-emerald-50 px-1.5 rounded">{row.mappedIngredientCount} mapped</span>
                          <span>•</span>
                          <span>{row.source}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* New Imports Section */}
        {newRows.length > 0 && (
          <section>
            <div 
              className="mb-4 flex items-center justify-between cursor-pointer select-none"
              onClick={() => toggleSection("new")}
            >
              <div className="flex items-center gap-2 text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] transition-colors">
                {collapsed.new ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                <h2 className="text-lg font-bold">New Imports</h2>
                <span className="px-2 py-0.5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] text-sm font-medium tabular-nums ml-1">
                  {newRows.length}
                </span>
              </div>
            </div>
            
            {!collapsed.new && (
              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[hsl(var(--muted))]/30 border-b border-[hsl(var(--border))]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Recipe</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Source</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] w-48">Mapping</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Imported</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--border))]">
                    {newRows.map(row => (
                      <tr 
                        key={row.id} 
                        onClick={() => setOpenId(row.id)}
                        className="hover:bg-[hsl(var(--muted))]/30 transition-colors cursor-pointer group"
                      >
                        <td className="px-4 py-3 font-medium text-[hsl(var(--foreground))] max-w-[200px] truncate">{row.title}</td>
                        <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] text-xs">{row.source}</td>
                        <td className="px-4 py-3">
                          <MappingQualityBar 
                            rate={row.mappingRate} 
                            mappedCount={row.mappedIngredientCount} 
                            unmappedCount={row.unmappedIngredientNames.length} 
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-[hsl(var(--muted-foreground))] text-xs">{new Date(row.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] transition-all">
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        
        {/* Recently Archived Section */}
        {archivedRows.length > 0 && (
          <section className="pt-8 border-t border-[hsl(var(--border))]">
            <div 
              className="flex items-center gap-2 cursor-pointer select-none text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors w-fit"
              onClick={() => toggleSection("archived")}
            >
              {collapsed.archived ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <h2 className="text-sm font-semibold uppercase tracking-wider">Recently Processed ({archivedRows.length})</h2>
            </div>
            
            {!collapsed.archived && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {archivedRows.map(row => (
                  <div key={row.id} onClick={() => setOpenId(row.id)} className="flex items-center gap-3 p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 hover:bg-[hsl(var(--card))] cursor-pointer transition-colors opacity-75 hover:opacity-100">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", row.status === "promoted" ? "bg-purple-500" : "bg-red-500")} />
                    <span className="text-sm font-medium truncate flex-1">{row.title}</span>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">{new Date(row.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

      </div>
      
      <StagingDetailDrawer row={openRow} onClose={() => setOpenId(null)} />
    </div>
  );
}

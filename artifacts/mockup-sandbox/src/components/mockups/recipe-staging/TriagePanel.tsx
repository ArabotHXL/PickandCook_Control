import React, { useState } from "react";
import "./_group.css";
import {
  CheckCircle,
  XCircle,
  Search,
  ExternalLink,
  AlertTriangle,
  Wand2,
  ListFilter,
  Check,
  X,
  Keyboard,
  Clock,
  BookOpen,
  Image as ImageIcon,
  ChevronRight,
  Filter
} from "lucide-react";
import { MOCK_ROWS, FACETS, type StagingRow } from "./_data";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const STATUS_BADGE: Record<string, string> = {
  imported: "bg-blue-100 text-blue-700 border-blue-200",
  ready: "bg-emerald-100 text-emerald-700 border-emerald-200",
  needs_review: "bg-orange-100 text-orange-700 border-orange-200",
  promoted: "bg-purple-100 text-purple-700 border-purple-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

function MappingSwatch({ rate }: { rate: number | null | undefined }) {
  if (rate == null) return <div className="w-2 h-full bg-[hsl(var(--muted))] shrink-0" />;
  const pct = Math.round(rate * 100);
  const colorClass =
    pct >= 80 ? "bg-emerald-500"
    : pct >= 50 ? "bg-yellow-500"
    : "bg-red-500";
  return <div className={cn("w-2 h-full shrink-0", colorClass)} />;
}

function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] shrink-0">
      <div>
        <h1 className="text-lg font-semibold text-[hsl(var(--foreground))]">{title}</h1>
        {description && <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-medium font-mono text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded uppercase shadow-sm">
      {children}
    </kbd>
  );
}

export function TriagePanel() {
  const [status, setStatus] = useState("pending");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(MOCK_ROWS.find(r => ["imported", "ready", "needs_review"].includes(r.status))?.id ?? null);
  const [note, setNote] = useState("");
  const [mockStatuses, setMockStatuses] = useState<Record<string, string>>({});

  const FILTER_LABELS: Record<string, string> = {
    pending: "In queue", imported: "Imported", ready: "Ready",
    needs_review: "Needs review", promoted: "Promoted", rejected: "Rejected", all: "All",
  };

  const filtered = MOCK_ROWS.map(r => ({ ...r, status: mockStatuses[r.id] ?? r.status as any })).filter((r) => {
    if (status === "pending") {
      if (!["imported", "ready", "needs_review"].includes(r.status)) return false;
    } else if (status !== "all" && r.status !== status) return false;
    if (source && r.source !== source) return false;
    if (q && !r.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const openRow = filtered.find((r) => r.id === openId) ?? null;
  const isFinal = openRow ? ["promoted", "rejected"].includes(openRow.status) : false;

  const handleAction = (action: "promoted" | "rejected") => {
    if (!openRow) return;
    setMockStatuses(prev => ({ ...prev, [openRow.id]: action }));
    setNote("");
    
    // Move to next
    const currentIndex = filtered.findIndex(r => r.id === openRow.id);
    if (currentIndex >= 0 && currentIndex < filtered.length - 1) {
      setOpenId(filtered[currentIndex + 1].id);
    } else {
      setOpenId(null);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] min-h-[900px] w-full bg-[hsl(var(--background))] text-[hsl(var(--foreground))] overflow-hidden">
      <PageHeader
        title="Recipe Staging"
        description="Imports from TheMealDB / Wikibooks waiting to be promoted into the catalog"
        actions={
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-[hsl(var(--input))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] transition-colors shadow-sm">
            <Wand2 className="w-4 h-4" /> Re-map ingredients
          </button>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane: Queue */}
        <div className="w-[420px] flex flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] z-10 shrink-0 shadow-[1px_0_10px_rgba(0,0,0,0.02)]">
          
          <div className="p-3 border-b border-[hsl(var(--border))] space-y-3 bg-[hsl(var(--card))] shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <input 
                type="search" 
                value={q} 
                onChange={(e) => setQ(e.target.value)} 
                placeholder="Search queue…" 
                className="w-full pl-8 pr-3 py-1.5 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] transition-shadow" 
              />
            </div>
            
            <div className="flex items-center gap-2">
               <select 
                value={status} 
                onChange={(e) => setStatus(e.target.value)} 
                className="flex-1 px-2 py-1.5 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-xs focus:outline-none text-[hsl(var(--foreground))]"
              >
                {["pending", "imported", "ready", "needs_review", "promoted", "rejected", "all"].map(s => (
                  <option key={s} value={s}>{FILTER_LABELS[s]}</option>
                ))}
              </select>
              <select 
                value={source} 
                onChange={(e) => setSource(e.target.value)} 
                className="flex-1 px-2 py-1.5 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-xs focus:outline-none text-[hsl(var(--foreground))]"
              >
                <option value="">All sources</option>
                {FACETS.sources.map((s) => <option key={s.source} value={s.source}>{s.source}</option>)}
              </select>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="divide-y divide-[hsl(var(--border))]/50">
              {filtered.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">Empty queue</div>
              ) : filtered.map((r) => {
                const isSelected = openId === r.id;
                return (
                  <div 
                    key={r.id} 
                    onClick={() => setOpenId(r.id)} 
                    className={cn(
                      "group flex cursor-pointer transition-colors border-l-[3px]",
                      isSelected 
                        ? "bg-[hsl(var(--primary))]/5 border-l-[hsl(var(--primary))]" 
                        : "hover:bg-[hsl(var(--muted))]/50 border-l-transparent"
                    )}
                  >
                    <MappingSwatch rate={r.mappingRate} />
                    <div className="flex-1 p-3 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                         <span className="text-[10px] uppercase font-semibold tracking-wider text-[hsl(var(--muted-foreground))]">{r.source}</span>
                         <span className="text-xs font-medium tabular-nums opacity-60">
                           {r.mappingRate != null ? `${Math.round(r.mappingRate * 100)}%` : "—"}
                         </span>
                      </div>
                      <h3 className={cn("text-sm font-medium leading-tight truncate", isSelected ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--foreground))]")}>
                        {r.title}
                      </h3>
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border", STATUS_BADGE[r.status] ?? "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-transparent")}>
                          {r.status}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                           {r.unmappedIngredientNames.length > 0 && (
                             <span className="flex items-center gap-1 text-orange-600 font-medium">
                               <AlertTriangle className="w-3 h-3" /> {r.unmappedIngredientNames.length}
                             </span>
                           )}
                           <span>{new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Right Pane: Detail */}
        <div className="flex-1 flex flex-col bg-[hsl(var(--background))] relative overflow-hidden">
          {!openRow ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[hsl(var(--muted-foreground))] space-y-4">
              <div className="w-16 h-16 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-[hsl(var(--muted-foreground))]/50" />
              </div>
              <div className="text-center">
                <p className="font-medium text-[hsl(var(--foreground))]">Queue complete</p>
                <p className="text-sm mt-1">{filtered.length} recipes remaining</p>
              </div>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 px-8 py-8">
                <div className="max-w-3xl mx-auto space-y-8 pb-32">
                  
                  {/* Header */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                      <span className="uppercase tracking-wider font-semibold text-[10px] bg-[hsl(var(--muted))] px-2 py-0.5 rounded">{openRow.source}</span>
                      <span>ID: <span className="font-mono text-xs">{openRow.sourceRecipeId}</span></span>
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] leading-tight">
                      {openRow.title}
                    </h2>
                    <div className="flex items-center gap-3">
                      <span className={cn("px-2 py-1 rounded text-xs font-semibold border uppercase tracking-wider", STATUS_BADGE[openRow.status] ?? "bg-[hsl(var(--muted))]")}>
                        {openRow.status}
                      </span>
                      {openRow.cuisineTags.length > 0 && (
                        <div className="flex items-center gap-1.5 border-l border-[hsl(var(--border))] pl-3">
                          {openRow.cuisineTags.map(tag => (
                            <span key={tag} className="text-sm text-[hsl(var(--muted-foreground))]">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Main Grid */}
                  <div className="grid grid-cols-[1.5fr_1fr] gap-8">
                    
                    {/* Left Col: Ingredients & Instructions */}
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2 border-b border-[hsl(var(--border))] pb-2">
                          <BookOpen className="w-5 h-5 text-[hsl(var(--muted-foreground))]" /> Ingredients Analysis
                        </h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-4">
                            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-1">Mapped to Catalog</p>
                            <p className="text-2xl font-semibold tabular-nums text-[hsl(var(--foreground))]">{openRow.mappedIngredientCount}</p>
                          </div>
                          <div className={cn("bg-[hsl(var(--card))] border rounded-lg p-4", openRow.unmappedIngredientNames.length > 0 ? "border-orange-200 bg-orange-50/50" : "border-[hsl(var(--border))]")}>
                            <p className={cn("text-sm mb-1", openRow.unmappedIngredientNames.length > 0 ? "text-orange-800" : "text-[hsl(var(--muted-foreground))]")}>Unmapped</p>
                            <p className={cn("text-2xl font-semibold tabular-nums", openRow.unmappedIngredientNames.length > 0 ? "text-orange-600" : "text-[hsl(var(--foreground))]")}>{openRow.unmappedIngredientNames.length}</p>
                          </div>
                        </div>

                        {openRow.unmappedIngredientNames.length > 0 && (
                          <div className="rounded-lg border border-orange-200 bg-orange-50/80 p-4">
                            <p className="text-sm font-medium text-orange-900 mb-3 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" /> Unmapped Items Needs Attention
                            </p>
                            <ul className="text-sm text-orange-900/90 space-y-1.5 pl-6 list-disc">
                              {openRow.unmappedIngredientNames.map((n) => <li key={n}>{n}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>

                      {openRow.instructionsSummary && (
                        <div className="space-y-4">
                           <h3 className="text-lg font-semibold flex items-center gap-2 border-b border-[hsl(var(--border))] pb-2">
                             <ListFilter className="w-5 h-5 text-[hsl(var(--muted-foreground))]" /> Instructions Summary
                           </h3>
                           <p className="text-base text-[hsl(var(--foreground))]/90 leading-relaxed bg-[hsl(var(--muted))]/30 p-4 rounded-lg border border-[hsl(var(--border))]/50">
                             {openRow.instructionsSummary}
                           </p>
                        </div>
                      )}
                    </div>

                    {/* Right Col: Media & Meta */}
                    <div className="space-y-6">
                      <div className="rounded-lg overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--card))] aspect-[4/3] flex items-center justify-center">
                        {openRow.imageUrl ? (
                          <img src={openRow.imageUrl} alt={openRow.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-[hsl(var(--muted-foreground))]/50">
                            <ImageIcon className="w-12 h-12" />
                            <span className="text-sm font-medium">No Image Available</span>
                          </div>
                        )}
                      </div>

                      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg divide-y divide-[hsl(var(--border))]">
                        <div className="flex items-center justify-between p-3 text-sm">
                          <span className="text-[hsl(var(--muted-foreground))] flex items-center gap-2"><Clock className="w-4 h-4" /> Est. Time</span>
                          <span className="font-medium">{openRow.estimatedTimeMin ? `${openRow.estimatedTimeMin}m` : "—"}</span>
                        </div>
                        <div className="flex items-center justify-between p-3 text-sm">
                          <span className="text-[hsl(var(--muted-foreground))] flex items-center gap-2"><ListFilter className="w-4 h-4" /> Mapping Rate</span>
                          <span className="font-medium">{openRow.mappingRate != null ? `${Math.round(openRow.mappingRate * 100)}%` : "—"}</span>
                        </div>
                        <div className="flex items-center justify-between p-3 text-sm">
                          <span className="text-[hsl(var(--muted-foreground))]">Imported On</span>
                          <span className="font-medium">{new Date(openRow.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </ScrollArea>

              {/* Action Bar (Sticky Bottom) */}
              <div className="absolute bottom-0 left-0 right-0 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))] p-4 px-8 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">
                <div className="max-w-3xl mx-auto flex items-end gap-4">
                  <div className="flex-1">
                    <input 
                      type="text" 
                      value={note} 
                      onChange={(e) => setNote(e.target.value)} 
                      placeholder="Add an optional decision note..." 
                      className="w-full px-4 py-2.5 rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all placeholder:text-[hsl(var(--muted-foreground))]/70" 
                      disabled={isFinal}
                    />
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button 
                      disabled={isFinal}
                      onClick={() => handleAction("rejected")}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 bg-[hsl(var(--card))] transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      <XCircle className="w-4 h-4 group-hover:scale-110 transition-transform" /> Reject <Kbd>R</Kbd>
                    </button>
                    <button 
                      disabled={isFinal}
                      onClick={() => handleAction("promoted")}
                      className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-md text-sm font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm group"
                    >
                      <CheckCircle className="w-4 h-4 group-hover:scale-110 transition-transform" /> Promote <Kbd>P</Kbd>
                    </button>
                  </div>
                </div>
                <div className="max-w-3xl mx-auto mt-3 flex justify-between items-center text-[10px] text-[hsl(var(--muted-foreground))]">
                   <div className="flex items-center gap-4">
                     <span className="flex items-center gap-1.5"><Keyboard className="w-3 h-3" /> Keyboard shortcuts</span>
                     <span className="flex items-center gap-1"><Kbd>J</Kbd> <Kbd>K</Kbd> Navigate</span>
                     <span className="flex items-center gap-1"><Kbd>P</Kbd> Promote</span>
                     <span className="flex items-center gap-1"><Kbd>R</Kbd> Reject</span>
                   </div>
                   <span>{openRow.id}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

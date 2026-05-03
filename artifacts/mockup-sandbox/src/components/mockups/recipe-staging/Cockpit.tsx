import "./_group.css";
import React, { useState } from "react";
import {
  CheckCircle,
  XCircle,
  Search,
  AlertTriangle,
  Wand2,
  Clock,
  BookOpen,
  Image as ImageIcon,
  ChevronRight,
  ExternalLink,
  Copy,
  Pencil,
  Terminal,
  ListFilter,
  CheckSquare,
  Square,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { MOCK_ROWS, FACETS, type StagingRow } from "./_data";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const STATUS_DOT: Record<string, string> = {
  imported: "bg-blue-500",
  ready: "bg-emerald-500",
  needs_review: "bg-orange-500",
  promoted: "bg-purple-500",
  rejected: "bg-red-500",
};

const STATUS_BADGE: Record<string, string> = {
  imported: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  ready: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  needs_review: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  promoted: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  rejected: "bg-red-500/10 text-red-600 border-red-500/30",
};

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-medium font-mono text-[hsl(var(--muted-foreground))] bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded shadow-[0_1px_0_hsl(var(--border))]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

function MiniBar({ rate }: { rate: number | null | undefined }) {
  const pct = rate == null ? 0 : Math.round(rate * 100);
  const color =
    rate == null ? "bg-[hsl(var(--muted-foreground))]/30"
    : pct >= 80 ? "bg-emerald-500"
    : pct >= 50 ? "bg-yellow-500"
    : "bg-red-500";
  return (
    <div className="w-[60px] h-1 rounded-full bg-[hsl(var(--muted))] overflow-hidden shrink-0">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "/", label: "Search" },
  { keys: "F", label: "Filter" },
  { keys: "B", label: "Bulk" },
  { keys: "J", label: "Down" },
  { keys: "K", label: "Up" },
  { keys: "1-9", label: "Jump" },
  { keys: "⌘P", label: "Promote" },
  { keys: "⌘R", label: "Reject" },
  { keys: "⌘O", label: "Open" },
  { keys: "⌘C", label: "Copy ID" },
  { keys: "⌘E", label: "Cuisine" },
  { keys: "Esc", label: "Clear" },
];

export function Cockpit() {
  const [status, setStatus] = useState("pending");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(
    MOCK_ROWS.find((r) => ["imported", "ready", "needs_review"].includes(r.status))?.id ?? null,
  );
  const [note, setNote] = useState("");
  const [mockStatuses, setMockStatuses] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState(false);

  const FILTER_LABELS: Record<string, string> = {
    pending: "In queue", imported: "Imported", ready: "Ready",
    needs_review: "Needs review", promoted: "Promoted", rejected: "Rejected", all: "All",
  };

  const allRows = MOCK_ROWS.map((r) => ({ ...r, status: (mockStatuses[r.id] ?? r.status) as StagingRow["status"] }));

  const filtered = allRows.filter((r) => {
    if (status === "pending") {
      if (!["imported", "ready", "needs_review"].includes(r.status)) return false;
    } else if (status !== "all" && r.status !== status) return false;
    if (source && r.source !== source) return false;
    if (q && !r.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const openRow = filtered.find((r) => r.id === openId) ?? null;
  const isFinal = openRow ? ["promoted", "rejected"].includes(openRow.status) : false;

  const queueCount = filtered.length;
  const promotedToday = allRows.filter((r) => r.status === "promoted").length + 12;

  const handleAction = (action: "promoted" | "rejected") => {
    if (!openRow) return;
    setMockStatuses((prev) => ({ ...prev, [openRow.id]: action }));
    setNote("");
    const idx = filtered.findIndex((r) => r.id === openRow.id);
    if (idx >= 0 && idx < filtered.length - 1) setOpenId(filtered[idx + 1].id);
    else setOpenId(null);
  };

  return (
    <div className="flex flex-col h-[100dvh] min-h-[900px] w-full overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Recipe Staging</h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            Cockpit · keyboard-first triage for high-throughput power users
          </p>
        </div>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-[hsl(var(--input))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] transition-colors shadow-sm">
          <Wand2 className="w-4 h-4" /> Re-map ingredients
        </button>
      </div>

      {/* Command Bar — 36px */}
      <div className="h-9 shrink-0 flex items-center justify-between px-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] font-mono">
          <Terminal className="w-3.5 h-3.5 opacity-70" />
          <span>Press</span>
          <Kbd>/</Kbd><span>to search</span>
          <span className="opacity-40">·</span>
          <Kbd>F</Kbd><span>to filter</span>
          <span className="opacity-40">·</span>
          <Kbd>B</Kbd><span>for bulk</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[11px] font-mono tabular-nums">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold">{queueCount}</span>
          <span className="text-[hsl(var(--muted-foreground))]">in queue</span>
          <span className="text-[hsl(var(--muted-foreground))] opacity-40">·</span>
          <span className="font-semibold">{promotedToday}</span>
          <span className="text-[hsl(var(--muted-foreground))]">promoted today</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Queue Pane */}
        <div className="w-[400px] flex flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 shrink-0">
          <div className="p-3 border-b border-[hsl(var(--border))] space-y-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search queue…"
                className="w-full pl-8 pr-9 py-1.5 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
              />
              <Kbd className="absolute right-2 top-1/2 -translate-y-1/2">/</Kbd>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-xs focus:outline-none"
              >
                {["pending", "imported", "ready", "needs_review", "promoted", "rejected", "all"].map((s) => (
                  <option key={s} value={s}>{FILTER_LABELS[s]}</option>
                ))}
              </select>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-xs focus:outline-none"
              >
                <option value="">All sources</option>
                {FACETS.sources.map((s) => (
                  <option key={s.source} value={s.source}>{s.source}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[hsl(var(--muted-foreground))]">
                Queue · {filtered.length}
              </span>
              <button
                onClick={() => setBulk((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
                  bulk
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]"
                    : "bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]",
                )}
              >
                {bulk ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                Bulk: select rows
              </button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="divide-y divide-[hsl(var(--border))]/60">
              {filtered.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">Empty queue</div>
              ) : (
                filtered.map((r, i) => {
                  const isSelected = openId === r.id;
                  const numKey = i < 9 ? String(i + 1) : null;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setOpenId(r.id)}
                      className={cn(
                        "group relative flex items-center gap-2 px-2 cursor-pointer h-12 border-l-2 transition-colors",
                        isSelected
                          ? "bg-[hsl(var(--primary))]/10 border-l-[hsl(var(--primary))]"
                          : "hover:bg-[hsl(var(--background))] border-l-transparent",
                      )}
                    >
                      {bulk && (
                        <div className="shrink-0 w-4 h-4 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] flex items-center justify-center">
                          <Square className="w-3 h-3 text-[hsl(var(--muted-foreground))]/40" />
                        </div>
                      )}
                      <div className="shrink-0 w-5 flex items-center justify-center">
                        {numKey ? (
                          <Kbd>{numKey}</Kbd>
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--muted-foreground))]/30" />
                        )}
                      </div>
                      <span className={cn("shrink-0 w-1.5 h-1.5 rounded-full", STATUS_DOT[r.status] ?? "bg-[hsl(var(--muted-foreground))]")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3
                            className={cn(
                              "text-[13px] font-medium leading-tight truncate",
                              isSelected ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--foreground))]",
                            )}
                          >
                            {r.title}
                          </h3>
                          <MiniBar rate={r.mappingRate} />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))] font-mono">
                          <span className="uppercase tracking-wider">{r.source}</span>
                          <span className="opacity-40">·</span>
                          <span>{r.mappedIngredientCount}m / {r.unmappedIngredientNames.length}u</span>
                          {r.unmappedIngredientNames.length > 0 && (
                            <span className="flex items-center gap-0.5 text-orange-600">
                              <AlertTriangle className="w-2.5 h-2.5" />
                            </span>
                          )}
                          <span className="opacity-40">·</span>
                          <span>{new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                        </div>
                      </div>
                      <ChevronRight
                        className={cn(
                          "w-3.5 h-3.5 shrink-0 transition-opacity",
                          isSelected
                            ? "opacity-100 text-[hsl(var(--primary))]"
                            : "opacity-0 group-hover:opacity-100 text-[hsl(var(--muted-foreground))]",
                        )}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Detail Pane + Shortcut Rail */}
        <div className="flex-1 flex overflow-hidden bg-[hsl(var(--background))]">
          <div className="flex-1 flex flex-col relative overflow-hidden">
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
                <ScrollArea className="flex-1 px-8 py-6">
                  <div className="max-w-3xl mx-auto space-y-6 pb-32">
                    {/* Header */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] font-mono">
                        <span className="uppercase tracking-wider font-semibold text-[10px] bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">
                          {openRow.source}
                        </span>
                        <span>ID:</span>
                        <span className="text-[hsl(var(--foreground))]">{openRow.sourceRecipeId}</span>
                        <button className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[hsl(var(--muted))] transition-colors">
                          <Copy className="w-3 h-3" /> <Kbd>⌘C</Kbd>
                        </button>
                        <button className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[hsl(var(--muted))] transition-colors">
                          <ExternalLink className="w-3 h-3" /> Open source <Kbd>⌘O</Kbd>
                        </button>
                      </div>
                      <h2 className="text-2xl font-bold tracking-tight text-[hsl(var(--foreground))] leading-tight">
                        {openRow.title}
                      </h2>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[11px] font-semibold border uppercase tracking-wider",
                            STATUS_BADGE[openRow.status],
                          )}
                        >
                          {openRow.status}
                        </span>
                        <div className="flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] border-l border-[hsl(var(--border))] pl-3">
                          {openRow.cuisineTags.length > 0 ? openRow.cuisineTags.join(", ") : "no cuisine"}
                          <button className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] transition-colors">
                            <Pencil className="w-3 h-3" /> edit cuisine <Kbd>⌘E</Kbd>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Main Grid */}
                    <div className="grid grid-cols-[1.4fr_1fr] gap-6">
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold flex items-center gap-2 border-b border-[hsl(var(--border))] pb-2 uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                            <BookOpen className="w-4 h-4" /> Ingredients
                          </h3>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg p-3">
                              <p className="text-[11px] text-[hsl(var(--muted-foreground))] font-mono uppercase">Mapped</p>
                              <p className="text-2xl font-semibold tabular-nums">{openRow.mappedIngredientCount}</p>
                            </div>
                            <div
                              className={cn(
                                "border rounded-lg p-3",
                                openRow.unmappedIngredientNames.length > 0
                                  ? "border-orange-500/30 bg-orange-500/5"
                                  : "border-[hsl(var(--border))] bg-[hsl(var(--card))]",
                              )}
                            >
                              <p className={cn("text-[11px] font-mono uppercase", openRow.unmappedIngredientNames.length > 0 ? "text-orange-600" : "text-[hsl(var(--muted-foreground))]")}>Unmapped</p>
                              <p className={cn("text-2xl font-semibold tabular-nums", openRow.unmappedIngredientNames.length > 0 ? "text-orange-600" : "text-[hsl(var(--foreground))]")}>{openRow.unmappedIngredientNames.length}</p>
                            </div>
                          </div>

                          {openRow.unmappedIngredientNames.length > 0 && (
                            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
                              <p className="text-xs font-medium text-orange-700 mb-2 flex items-center gap-1.5 font-mono uppercase">
                                <AlertTriangle className="w-3.5 h-3.5" /> Needs attention
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {openRow.unmappedIngredientNames.map((n) => (
                                  <span
                                    key={n}
                                    className="px-1.5 py-0.5 rounded text-xs font-mono bg-[hsl(var(--background))] border border-orange-500/30 text-orange-700"
                                  >
                                    {n}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {openRow.instructionsSummary && (
                          <div className="space-y-2">
                            <h3 className="text-sm font-semibold flex items-center gap-2 border-b border-[hsl(var(--border))] pb-2 uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                              <ListFilter className="w-4 h-4" /> Instructions
                            </h3>
                            <p className="text-sm text-[hsl(var(--foreground))]/90 leading-relaxed bg-[hsl(var(--muted))]/40 p-3 rounded-lg border border-[hsl(var(--border))]/60">
                              {openRow.instructionsSummary}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-lg overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--card))] aspect-[4/3] flex items-center justify-center">
                          {openRow.imageUrl ? (
                            <img src={openRow.imageUrl} alt={openRow.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-[hsl(var(--muted-foreground))]/50">
                              <ImageIcon className="w-10 h-10" />
                              <span className="text-xs font-medium">No image</span>
                            </div>
                          )}
                        </div>

                        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg divide-y divide-[hsl(var(--border))] text-xs">
                          <div className="flex items-center justify-between px-3 py-2">
                            <span className="text-[hsl(var(--muted-foreground))] flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Est. time</span>
                            <span className="font-medium tabular-nums">{openRow.estimatedTimeMin ? `${openRow.estimatedTimeMin}m` : "—"}</span>
                          </div>
                          <div className="flex items-center justify-between px-3 py-2">
                            <span className="text-[hsl(var(--muted-foreground))]">Mapping rate</span>
                            <div className="flex items-center gap-2">
                              <MiniBar rate={openRow.mappingRate} />
                              <span className="font-medium tabular-nums">{openRow.mappingRate != null ? `${Math.round(openRow.mappingRate * 100)}%` : "—"}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between px-3 py-2">
                            <span className="text-[hsl(var(--muted-foreground))]">Imported</span>
                            <span className="font-medium tabular-nums">{new Date(openRow.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>

                {/* Action Bar */}
                <div className="absolute bottom-0 left-0 right-0 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))] p-3 px-6 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                  <div className="max-w-3xl mx-auto flex items-center gap-3">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Decision note (optional)…"
                      disabled={isFinal}
                      className="flex-1 px-3 py-2 rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                    />
                    <button
                      disabled={isFinal}
                      onClick={() => handleAction("rejected")}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-red-500/30 text-red-600 hover:bg-red-500/10 bg-[hsl(var(--card))] transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      {bulk ? "Reject 0 selected" : "Reject"}
                      <Kbd>⌘R</Kbd>
                    </button>
                    <button
                      disabled={isFinal}
                      onClick={() => handleAction("promoted")}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all disabled:opacity-50 shadow-sm"
                    >
                      <CheckCircle className="w-4 h-4" />
                      {bulk ? "Promote 0 selected" : "Promote"}
                      <Kbd className="bg-[hsl(var(--primary-foreground))]/20 border-[hsl(var(--primary-foreground))]/30 text-[hsl(var(--primary-foreground))]">⌘P</Kbd>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Shortcut Rail — 40px */}
          <div className="w-10 shrink-0 border-l border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 flex flex-col items-center py-3 gap-1">
            <Terminal className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))] mb-1" />
            <div className="w-6 h-px bg-[hsl(var(--border))] mb-1" />
            <ScrollArea className="flex-1 w-full">
              <div className="flex flex-col items-center gap-2 py-1">
                {SHORTCUTS.map((s) => (
                  <div key={s.keys} className="flex flex-col items-center gap-0.5" title={s.label}>
                    <Kbd className="px-1">{s.keys}</Kbd>
                    <span className="text-[8px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] font-mono leading-none">
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="w-6 h-px bg-[hsl(var(--border))] mt-1" />
            <div className="flex flex-col items-center gap-1 mt-1">
              <ArrowUp className="w-3 h-3 text-[hsl(var(--muted-foreground))]" />
              <ArrowDown className="w-3 h-3 text-[hsl(var(--muted-foreground))]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

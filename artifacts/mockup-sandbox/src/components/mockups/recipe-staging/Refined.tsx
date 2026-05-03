import "./_group.css";
import React, { useState } from "react";
import { Search } from "lucide-react";
import { MOCK_ROWS, FACETS, type StagingRow } from "./_data";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const STATUS_DOT: Record<string, string> = {
  imported: "bg-sky-500",
  ready: "bg-emerald-500",
  needs_review: "bg-orange-500",
  promoted: "bg-violet-500",
  rejected: "bg-rose-500",
};

const STATUS_LABEL: Record<string, string> = {
  imported: "Imported",
  ready: "Ready",
  needs_review: "Needs review",
  promoted: "Promoted",
  rejected: "Rejected",
};

function Dot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block w-1.5 h-1.5 rounded-full shrink-0",
        STATUS_DOT[status] ?? "bg-[hsl(var(--muted-foreground))]"
      )}
    />
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-mono text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))] rounded-[3px] bg-[hsl(var(--background))]">
      {children}
    </kbd>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-widest font-medium text-[hsl(var(--muted-foreground))]">
      {children}
    </div>
  );
}

export function Refined() {
  const [status, setStatus] = useState("pending");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(
    MOCK_ROWS.find((r) => ["imported", "ready", "needs_review"].includes(r.status))?.id ?? null
  );
  const [note, setNote] = useState("");
  const [mockStatuses, setMockStatuses] = useState<Record<string, string>>({});

  const FILTER_LABELS: Record<string, string> = {
    pending: "In queue",
    imported: "Imported",
    ready: "Ready",
    needs_review: "Needs review",
    promoted: "Promoted",
    rejected: "Rejected",
    all: "All",
  };

  const rows: StagingRow[] = MOCK_ROWS.map((r) => ({
    ...r,
    status: (mockStatuses[r.id] ?? r.status) as StagingRow["status"],
  }));

  const filtered = rows.filter((r) => {
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
    setMockStatuses((prev) => ({ ...prev, [openRow.id]: action }));
    setNote("");
    const idx = filtered.findIndex((r) => r.id === openRow.id);
    if (idx >= 0 && idx < filtered.length - 1) setOpenId(filtered[idx + 1].id);
    else setOpenId(null);
  };

  const totals = {
    mapped: rows.reduce((s, r) => s + r.mappedIngredientCount, 0),
    unmapped: rows.reduce((s, r) => s + r.unmappedIngredientNames.length, 0),
  };

  return (
    <div className="flex flex-col h-[100dvh] min-h-[900px] w-full overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 h-12 border-b border-[hsl(var(--border))] shrink-0">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[13px] font-medium tracking-tight">Recipe Staging</h1>
          <span className="text-[11px] text-[hsl(var(--muted-foreground))] tabular-nums">
            {filtered.length} in queue
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-[hsl(var(--muted-foreground))]">
          <span className="tabular-nums">{totals.mapped} mapped</span>
          <span className="w-px h-3 bg-[hsl(var(--border))]" />
          <span className="tabular-nums">{totals.unmapped} unmapped</span>
          <span className="w-px h-3 bg-[hsl(var(--border))]" />
          <button className="text-[hsl(var(--foreground))] hover:opacity-70 transition-opacity">
            Re-map ingredients
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left pane */}
        <aside className="w-[380px] flex flex-col border-r border-[hsl(var(--border))] shrink-0">
          <div className="px-4 pt-4 pb-3 space-y-2.5 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search queue"
                className="w-full pl-8 pr-3 h-8 rounded-md border border-[hsl(var(--input))] bg-transparent text-[13px] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))]"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="flex-1 h-7 px-2 rounded-md border border-[hsl(var(--input))] bg-transparent text-[11px] text-[hsl(var(--foreground))] focus:outline-none"
              >
                {["pending", "imported", "ready", "needs_review", "promoted", "rejected", "all"].map((s) => (
                  <option key={s} value={s}>{FILTER_LABELS[s]}</option>
                ))}
              </select>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="flex-1 h-7 px-2 rounded-md border border-[hsl(var(--input))] bg-transparent text-[11px] text-[hsl(var(--foreground))] focus:outline-none"
              >
                <option value="">All sources</option>
                {FACETS.sources.map((s) => (
                  <option key={s.source} value={s.source}>{s.source}</option>
                ))}
              </select>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-2">
              {filtered.length === 0 ? (
                <div className="px-4 py-16 text-center text-[12px] text-[hsl(var(--muted-foreground))]">
                  Empty queue
                </div>
              ) : (
                filtered.map((r, i) => {
                  const isSelected = openId === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setOpenId(r.id)}
                      className={cn(
                        "w-full text-left px-3 py-3.5 rounded-md transition-colors block",
                        i !== 0 && "border-t border-[hsl(var(--border))]/40",
                        isSelected
                          ? "bg-[hsl(var(--muted))]/60"
                          : "hover:bg-[hsl(var(--muted))]/30"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                          {r.source}
                        </span>
                        <span className="text-[11px] tabular-nums text-[hsl(var(--muted-foreground))]">
                          {r.mappingRate != null ? `${Math.round(r.mappingRate * 100)}%` : "—"}
                        </span>
                      </div>
                      <div className="text-[13px] font-medium leading-snug text-[hsl(var(--foreground))] truncate">
                        {r.title}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]">
                          <Dot status={r.status} />
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                        <span className="text-[11px] text-[hsl(var(--muted-foreground))] tabular-nums">
                          {r.unmappedIngredientNames.length > 0 && (
                            <span className="mr-2">{r.unmappedIngredientNames.length} unmapped</span>
                          )}
                          {new Date(r.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Right pane */}
        <section className="flex-1 flex flex-col relative overflow-hidden">
          {!openRow ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[hsl(var(--muted-foreground))] gap-2">
              <p className="text-[13px] text-[hsl(var(--foreground))]">Queue complete</p>
              <p className="text-[11px]">{filtered.length} recipes remaining</p>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1">
                <div className="max-w-[760px] mx-auto px-10 pt-10 pb-32">
                  {/* Title block */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-[11px] text-[hsl(var(--muted-foreground))]">
                      <span className="uppercase tracking-widest">{openRow.source}</span>
                      <span className="w-px h-3 bg-[hsl(var(--border))]" />
                      <span className="font-mono">{openRow.sourceRecipeId}</span>
                      <span className="w-px h-3 bg-[hsl(var(--border))]" />
                      <span className="inline-flex items-center gap-1.5">
                        <Dot status={openRow.status} />
                        {STATUS_LABEL[openRow.status] ?? openRow.status}
                      </span>
                    </div>
                    <h2 className="text-[24px] font-semibold tracking-tight leading-tight text-[hsl(var(--foreground))]">
                      {openRow.title}
                    </h2>
                    {openRow.cuisineTags.length > 0 && (
                      <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                        {openRow.cuisineTags.map((t, i) => (
                          <React.Fragment key={t}>
                            {i > 0 && <span className="opacity-50">·</span>}
                            <span>{t}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Stat strip */}
                  <div className="mt-8 flex items-center border-y border-[hsl(var(--border))] py-4">
                    {[
                      { label: "Mapped", value: openRow.mappedIngredientCount },
                      { label: "Unmapped", value: openRow.unmappedIngredientNames.length },
                      {
                        label: "Est. time",
                        value: openRow.estimatedTimeMin ? `${openRow.estimatedTimeMin}m` : "—",
                      },
                      {
                        label: "Mapping rate",
                        value:
                          openRow.mappingRate != null
                            ? `${Math.round(openRow.mappingRate * 100)}%`
                            : "—",
                      },
                    ].map((s, i, arr) => (
                      <div
                        key={s.label}
                        className={cn(
                          "flex-1 px-4",
                          i !== arr.length - 1 && "border-r border-[hsl(var(--border))]"
                        )}
                      >
                        <div className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-1">
                          {s.label}
                        </div>
                        <div className="text-[16px] font-medium tabular-nums">{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Image */}
                  <div className="mt-8 group">
                    <div className="aspect-video w-full overflow-hidden rounded-md bg-[hsl(var(--muted))]/40 ring-1 ring-transparent group-hover:ring-[hsl(var(--border))] transition-shadow">
                      {openRow.imageUrl ? (
                        <img
                          src={openRow.imageUrl}
                          alt={openRow.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[11px] text-[hsl(var(--muted-foreground))]">
                          No image
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Unmapped callout */}
                  {openRow.unmappedIngredientNames.length > 0 && (
                    <div className="mt-8 border-t-2 border-orange-500 bg-orange-500/5 px-5 py-4 rounded-b-md">
                      <div className="flex items-center justify-between mb-2">
                        <SectionLabel>Unmapped ingredients</SectionLabel>
                        <span className="text-[11px] tabular-nums text-[hsl(var(--muted-foreground))]">
                          {openRow.unmappedIngredientNames.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-[hsl(var(--foreground))]">
                        {openRow.unmappedIngredientNames.map((n) => (
                          <span key={n} className="font-mono">{n}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Instructions */}
                  {openRow.instructionsSummary && (
                    <div className="mt-10 space-y-3">
                      <SectionLabel>Instructions</SectionLabel>
                      <p className="text-[13px] leading-relaxed text-[hsl(var(--foreground))]/90">
                        {openRow.instructionsSummary}
                      </p>
                    </div>
                  )}

                  {/* Meta */}
                  <div className="mt-10 space-y-3">
                    <SectionLabel>Meta</SectionLabel>
                    <dl className="text-[12px] grid grid-cols-[120px_1fr] gap-y-2">
                      <dt className="text-[hsl(var(--muted-foreground))]">Imported</dt>
                      <dd className="tabular-nums">
                        {new Date(openRow.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </dd>
                      <dt className="text-[hsl(var(--muted-foreground))]">Source ID</dt>
                      <dd className="font-mono">{openRow.sourceRecipeId}</dd>
                      <dt className="text-[hsl(var(--muted-foreground))]">Internal ID</dt>
                      <dd className="font-mono">{openRow.id}</dd>
                    </dl>
                  </div>
                </div>
              </ScrollArea>

              {/* Action bar */}
              <div className="absolute bottom-0 left-0 right-0 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur-sm">
                <div className="max-w-[760px] mx-auto px-10 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Add a decision note…"
                      disabled={isFinal}
                      className="flex-1 h-8 px-3 rounded-md border border-[hsl(var(--input))] bg-transparent text-[12px] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))] disabled:opacity-50"
                    />
                    <button
                      disabled={isFinal}
                      onClick={() => handleAction("rejected")}
                      className="inline-flex items-center gap-2 h-8 px-3 rounded-md text-[12px] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Reject <Kbd>R</Kbd>
                    </button>
                    <button
                      disabled={isFinal}
                      onClick={() => handleAction("promoted")}
                      className="inline-flex items-center gap-2 h-8 px-3 rounded-md text-[12px] border border-[hsl(var(--primary))]/60 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Promote <Kbd>P</Kbd>
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
                    <div className="inline-flex items-center gap-2">
                      <Kbd>↓</Kbd><Kbd>↑</Kbd>
                      <span>navigate</span>
                      <span className="opacity-50">·</span>
                      <Kbd>P</Kbd>
                      <span>promote</span>
                      <span className="opacity-50">·</span>
                      <Kbd>R</Kbd>
                      <span>reject</span>
                    </div>
                    <span className="font-mono">{openRow.id}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

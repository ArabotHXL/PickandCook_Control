import "./_group.css";
import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Search,
  AlertTriangle,
  Wand2,
  Clock,
  BookOpen,
  Image as ImageIcon,
  Check,
  X,
  AlertCircle,
  Sparkles,
  ArrowDown,
  Plus,
  Info,
  ListChecks,
  ChevronRight,
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

const SOURCE_LABEL: Record<string, string> = {
  themealdb: "TheMealDB nightly job",
  wikibooks: "Wikibooks weekly sync",
};

type CheckResult = {
  key: string;
  label: string;
  state: "pass" | "fail" | "warn";
  anchor?: string;
  detail?: string;
};

function getChecks(row: StagingRow): CheckResult[] {
  const checks: CheckResult[] = [];
  checks.push({
    key: "title",
    label: row.title ? "Title set" : "Title missing",
    state: row.title ? "pass" : "fail",
    anchor: "section-header",
  });
  checks.push({
    key: "image",
    label: row.imageUrl ? "Image present" : "No image attached",
    state: row.imageUrl ? "pass" : "warn",
    anchor: "section-media",
  });
  const unmapped = row.unmappedIngredientNames.length;
  checks.push({
    key: "ingredients",
    label:
      unmapped === 0
        ? "All ingredients mapped"
        : `${unmapped} ingredient${unmapped === 1 ? "" : "s"} unmapped — resolve below`,
    state: unmapped === 0 ? "pass" : "fail",
    anchor: "section-unmapped",
  });
  checks.push({
    key: "instructions",
    label: row.instructionsSummary
      ? "Cooking steps captured"
      : "No cooking steps — operator must add",
    state: row.instructionsSummary ? "pass" : "fail",
    anchor: "section-instructions",
  });
  checks.push({
    key: "time",
    label: row.estimatedTimeMin ? "Cooking time set" : "Cooking time missing",
    state: row.estimatedTimeMin ? "pass" : "warn",
    anchor: "section-meta",
  });
  return checks;
}

function parseSteps(summary: string): string[] {
  // Mock instructionsSummary uses "; " between steps. Split, trim, drop empty,
  // and capitalise the first letter of each step for clean numbered display.
  return summary
    .split(/;|\.\s+(?=[A-Z])/)
    .map((s) => s.replace(/^\s+|[\s.;]+$/g, ""))
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

function readinessFromChecks(checks: CheckResult[]): {
  pct: number;
  passCount: number;
  total: number;
  unresolved: number;
} {
  const total = checks.length;
  const passCount = checks.filter((c) => c.state === "pass").length;
  const unresolved = checks.filter((c) => c.state !== "pass").length;
  return { pct: Math.round((passCount / total) * 100), passCount, total, unresolved };
}

function ReadinessDots({ checks }: { checks: CheckResult[] }) {
  return (
    <div className="flex items-center gap-1">
      {checks.map((c) => (
        <span
          key={c.key}
          title={`${c.label}`}
          className={cn(
            "w-2 h-2 rounded-full",
            c.state === "pass" && "bg-emerald-500",
            c.state === "warn" && "bg-amber-400",
            c.state === "fail" && "bg-[hsl(var(--border))]"
          )}
        />
      ))}
    </div>
  );
}

function ProgressRing({ pct, size = 80 }: { pct: number; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color = pct >= 100 ? "hsl(var(--primary))" : pct >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums leading-none">{pct}%</span>
        <span className="text-[9px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] mt-0.5">
          ready
        </span>
      </div>
    </div>
  );
}

function suggestionsFor(name: string): string[] {
  const lower = name.toLowerCase().trim();
  const tokens = lower.split(/\s+/);
  const last = tokens[tokens.length - 1];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const candidates = new Set<string>();
  candidates.add(cap(lower));
  if (tokens.length > 1) candidates.add(cap(last));
  candidates.add(cap(lower.replace(/s$/, "")));
  if (last !== lower) candidates.add(cap(`${last} (generic)`));
  candidates.add(cap(`${tokens[0]} substitute`));
  return Array.from(candidates).slice(0, 3);
}

export function Assist() {
  const [status, setStatus] = useState("pending");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const initialId =
    MOCK_ROWS.find((r) => r.unmappedIngredientNames.length > 0)?.id ?? MOCK_ROWS[0]?.id ?? null;
  const [openId, setOpenId] = useState<string | null>(initialId);
  const [note, setNote] = useState("");
  const [mockStatuses, setMockStatuses] = useState<Record<string, string>>({});
  const [resolved, setResolved] = useState<Record<string, Set<string>>>({});

  const FILTER_LABELS: Record<string, string> = {
    pending: "In queue",
    imported: "Imported",
    ready: "Ready",
    needs_review: "Needs review",
    promoted: "Promoted",
    rejected: "Rejected",
    all: "All",
  };

  const filtered = MOCK_ROWS.map((r) => ({
    ...r,
    status: (mockStatuses[r.id] ?? r.status) as StagingRow["status"],
  })).filter((r) => {
    if (status === "pending") {
      if (!["imported", "ready", "needs_review"].includes(r.status)) return false;
    } else if (status !== "all" && r.status !== status) return false;
    if (source && r.source !== source) return false;
    if (q && !r.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const openRow = filtered.find((r) => r.id === openId) ?? null;
  const isFinal = openRow ? ["promoted", "rejected"].includes(openRow.status) : false;

  const checks = useMemo(() => (openRow ? getChecks(openRow) : []), [openRow]);
  const readiness = useMemo(() => readinessFromChecks(checks), [checks]);

  const resolvedForRow = openRow ? resolved[openRow.id] ?? new Set<string>() : new Set<string>();
  const remainingUnmapped = openRow
    ? openRow.unmappedIngredientNames.filter((n) => !resolvedForRow.has(n))
    : [];
  const totalIngredients = openRow
    ? openRow.mappedIngredientCount + openRow.unmappedIngredientNames.length
    : 0;
  const mappedNow = openRow
    ? openRow.mappedIngredientCount + (openRow.unmappedIngredientNames.length - remainingUnmapped.length)
    : 0;

  const adjustedChecks = useMemo<CheckResult[]>(() => {
    if (!openRow) return [];
    return checks.map((c) =>
      c.key === "ingredients"
        ? {
            ...c,
            state: remainingUnmapped.length === 0 ? "pass" : "fail",
            label:
              remainingUnmapped.length === 0
                ? "All ingredients mapped"
                : `${remainingUnmapped.length} ingredient${remainingUnmapped.length === 1 ? "" : "s"} unmapped — resolve below`,
          }
        : c
    );
  }, [checks, remainingUnmapped.length, openRow]);
  const adjReadiness = useMemo(() => readinessFromChecks(adjustedChecks), [adjustedChecks]);
  const allClear = adjReadiness.unresolved === 0;

  const handleAction = (action: "promoted" | "rejected") => {
    if (!openRow) return;
    setMockStatuses((prev) => ({ ...prev, [openRow.id]: action }));
    setNote("");
    const currentIndex = filtered.findIndex((r) => r.id === openRow.id);
    if (currentIndex >= 0 && currentIndex < filtered.length - 1) {
      setOpenId(filtered[currentIndex + 1].id);
    } else {
      setOpenId(null);
    }
  };

  const resolveOne = (name: string) => {
    if (!openRow) return;
    setResolved((prev) => {
      const next = new Set(prev[openRow.id] ?? []);
      next.add(name);
      return { ...prev, [openRow.id]: next };
    });
  };

  const scrollTo = (anchor?: string) => {
    if (!anchor) return;
    const el = document.getElementById(anchor);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col h-[100dvh] min-h-[900px] w-full overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[hsl(var(--primary))]/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-[hsl(var(--primary))]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Recipe Staging · Assist</h1>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Helpful copilot for promoting imported recipes — resolve blockers inline.
            </p>
          </div>
        </div>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-[hsl(var(--input))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted))] transition-colors shadow-sm">
          <Wand2 className="w-4 h-4" /> Bulk re-map
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Queue */}
        <div className="w-[400px] flex flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] shrink-0">
          <div className="p-3 border-b border-[hsl(var(--border))] space-y-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search queue…"
                className="w-full pl-8 pr-3 py-1.5 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-xs focus:outline-none"
              >
                {["pending", "imported", "ready", "needs_review", "promoted", "rejected", "all"].map(
                  (s) => (
                    <option key={s} value={s}>
                      {FILTER_LABELS[s]}
                    </option>
                  )
                )}
              </select>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-xs focus:outline-none"
              >
                <option value="">All sources</option>
                {FACETS.sources.map((s) => (
                  <option key={s.source} value={s.source}>
                    {s.source}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] pt-1">
              <span>{filtered.length} in view</span>
              <span className="flex items-center gap-1">
                <ListChecks className="w-3 h-3" /> readiness shown as ●●●●
              </span>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="divide-y divide-[hsl(var(--border))]/60">
              {filtered.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">
                  Empty queue
                </div>
              ) : (
                filtered.map((r) => {
                  const rowChecks = getChecks(r);
                  const rowReady = readinessFromChecks(rowChecks);
                  const isSelected = openId === r.id;
                  const why = `Imported from ${
                    SOURCE_LABEL[r.source] ?? r.source
                  } · ${new Date(r.createdAt).toLocaleString()}`;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setOpenId(r.id)}
                      title={`Why is this here? ${why}`}
                      className={cn(
                        "group cursor-pointer transition-colors border-l-[3px] p-3",
                        isSelected
                          ? "bg-[hsl(var(--primary))]/5 border-l-[hsl(var(--primary))]"
                          : "hover:bg-[hsl(var(--muted))]/40 border-l-transparent"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-[hsl(var(--muted-foreground))]">
                          {r.source}
                        </span>
                        <ReadinessDots checks={rowChecks} />
                      </div>
                      <h3
                        className={cn(
                          "text-sm font-medium leading-tight truncate",
                          isSelected
                            ? "text-[hsl(var(--primary))]"
                            : "text-[hsl(var(--foreground))]"
                        )}
                      >
                        {r.title}
                      </h3>
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-medium border",
                            STATUS_BADGE[r.status] ??
                              "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-transparent"
                          )}
                        >
                          {r.status}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                          <span className="tabular-nums">
                            {rowReady.passCount}/{rowReady.total} checks
                          </span>
                          {r.unmappedIngredientNames.length > 0 && (
                            <span className="flex items-center gap-1 text-amber-600 font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              {r.unmappedIngredientNames.length}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Detail */}
        <div className="flex-1 flex flex-col bg-[hsl(var(--background))] relative overflow-hidden">
          {!openRow ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[hsl(var(--muted-foreground))] space-y-4">
              <div className="w-16 h-16 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-[hsl(var(--muted-foreground))]/50" />
              </div>
              <div className="text-center">
                <p className="font-medium text-[hsl(var(--foreground))]">Queue complete</p>
                <p className="text-sm mt-1">{filtered.length} recipes remaining</p>
              </div>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1">
                <div className="px-8 py-6 max-w-4xl mx-auto space-y-6 pb-40">
                  {/* Header */}
                  <div id="section-header" className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                      <span className="uppercase tracking-wider font-semibold text-[10px] bg-[hsl(var(--muted))] px-2 py-0.5 rounded">
                        {openRow.source}
                      </span>
                      <span>
                        ID: <span className="font-mono">{openRow.sourceRecipeId}</span>
                      </span>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-medium border ml-1",
                          STATUS_BADGE[openRow.status]
                        )}
                      >
                        {openRow.status}
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight leading-tight">
                      {openRow.title}
                    </h2>
                  </div>

                  {/* Readiness Summary */}
                  <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
                    <div className="flex items-start gap-5">
                      <ProgressRing pct={adjReadiness.pct} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                              <ListChecks className="w-4 h-4 text-[hsl(var(--primary))]" /> Readiness
                              checks
                            </h3>
                            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                              {adjReadiness.passCount} of {adjReadiness.total} passing ·{" "}
                              {adjReadiness.unresolved} blocking promotion
                            </p>
                          </div>
                          {allClear ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                              <Check className="w-3 h-3" /> Ready to promote
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
                              <AlertCircle className="w-3 h-3" /> {adjReadiness.unresolved} to fix
                            </span>
                          )}
                        </div>
                        <ul className="space-y-1.5">
                          {adjustedChecks.map((c) => {
                            const Icon =
                              c.state === "pass"
                                ? Check
                                : c.state === "warn"
                                ? AlertTriangle
                                : X;
                            const colorWrap =
                              c.state === "pass"
                                ? "bg-emerald-100 text-emerald-700"
                                : c.state === "warn"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700";
                            const clickable = c.state !== "pass" && c.anchor;
                            return (
                              <li key={c.key}>
                                <button
                                  type="button"
                                  onClick={() => clickable && scrollTo(c.anchor)}
                                  className={cn(
                                    "w-full flex items-center gap-2 text-sm py-1 px-1 rounded text-left",
                                    clickable
                                      ? "hover:bg-[hsl(var(--muted))] cursor-pointer"
                                      : "cursor-default"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "inline-flex w-5 h-5 rounded-full items-center justify-center shrink-0",
                                      colorWrap
                                    )}
                                  >
                                    <Icon className="w-3 h-3" strokeWidth={3} />
                                  </span>
                                  <span
                                    className={cn(
                                      "flex-1",
                                      c.state === "pass" &&
                                        "text-[hsl(var(--muted-foreground))]"
                                    )}
                                  >
                                    {c.label}
                                  </span>
                                  {clickable && (
                                    <span className="text-[11px] text-[hsl(var(--primary))] font-medium inline-flex items-center gap-0.5">
                                      Jump <ArrowDown className="w-3 h-3" />
                                    </span>
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Unmapped Resolver — STAR */}
                  <div
                    id="section-unmapped"
                    className={cn(
                      "rounded-xl border bg-[hsl(var(--card))] overflow-hidden",
                      remainingUnmapped.length > 0
                        ? "border-amber-300/70 ring-1 ring-amber-200/60"
                        : "border-[hsl(var(--border))]"
                    )}
                  >
                    <div className="flex items-center justify-between px-5 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30">
                      <div className="flex items-center gap-2">
                        <Wand2 className="w-4 h-4 text-[hsl(var(--primary))]" />
                        <h3 className="text-sm font-semibold">Resolve unmapped ingredients</h3>
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">
                          {remainingUnmapped.length} of {openRow.unmappedIngredientNames.length}{" "}
                          remaining
                        </span>
                      </div>
                      <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                        Pick a suggestion or search the catalog
                      </span>
                    </div>

                    {openRow.unmappedIngredientNames.length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                        <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
                        Nothing to resolve — all {openRow.mappedIngredientCount} ingredients are mapped.
                      </div>
                    ) : (
                      <ul className="divide-y divide-[hsl(var(--border))]">
                        {openRow.unmappedIngredientNames.map((name) => {
                          const isResolved = resolvedForRow.has(name);
                          const sugg = suggestionsFor(name);
                          return (
                            <li
                              key={name}
                              className={cn(
                                "px-5 py-3 grid grid-cols-[180px_1fr_auto] items-center gap-4",
                                isResolved && "opacity-60"
                              )}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "w-1.5 h-1.5 rounded-full",
                                      isResolved ? "bg-emerald-500" : "bg-amber-500"
                                    )}
                                  />
                                  <span
                                    className={cn(
                                      "text-sm font-medium truncate",
                                      isResolved && "line-through"
                                    )}
                                    title={name}
                                  >
                                    {name}
                                  </span>
                                </div>
                                <span className="text-[11px] text-[hsl(var(--muted-foreground))] ml-3.5">
                                  raw text from import
                                </span>
                              </div>

                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                                <input
                                  type="search"
                                  defaultValue={name}
                                  disabled={isResolved}
                                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                                  placeholder="Search catalog…"
                                />
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                {isResolved ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                                    <Check className="w-3 h-3" /> Mapped
                                  </span>
                                ) : (
                                  <>
                                    {sugg.map((s) => (
                                      <button
                                        key={s}
                                        onClick={() => resolveOne(name)}
                                        className="px-2 py-1 rounded-full text-[11px] font-medium border border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/5 hover:text-[hsl(var(--primary))] transition-colors"
                                        title={`Map "${name}" → ${s}`}
                                      >
                                        {s}
                                      </button>
                                    ))}
                                    <button
                                      onClick={() => resolveOne(name)}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"
                                    >
                                      <Plus className="w-3 h-3" /> Create new
                                    </button>
                                  </>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Cooking steps — full-width hero so the operator can actually read the recipe */}
                  {(() => {
                    const steps = openRow.instructionsSummary ? parseSteps(openRow.instructionsSummary) : [];
                    return (
                      <div
                        id="section-instructions"
                        className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 space-y-4"
                      >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <h3 className="text-sm font-semibold flex items-center gap-2 text-[hsl(var(--foreground))]">
                            <BookOpen className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
                            Cooking steps
                          </h3>
                          {steps.length > 0 && (
                            <span className="text-[11px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                              {steps.length} step{steps.length === 1 ? "" : "s"} · imported summary
                            </span>
                          )}
                        </div>
                        {steps.length > 0 ? (
                          <ol className="space-y-3">
                            {steps.map((step, i) => (
                              <li
                                key={i}
                                className="flex gap-3 text-sm leading-relaxed text-[hsl(var(--foreground))]/90"
                              >
                                <span className="shrink-0 w-6 h-6 rounded-full bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] text-xs font-semibold inline-flex items-center justify-center tabular-nums">
                                  {i + 1}
                                </span>
                                <span className="pt-0.5">{step}</span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <div className="rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-4 text-sm text-[hsl(var(--muted-foreground))] flex items-start gap-2">
                            <Info className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                            <span>
                              No cooking steps were captured during import. An operator will need to add them before this recipe can be served.
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Meta + Media row */}
                  <div className="grid grid-cols-[1.4fr_1fr] gap-5">
                    <div className="space-y-4">
                      <div
                        id="section-meta"
                        className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] divide-y divide-[hsl(var(--border))]"
                      >
                        <div className="flex items-center justify-between p-3 text-sm">
                          <span className="text-[hsl(var(--muted-foreground))] flex items-center gap-2">
                            <Clock className="w-4 h-4" /> Estimated time
                          </span>
                          <span
                            className={cn(
                              "font-medium",
                              !openRow.estimatedTimeMin && "text-amber-600"
                            )}
                          >
                            {openRow.estimatedTimeMin ? `${openRow.estimatedTimeMin}m` : "missing"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-3 text-sm">
                          <span className="text-[hsl(var(--muted-foreground))]">Mapping rate</span>
                          <span className="font-medium tabular-nums">
                            {Math.round((mappedNow / Math.max(totalIngredients, 1)) * 100)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-3 text-sm">
                          <span className="text-[hsl(var(--muted-foreground))]">Cuisine</span>
                          <span className="font-medium">
                            {openRow.cuisineTags.join(", ") || "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-3 text-sm">
                          <span className="text-[hsl(var(--muted-foreground))]">Imported</span>
                          <span className="font-medium">
                            {new Date(openRow.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div id="section-media" className="space-y-4">
                      <div className="rounded-xl overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--card))] aspect-[4/3] flex items-center justify-center">
                        {openRow.imageUrl ? (
                          <img
                            src={openRow.imageUrl}
                            alt={openRow.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-amber-600">
                            <ImageIcon className="w-10 h-10" />
                            <span className="text-xs font-medium">No image attached</span>
                            <button className="text-[11px] text-[hsl(var(--primary))] hover:underline inline-flex items-center gap-1">
                              <Plus className="w-3 h-3" /> Attach image
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3 text-xs text-[hsl(var(--muted-foreground))] flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>
                          Why is this here?{" "}
                          <span className="text-[hsl(var(--foreground))] font-medium">
                            {SOURCE_LABEL[openRow.source] ?? openRow.source}
                          </span>{" "}
                          · {new Date(openRow.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              {/* Action Bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))] z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                {/* Preview line */}
                <div
                  className={cn(
                    "px-8 py-2 text-xs flex items-center gap-2 border-b border-[hsl(var(--border))]/60",
                    allClear
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-amber-50 text-amber-900"
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold">What happens if you promote now?</span>{" "}
                    Promoting will create 1 recipe with{" "}
                    <span className="font-semibold tabular-nums">
                      {mappedNow}/{totalIngredients}
                    </span>{" "}
                    ingredients mapped.{" "}
                    {remainingUnmapped.length > 0
                      ? `${remainingUnmapped.length} substitution${
                          remainingUnmapped.length === 1 ? "" : "s"
                        } needed at cook time.`
                      : "No substitutions required."}
                  </span>
                </div>

                <div className="px-8 py-3 flex items-end gap-3">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Add an optional decision note…"
                      disabled={isFinal}
                      className="w-full px-4 py-2 rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/30"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={isFinal}
                      onClick={() => handleAction("rejected")}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                    <button
                      disabled={isFinal}
                      onClick={() => handleAction("promoted")}
                      className={cn(
                        "inline-flex items-center justify-center gap-2 px-5 py-2 rounded-md text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                        allClear
                          ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                          : "bg-amber-500 text-white hover:bg-amber-600"
                      )}
                    >
                      {allClear ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" /> Promote
                          <Check className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4" /> Promote ({adjReadiness.unresolved}{" "}
                          issue{adjReadiness.unresolved === 1 ? "" : "s"})
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

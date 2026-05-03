import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useListOpsStaging,
  useGetOpsStagingDetail,
  usePromoteOpsStaging,
  useRejectOpsStaging,
  useRemapOpsStagingIngredients,
  useReextractOpsStagingIngredients,
  getListOpsStagingQueryKey,
  type OpsStagingRow,
  type OpsStagingDetail,
  type ListOpsStagingStatus,
  OpsStagingReextractBodySource,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/ui/page-header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  Search,
  ExternalLink,
  AlertTriangle,
  Wand2,
  Keyboard,
  Clock,
  BookOpen,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  AlertCircle,
  Sparkles,
  ArrowDown,
  Info,
  ListChecks,
} from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  imported: "bg-blue-100 text-blue-700 border-blue-200",
  ready: "bg-emerald-100 text-emerald-700 border-emerald-200",
  needs_review: "bg-orange-100 text-orange-700 border-orange-200",
  promoted: "bg-purple-100 text-purple-700 border-purple-200",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const FILTER_LABELS: Record<string, string> = {
  pending: "In queue",
  imported: "Imported",
  ready: "Ready",
  needs_review: "Needs review",
  promoted: "Promoted",
  rejected: "Rejected",
  all: "All",
};

const FILTER_TITLES: Record<string, string> = {
  pending:
    "Everything not yet promoted or rejected (imported + ready + needs review)",
};

type CheckState = "pass" | "warn" | "fail";
type CheckResult = {
  key: string;
  label: string;
  state: CheckState;
  anchor?: string;
};

// Row-level checks. The list endpoint omits `instructionsSummary`, so
// instructions are not part of the row dot row — only the detail view
// surfaces that fifth check.
function getRowChecks(r: OpsStagingRow): CheckResult[] {
  const unmapped = r.unmappedIngredientNames.length;
  return [
    {
      key: "title",
      label: r.title ? "Title set" : "Title missing",
      state: r.title ? "pass" : "fail",
    },
    {
      key: "image",
      label: r.imageUrl ? "Image present" : "No image attached",
      state: r.imageUrl ? "pass" : "warn",
    },
    {
      key: "ingredients",
      label:
        unmapped === 0
          ? "All ingredients mapped"
          : `${unmapped} ingredient${unmapped === 1 ? "" : "s"} unmapped`,
      state: unmapped === 0 ? "pass" : "fail",
    },
    {
      key: "time",
      label: r.estimatedTimeMin ? "Cooking time set" : "Cooking time missing",
      state: r.estimatedTimeMin ? "pass" : "warn",
    },
  ];
}

function getDetailChecks(d: OpsStagingDetail): CheckResult[] {
  const unmapped = d.unmappedIngredientNames.length;
  const hasSteps =
    (Array.isArray(d.instructionsSteps) && d.instructionsSteps.length > 0) ||
    (typeof d.instructionsSummary === "string" && d.instructionsSummary.trim().length > 0);
  return [
    {
      key: "title",
      label: d.title ? "Title set" : "Title missing",
      state: d.title ? "pass" : "fail",
      anchor: "section-header",
    },
    {
      key: "image",
      label: d.imageUrl ? "Image present" : "No image attached",
      state: d.imageUrl ? "pass" : "warn",
      anchor: "section-media",
    },
    {
      key: "ingredients",
      label:
        unmapped === 0
          ? "All ingredients mapped"
          : `${unmapped} ingredient${unmapped === 1 ? "" : "s"} unmapped — resolve below`,
      state: unmapped === 0 ? "pass" : "fail",
      anchor: "section-unmapped",
    },
    {
      key: "instructions",
      label: hasSteps
        ? "Cooking steps captured"
        : "No cooking steps — operator must add",
      state: hasSteps ? "pass" : "fail",
      anchor: "section-instructions",
    },
    {
      key: "time",
      label: d.estimatedTimeMin ? "Cooking time set" : "Cooking time missing",
      state: d.estimatedTimeMin ? "pass" : "warn",
      anchor: "section-meta",
    },
  ];
}

function readinessFromChecks(checks: CheckResult[]) {
  const total = checks.length || 1;
  const passCount = checks.filter((c) => c.state === "pass").length;
  const unresolved = checks.filter((c) => c.state !== "pass").length;
  return {
    pct: Math.round((passCount / total) * 100),
    passCount,
    total: checks.length,
    unresolved,
  };
}

// Pull cooking steps out of detail. Prefer structured `instructionsSteps`
// (Wikibooks gives us `{ text, index }`-shaped objects); fall back to
// splitting `instructionsSummary` on newlines, semicolons, or sentence
// boundaries so the operator at least gets a numbered list.
function getCookingSteps(d: OpsStagingDetail): string[] {
  if (Array.isArray(d.instructionsSteps) && d.instructionsSteps.length > 0) {
    const out: string[] = [];
    for (const raw of d.instructionsSteps) {
      if (typeof raw === "string") {
        const t = raw.trim();
        if (t) out.push(t);
        continue;
      }
      if (raw && typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        const candidate =
          (typeof obj.text === "string" && obj.text) ||
          (typeof obj.step === "string" && obj.step) ||
          (typeof obj.instruction === "string" && obj.instruction) ||
          "";
        const t = candidate.trim();
        if (t) out.push(t);
      }
    }
    if (out.length > 0) return out;
  }
  const summary = d.instructionsSummary?.trim();
  if (!summary) return [];
  // Try newlines first (real recipes usually break on newlines).
  let parts = summary.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) {
    // Fall back to "; " or sentence boundary.
    parts = summary
      .split(/;|\.\s+(?=[A-Z])/)
      .map((s) => s.replace(/^\s+|[\s.;]+$/g, ""))
      .filter(Boolean);
  }
  return parts.map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

function ReadinessDots({ checks }: { checks: CheckResult[] }) {
  return (
    <div className="flex items-center gap-1" aria-label="Readiness">
      {checks.map((c) => (
        <span
          key={c.key}
          title={c.label}
          className={cn(
            "w-2 h-2 rounded-full",
            c.state === "pass" && "bg-emerald-500",
            c.state === "warn" && "bg-amber-400",
            c.state === "fail" && "bg-border",
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
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">
          ready
        </span>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-medium font-mono text-muted-foreground bg-muted border border-border rounded uppercase shadow-sm">
      {children}
    </kbd>
  );
}

function QueueRow({
  r,
  selected,
  onClick,
  registerRef,
}: {
  r: OpsStagingRow;
  selected: boolean;
  onClick: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const checks = getRowChecks(r);
  const ready = readinessFromChecks(checks);
  return (
    <div
      ref={registerRef}
      onClick={onClick}
      data-testid={`queue-row-${r.id}`}
      title={`Imported from ${r.source} · ${new Date(r.createdAt).toLocaleString()}`}
      className="group cursor-pointer transition-colors border-l-[3px] p-3 hover:bg-muted/50 border-l-transparent pr-[0px]"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
          {r.source}
        </span>
        <ReadinessDots checks={checks} />
      </div>
      <h3
        className={cn(
          "text-sm font-medium leading-tight truncate",
          selected ? "text-primary" : "text-foreground",
        )}
      >
        {r.title}
      </h3>
      <div className="flex items-center justify-between gap-2 mt-2 min-w-0">
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0",
            STATUS_BADGE[r.status] ?? "bg-muted text-muted-foreground border-transparent",
          )}
        >
          {r.status}
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 whitespace-nowrap">
          <span className="tabular-nums">
            {ready.passCount}/{ready.total} checks
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
}

function DetailPane({
  detail,
  isLoading,
  note,
  onNoteChange,
  onPromote,
  onReject,
  promoteDisabled,
  rejectDisabled,
}: {
  detail: OpsStagingDetail | undefined;
  isLoading: boolean;
  note: string;
  onNoteChange: (v: string) => void;
  onPromote: () => void;
  onReject: () => void;
  promoteDisabled: boolean;
  rejectDisabled: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Not found
      </div>
    );
  }

  const isFinal = ["promoted", "rejected"].includes(detail.status);
  const promoteDisabledFinal = promoteDisabled || isFinal;
  const rejectDisabledFinal = rejectDisabled || isFinal;

  const checks = getDetailChecks(detail);
  const readiness = readinessFromChecks(checks);
  const allClear = readiness.unresolved === 0;
  const totalIngredients =
    detail.mappedIngredientCount + detail.unmappedIngredientNames.length;
  const steps = getCookingSteps(detail);

  const scrollTo = (anchor?: string) => {
    if (!anchor) return;
    const el = document.getElementById(anchor);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <ScrollArea className="flex-1">
        <div className="px-8 py-6 max-w-4xl mx-auto space-y-6 pb-48">
          {/* Header */}
          <div id="section-header" className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span className="uppercase tracking-wider font-semibold text-[10px] bg-muted px-2 py-0.5 rounded">
                {detail.source}
              </span>
              {detail.sourceRecipeId && (
                <span>
                  ID: <span className="font-mono">{detail.sourceRecipeId}</span>
                </span>
              )}
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium border ml-1",
                  STATUS_BADGE[detail.status] ?? "bg-muted",
                )}
              >
                {detail.status}
              </span>
              {detail.promotedRecipeId && (
                <Link
                  href={`/recipes/${detail.promotedRecipeId}`}
                  className="ml-1 text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  recipe {detail.promotedRecipeId.slice(0, 8)}
                </Link>
              )}
              {detail.sourceUrl && (
                <a
                  href={detail.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Source URL
                </a>
              )}
            </div>
            <h2 className="text-2xl font-bold tracking-tight leading-tight">
              {detail.title}
            </h2>
          </div>

          {/* Readiness Summary */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-5">
              <ProgressRing pct={readiness.pct} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-primary" /> Readiness checks
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {readiness.passCount} of {readiness.total} passing ·{" "}
                      {readiness.unresolved} blocking promotion
                    </p>
                  </div>
                  {allClear ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                      <Check className="w-3 h-3" /> Ready to promote
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
                      <AlertCircle className="w-3 h-3" /> {readiness.unresolved} to fix
                    </span>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {checks.map((c) => {
                    const Icon =
                      c.state === "pass" ? Check : c.state === "warn" ? AlertTriangle : X;
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
                              ? "hover:bg-muted cursor-pointer"
                              : "cursor-default",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-flex w-5 h-5 rounded-full items-center justify-center shrink-0",
                              colorWrap,
                            )}
                          >
                            <Icon className="w-3 h-3" strokeWidth={3} />
                          </span>
                          <span
                            className={cn(
                              "flex-1",
                              c.state === "pass" && "text-muted-foreground",
                            )}
                          >
                            {c.label}
                          </span>
                          {clickable && (
                            <span className="text-[11px] text-primary font-medium inline-flex items-center gap-0.5">
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

          {/* Unmapped resolver — no fake suggestion pills, since we don't yet
              have an ingredient-search API. We show the raw names prominently
              and point operators at the existing top-bar Re-map action. */}
          <div
            id="section-unmapped"
            className={cn(
              "rounded-xl border bg-card overflow-hidden",
              detail.unmappedIngredientNames.length > 0
                ? "border-amber-300/70 ring-1 ring-amber-200/60"
                : "border-border",
            )}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30 gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Unmapped ingredients</h3>
                <span className="text-xs text-muted-foreground">
                  {detail.unmappedIngredientNames.length} of {totalIngredients} total
                </span>
              </div>
              {detail.unmappedIngredientNames.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  Use <span className="font-medium text-foreground">Re-map ingredients</span>{" "}
                  in the top bar to retry mapping
                </span>
              )}
            </div>

            {detail.unmappedIngredientNames.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
                Nothing to resolve — all {detail.mappedIngredientCount} ingredients are
                mapped.
              </div>
            ) : (
              <ul className="divide-y divide-border" data-testid="unmapped-list">
                {detail.unmappedIngredientNames.map((name) => (
                  <li
                    key={name}
                    className="px-5 py-3 grid grid-cols-[200px_1fr] items-center gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        <span className="text-sm font-medium truncate" title={name}>
                          {name}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground ml-3.5">
                        raw text from import
                      </span>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        type="search"
                        defaultValue={name}
                        disabled
                        aria-disabled="true"
                        title="Catalog search coming soon — use Re-map ingredients in the top bar for now"
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-input bg-muted/40 text-muted-foreground cursor-not-allowed"
                        placeholder="Catalog search coming soon"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Cooking steps — full width, prominent so the operator can read the recipe. */}
          <div
            id="section-instructions"
            className="rounded-2xl border border-border bg-card p-5 space-y-4"
            data-testid="section-instructions"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-muted-foreground" />
                Cooking steps
              </h3>
              {steps.length > 0 && (
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {steps.length} step{steps.length === 1 ? "" : "s"}
                  {Array.isArray(detail.instructionsSteps) &&
                  detail.instructionsSteps.length > 0
                    ? " · structured"
                    : " · parsed from summary"}
                </span>
              )}
            </div>
            {steps.length > 0 ? (
              <ol className="space-y-3">
                {steps.map((step, i) => (
                  <li
                    key={i}
                    className="flex gap-3 text-sm leading-relaxed text-foreground/90"
                  >
                    <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold inline-flex items-center justify-center tabular-nums">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 whitespace-pre-wrap">{step}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                <span>
                  No cooking steps were captured during import. An operator will need to
                  add them before this recipe can be served.
                </span>
              </div>
            )}
          </div>

          {/* Meta + Media row */}
          <div className="grid grid-cols-[1.4fr_1fr] gap-5">
            <div className="space-y-4">
              <div
                id="section-meta"
                className="rounded-xl border border-border bg-card divide-y divide-border"
              >
                <div className="flex items-center justify-between p-3 text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Estimated time
                  </span>
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      !detail.estimatedTimeMin && "text-amber-600",
                    )}
                  >
                    {detail.estimatedTimeMin ? `${detail.estimatedTimeMin}m` : "missing"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 text-sm">
                  <span className="text-muted-foreground">Mapping rate</span>
                  <span className="font-medium tabular-nums">
                    {detail.mappingRate != null
                      ? `${Math.round(detail.mappingRate * 100)}%`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 text-sm">
                  <span className="text-muted-foreground">Cuisine</span>
                  <span className="font-medium">
                    {detail.cuisineTags.join(", ") || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 text-sm">
                  <span className="text-muted-foreground">Imported</span>
                  <span className="font-medium">
                    {new Date(detail.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            <div id="section-media" className="space-y-4">
              <div className="rounded-xl overflow-hidden border border-border bg-card aspect-[4/3] flex items-center justify-center">
                {detail.imageUrl ? (
                  <img
                    src={detail.imageUrl}
                    alt={detail.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-amber-600">
                    <ImageIcon className="w-10 h-10" />
                    <span className="text-xs font-medium">No image attached</span>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Imported from{" "}
                  <span className="text-foreground font-medium">{detail.source}</span> ·{" "}
                  {new Date(detail.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Action bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-card border-t border-border z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div
          className={cn(
            "px-8 py-2 text-xs flex items-center gap-2 border-b border-border/60",
            allClear ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900",
          )}
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span>
            <span className="font-semibold">What happens if you promote now?</span>{" "}
            Promoting will create 1 recipe with{" "}
            <span className="font-semibold tabular-nums">
              {detail.mappedIngredientCount}/{totalIngredients}
            </span>{" "}
            ingredients mapped.{" "}
            {detail.unmappedIngredientNames.length > 0
              ? `${detail.unmappedIngredientNames.length} substitution${
                  detail.unmappedIngredientNames.length === 1 ? "" : "s"
                } needed at cook time.`
              : "No substitutions required."}
          </span>
        </div>

        <div className="px-8 py-3 flex items-end gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={
                isFinal
                  ? "This recipe is already finalized."
                  : "Add an optional decision note…"
              }
              disabled={isFinal}
              data-testid="input-decision-note"
              className="w-full px-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all placeholder:text-muted-foreground/70"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              disabled={rejectDisabledFinal}
              onClick={onReject}
              data-testid="button-reject"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-input bg-background text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XCircle className="w-4 h-4" /> Reject <Kbd>R</Kbd>
            </button>
            <button
              disabled={promoteDisabledFinal}
              onClick={onPromote}
              data-testid="button-promote"
              className={cn(
                "inline-flex items-center justify-center gap-2 px-5 py-2 rounded-md text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                allClear
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "bg-amber-500 text-white hover:bg-amber-600",
              )}
            >
              {allClear ? (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Promote <Kbd>P</Kbd>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4" /> Promote ({readiness.unresolved}{" "}
                  issue{readiness.unresolved === 1 ? "" : "s"}) <Kbd>P</Kbd>
                </>
              )}
            </button>
          </div>
        </div>
        <div className="px-8 pb-2 flex justify-between items-center text-[10px] text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Keyboard className="w-3 h-3" /> Shortcuts
            </span>
            <span className="flex items-center gap-1">
              <Kbd>J</Kbd> <Kbd>K</Kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>P</Kbd> Promote
            </span>
            <span className="flex items-center gap-1">
              <Kbd>R</Kbd> Reject
            </span>
          </div>
          <span className="font-mono">{detail.id}</span>
        </div>
      </div>
    </>
  );
}

const QUEUE_WIDTH_KEY = "recipes-staging:queue-width";
const QUEUE_WIDTH_MIN = 280;
const QUEUE_WIDTH_MAX = 720;
const QUEUE_WIDTH_DEFAULT = 440;

export function RecipesStagingPage() {
  const [status, setStatus] = useState<string>("pending");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [queueWidth, setQueueWidth] = useState<number>(() => {
    if (typeof window === "undefined") return QUEUE_WIDTH_DEFAULT;
    const stored = Number(window.localStorage.getItem(QUEUE_WIDTH_KEY));
    if (!Number.isFinite(stored) || stored <= 0) return QUEUE_WIDTH_DEFAULT;
    return Math.min(QUEUE_WIDTH_MAX, Math.max(QUEUE_WIDTH_MIN, stored));
  });
  const [isResizing, setIsResizing] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(QUEUE_WIDTH_KEY, String(queueWidth));
  }, [queueWidth]);
  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      setQueueWidth((prev) => {
        const next = Math.min(
          QUEUE_WIDTH_MAX,
          Math.max(QUEUE_WIDTH_MIN, e.clientX),
        );
        return next === prev ? prev : next;
      });
    };
    const onUp = () => setIsResizing(false);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const list = useListOpsStaging({
    status: status as ListOpsStagingStatus,
    source: source || undefined,
    q: q || undefined,
    page,
    limit: 50,
    sort: "createdAt",
    dir: "desc",
  });

  const rows: OpsStagingRow[] = list.data?.rows ?? [];
  const facets = list.data?.facets;
  const totalPages = Math.ceil((list.data?.total ?? 0) / 50);

  useEffect(() => {
    if (rows.length === 0) {
      if (openId !== null) setOpenId(null);
      return;
    }
    if (!openId || !rows.some((r) => r.id === openId)) {
      setOpenId(rows[0].id);
    }
  }, [rows, openId]);

  useEffect(() => {
    setNote("");
  }, [openId]);

  useEffect(() => {
    if (!openId) return;
    const el = rowRefs.current.get(openId);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [openId]);

  const detail = useGetOpsStagingDetail(openId ?? "");

  const invalidateLists = () => {
    qc.invalidateQueries({ queryKey: getListOpsStagingQueryKey().slice(0, 1) });
    qc.invalidateQueries({
      predicate: (query) => {
        const k = query.queryKey?.[0];
        return typeof k === "string" && k.startsWith("/api/ops/recipes/staging/");
      },
    });
  };

  const goRelative = (delta: number) => {
    if (rows.length === 0) return;
    const idx = openId ? rows.findIndex((r) => r.id === openId) : -1;
    const next = Math.min(rows.length - 1, Math.max(0, idx + delta));
    if (next !== idx) setOpenId(rows[next].id);
  };

  const advanceAfterAction = () => {
    if (rows.length <= 1) {
      setOpenId(null);
      return;
    }
    const idx = openId ? rows.findIndex((r) => r.id === openId) : -1;
    const next = idx >= 0 && idx < rows.length - 1 ? rows[idx + 1] : rows[Math.max(0, idx - 1)];
    setOpenId(next.id);
  };

  const promote = usePromoteOpsStaging({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: "Promoted",
          description: `Recipe id ${data.recipeId.slice(0, 8)}…`,
        });
        advanceAfterAction();
        invalidateLists();
      },
      onError: (e: Error) =>
        toast({ title: "Promote failed", description: e.message, variant: "destructive" }),
    },
  });

  const reject = useRejectOpsStaging({
    mutation: {
      onSuccess: () => {
        toast({ title: "Rejected" });
        advanceAfterAction();
        invalidateLists();
      },
      onError: (e: Error) =>
        toast({ title: "Reject failed", description: e.message, variant: "destructive" }),
    },
  });

  const remap = useRemapOpsStagingIngredients({
    mutation: {
      onSuccess: (d) => {
        toast({
          title: "Re-mapped staging rows",
          description: `Scanned ${d.scanned}, updated ${d.touched}, +${d.newlyMappedIngredients} ingredients mapped, ${d.promotedToReady} now ready.`,
        });
        invalidateLists();
      },
      onError: (e: Error) =>
        toast({ title: "Re-map failed", description: e.message, variant: "destructive" }),
    },
  });

  const reextract = useReextractOpsStagingIngredients({
    mutation: {
      onSuccess: (d) => {
        toast({
          title: "Re-extracted wikibooks rows",
          description: `Scanned ${d.scanned}, updated ${d.touched}, ${d.errors} errors, ${d.promotedToReady} now ready (Δ ${d.mappedDelta >= 0 ? "+" : ""}${d.mappedDelta} ingredients).`,
        });
        invalidateLists();
      },
      onError: (e: Error) =>
        toast({ title: "Re-extract failed", description: e.message, variant: "destructive" }),
    },
  });

  const canAct = (): boolean => {
    if (!openId) return false;
    const d = detail.data;
    if (!d) return false;
    if (["promoted", "rejected"].includes(d.status)) return false;
    if (promote.isPending || reject.isPending) return false;
    return true;
  };

  const doPromote = () => {
    if (!canAct() || !openId || !detail.data) return;
    if (
      window.confirm(
        `Promote "${detail.data.title}" into the live recipes catalog? This cannot be undone from the UI.`,
      )
    ) {
      promote.mutate({ stagingId: openId, data: { note: note || undefined } });
    }
  };

  const doReject = () => {
    if (!canAct() || !openId || !detail.data) return;
    if (
      window.confirm(
        `Reject "${detail.data.title}"? It will be hidden from the staging queue.`,
      )
    ) {
      reject.mutate({ stagingId: openId, data: { note: note || undefined } });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case "j":
          e.preventDefault();
          goRelative(1);
          break;
        case "k":
          e.preventDefault();
          goRelative(-1);
          break;
        case "p":
          e.preventDefault();
          doPromote();
          break;
        case "r":
          e.preventDefault();
          doReject();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, openId, detail.data, note, promote.isPending, reject.isPending]);

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    (facets?.statuses ?? []).forEach((f) => {
      map[f.status] = f.count;
    });
    map.pending =
      (map.imported ?? 0) + (map.ready ?? 0) + (map.needs_review ?? 0);
    map.all = (facets?.statuses ?? []).reduce((s, f) => s + f.count, 0);
    return map;
  }, [facets]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Recipe Staging"
        description="Imports from TheMealDB / Wikibooks waiting to be promoted into the catalog"
        actions={
          <div className="flex items-center gap-2">
            {source === "wikibooks" && (
              <button
                onClick={() =>
                  reextract.mutate({
                    data: { source: OpsStagingReextractBodySource.wikibooks },
                  })
                }
                disabled={reextract.isPending}
                data-testid="button-reextract-wikibooks"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-input bg-background hover:bg-muted disabled:opacity-50"
                title="Re-fetch wikitext from Wikibooks and re-run structured ingredient extraction (capped at 50)"
              >
                <Wand2 className="w-4 h-4" />
                {reextract.isPending ? "Re-extracting…" : "Re-extract from source"}
              </button>
            )}
            <button
              onClick={() => remap.mutate({ data: { source: source || undefined } })}
              disabled={remap.isPending}
              data-testid="button-remap"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-input bg-background hover:bg-muted disabled:opacity-50"
              title="Re-run ingredient mapping over imported / needs_review rows (capped at 200)"
            >
              <Wand2 className="w-4 h-4" />
              {remap.isPending ? "Re-mapping…" : "Re-map ingredients"}
            </button>
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Queue */}
        <div
          style={{ width: queueWidth }}
          className="flex flex-col border-r border-border bg-card z-10 shrink-0"
        >
          <div className="p-3 border-b border-border space-y-2 bg-card shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search queue…"
                data-testid="input-queue-search"
                className="w-full pl-8 pr-3 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                data-testid="select-status"
                title={FILTER_TITLES[status]}
                className="flex-1 px-2 py-1.5 rounded border border-input bg-background text-xs focus:outline-none text-foreground"
              >
                {[
                  "pending",
                  "imported",
                  "ready",
                  "needs_review",
                  "promoted",
                  "rejected",
                  "all",
                ].map((s) => (
                  <option key={s} value={s}>
                    {FILTER_LABELS[s]} ({statusCounts[s] ?? 0})
                  </option>
                ))}
              </select>
              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setPage(1);
                }}
                data-testid="select-source"
                className="flex-1 px-2 py-1.5 rounded border border-input bg-background text-xs focus:outline-none text-foreground"
              >
                <option value="">All sources</option>
                {(facets?.sources ?? []).map((s) => (
                  <option key={s.source} value={s.source}>
                    {s.source} ({s.count})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground pt-1">
              <span>{rows.length} in view</span>
              <span className="flex items-center gap-1">
                <ListChecks className="w-3 h-3" /> readiness shown as ●●●●
              </span>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="divide-y divide-border/60">
              {list.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="p-3 space-y-2">
                    <div className="h-3 bg-muted rounded w-1/3 animate-pulse" />
                    <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
                    <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
                  </div>
                ))
              ) : rows.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Nothing in {FILTER_LABELS[status] ?? status}
                </div>
              ) : (
                rows.map((r) => (
                  <QueueRow
                    key={r.id}
                    r={r}
                    selected={openId === r.id}
                    onClick={() => setOpenId(r.id)}
                    registerRef={(el) => {
                      if (el) rowRefs.current.set(r.id, el);
                      else rowRefs.current.delete(r.id);
                    }}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          {totalPages > 1 && (
            <div className="border-t border-border p-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground tabular-nums">
                Page {page} of {totalPages} · {list.data?.total ?? 0} total
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-page-prev"
                  className="p-1 rounded border border-border hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  data-testid="button-page-next"
                  className="p-1 rounded border border-border hover:bg-muted disabled:opacity-40"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Resize handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize queue panel"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
          onDoubleClick={() => setQueueWidth(QUEUE_WIDTH_DEFAULT)}
          title="Drag to resize · double-click to reset"
          data-testid="queue-resize-handle"
          className={cn(
            "relative w-1 shrink-0 cursor-col-resize z-20 group",
            isResizing ? "bg-primary/40" : "bg-transparent hover:bg-primary/20",
          )}
        >
          <span
            className={cn(
              "absolute inset-y-0 -left-1 -right-1",
              isResizing && "bg-primary/10",
            )}
          />
        </div>

        {/* Detail */}
        <div className="flex-1 flex flex-col bg-background relative overflow-hidden min-w-0">
          {!openId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">
                  {list.isLoading ? "Loading queue…" : "Queue is clear"}
                </p>
                <p className="text-sm mt-1">
                  {list.isLoading
                    ? "Fetching imported recipes"
                    : `${rows.length} recipe(s) match this filter`}
                </p>
              </div>
            </div>
          ) : (
            <DetailPane
              detail={detail.data}
              isLoading={detail.isLoading}
              note={note}
              onNoteChange={setNote}
              onPromote={doPromote}
              onReject={doReject}
              promoteDisabled={!canAct()}
              rejectDisabled={!canAct()}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default RecipesStagingPage;

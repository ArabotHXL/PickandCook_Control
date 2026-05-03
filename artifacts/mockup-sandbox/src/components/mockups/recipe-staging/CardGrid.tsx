import "./_group.css";
import React, { useState, useMemo } from "react";
import {
  CheckCircle,
  XCircle,
  Search,
  Eye,
  AlertTriangle,
  Wand2,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import { MOCK_ROWS, FACETS, type StagingRow } from "./_data";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<string, string> = {
  imported: "bg-blue-100 text-blue-800 border-blue-200",
  ready: "bg-emerald-100 text-emerald-800 border-emerald-200",
  needs_review: "bg-orange-100 text-orange-800 border-orange-200",
  promoted: "bg-purple-100 text-purple-800 border-purple-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

function MappingRing({ rate }: { rate: number | null | undefined }) {
  if (rate == null) return <div className="w-10 h-10 flex items-center justify-center text-[hsl(var(--muted-foreground))] text-xs">—</div>;
  const pct = Math.round(rate * 100);
  const colorClass =
    pct >= 80 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-rose-500";

  return (
    <div className="relative flex items-center justify-center w-10 h-10" title={`Ingredient Mapping Rate: ${pct}%`}>
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
        <path
          className="text-[hsl(var(--border))]"
          strokeWidth="3"
          stroke="currentColor"
          fill="none"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          className={cn("transition-all duration-500 ease-out", colorClass)}
          strokeWidth="3"
          strokeDasharray={`${pct}, 100`}
          strokeLinecap="round"
          stroke="currentColor"
          fill="none"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      <span className="absolute text-[10px] font-bold text-[hsl(var(--foreground))] tabular-nums">
        {pct}
      </span>
    </div>
  );
}

function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between px-8 pt-8 pb-6 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] font-serif">
          {title}
        </h1>
        {description && (
          <p className="text-base text-[hsl(var(--muted-foreground))] mt-2 font-medium">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3 mt-4 sm:mt-0">{actions}</div>}
    </div>
  );
}

function ImagePlaceholder({ title }: { title: string }) {
  const initial = title.charAt(0).toUpperCase();
  return (
    <div className="w-full h-full bg-gradient-to-br from-[hsl(var(--muted))] to-[hsl(var(--border))] flex items-center justify-center">
      <span className="text-4xl font-serif text-[hsl(var(--muted-foreground))]/40 font-bold">
        {initial}
      </span>
    </div>
  );
}

function RecipeCard({
  row,
  onClick,
}: {
  row: StagingRow;
  onClick: () => void;
}) {
  const [confirmAction, setConfirmAction] = useState<"promote" | "reject" | null>(null);

  const handlePromote = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmAction("promote");
  };

  const handleReject = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmAction("reject");
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Simulate action
    setConfirmAction(null);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmAction(null);
  };

  const isFinal = ["promoted", "rejected"].includes(row.status);

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer"
    >
      {/* Image Header */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[hsl(var(--muted))]">
        {row.imageUrl ? (
          <img
            src={row.imageUrl}
            alt={row.title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <ImagePlaceholder title={row.title} />
        )}
        <div className="absolute top-3 left-3">
          <span
            className={cn(
              "px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border shadow-sm backdrop-blur-md bg-white/90",
              STATUS_BADGE[row.status] || "bg-white text-gray-800 border-gray-200"
            )}
          >
            {row.status}
          </span>
        </div>
        <div className="absolute top-3 right-3 bg-[hsl(var(--card))] shadow-sm rounded-full p-1">
          <MappingRing rate={row.mappingRate} />
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-5">
        <div className="flex items-center gap-2 mb-2 text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
          <span>{row.source}</span>
          {row.estimatedTimeMin && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {row.estimatedTimeMin}m
              </span>
            </>
          )}
        </div>
        <h3 className="text-xl font-serif font-bold text-[hsl(var(--card-foreground))] leading-tight mb-4 line-clamp-2">
          {row.title}
        </h3>

        {/* Unmapped Ingredients Chips */}
        {row.unmappedIngredientNames.length > 0 ? (
          <div className="mt-auto pt-2 border-t border-[hsl(var(--border))]">
            <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              Unmapped Ingredients
            </p>
            <div className="flex flex-wrap gap-1.5">
              {row.unmappedIngredientNames.slice(0, 3).map((name) => (
                <span
                  key={name}
                  className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 rounded text-[11px] font-medium whitespace-nowrap"
                >
                  {name}
                </span>
              ))}
              {row.unmappedIngredientNames.length > 3 && (
                <span className="px-2 py-0.5 bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))] rounded text-[11px] font-medium">
                  +{row.unmappedIngredientNames.length - 3} more
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-auto pt-2 border-t border-[hsl(var(--border))]">
            <p className="text-xs font-semibold text-emerald-600 mb-2 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              All ingredients mapped
            </p>
          </div>
        )}
      </div>

      {/* Actions Strip */}
      {!isFinal && (
        <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 relative h-12 overflow-hidden flex">
          {confirmAction ? (
            <div className="absolute inset-0 bg-[hsl(var(--card))] flex items-center justify-between px-4 z-10 animate-in slide-in-from-bottom-2">
              <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                Confirm {confirmAction}?
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancel}
                  className="text-xs font-medium px-3 py-1.5 rounded-md hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className={cn(
                    "text-xs font-medium px-3 py-1.5 rounded-md text-white shadow-sm",
                    confirmAction === "promote"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-rose-600 hover:bg-rose-700"
                  )}
                >
                  Yes, {confirmAction}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex w-full divide-x divide-[hsl(var(--border))]">
              <button
                onClick={handlePromote}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Promote
              </button>
              <button
                onClick={handleReject}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-rose-50 hover:text-rose-700 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StagingDetailDrawer({
  row,
  onClose,
}: {
  row: StagingRow | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);

  if (!row) return null;
  const isFinal = ["promoted", "rejected"].includes(row.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative w-[640px] max-w-[100vw] bg-[hsl(var(--card))] border-l border-[hsl(var(--border))] shadow-2xl flex flex-col h-full animate-in slide-in-from-right-8 duration-300 ease-out">
        {/* Header */}
        <div className="flex-none px-8 py-6 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] relative">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] transition-colors"
          >
            <XCircle className="w-5 h-5" />
          </button>
          <div className="pr-10">
            <p className="text-xs uppercase tracking-widest font-semibold text-[hsl(var(--muted-foreground))] mb-2">
              {row.source} · {row.sourceRecipeId}
            </p>
            <h2 className="text-2xl font-serif font-bold text-[hsl(var(--foreground))] leading-tight">
              {row.title}
            </h2>
            <div className="flex items-center gap-3 mt-4">
              <span
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border",
                  STATUS_BADGE[row.status] || "bg-[hsl(var(--muted))]"
                )}
              >
                {row.status}
              </span>
              <div className="h-4 w-px bg-[hsl(var(--border))]" />
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Mapping:</span>
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-[hsl(var(--muted))] text-xs font-bold tabular-nums">
                  {row.mappingRate ? `${Math.round(row.mappingRate * 100)}%` : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {row.imageUrl ? (
            <img
              src={row.imageUrl}
              alt={row.title}
              className="w-full max-h-72 object-cover rounded-xl border border-[hsl(var(--border))] shadow-sm"
            />
          ) : (
            <div className="w-full h-48 rounded-xl overflow-hidden border border-[hsl(var(--border))] shadow-sm">
              <ImagePlaceholder title={row.title} />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[hsl(var(--muted))]/50 p-4 rounded-lg border border-[hsl(var(--border))] text-center">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--muted-foreground))] mb-1">
                Mapped
              </p>
              <p className="text-2xl font-serif font-medium text-[hsl(var(--foreground))] tabular-nums">
                {row.mappedIngredientCount}
              </p>
            </div>
            <div className="bg-[hsl(var(--muted))]/50 p-4 rounded-lg border border-[hsl(var(--border))] text-center">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--muted-foreground))] mb-1">
                Unmapped
              </p>
              <p
                className={cn(
                  "text-2xl font-serif font-medium tabular-nums",
                  row.unmappedIngredientNames.length > 0
                    ? "text-rose-600"
                    : "text-[hsl(var(--foreground))]"
                )}
              >
                {row.unmappedIngredientNames.length}
              </p>
            </div>
            <div className="bg-[hsl(var(--muted))]/50 p-4 rounded-lg border border-[hsl(var(--border))] text-center">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--muted-foreground))] mb-1">
                Time
              </p>
              <p className="text-2xl font-serif font-medium text-[hsl(var(--foreground))] tabular-nums">
                {row.estimatedTimeMin ? `${row.estimatedTimeMin}m` : "—"}
              </p>
            </div>
          </div>

          {row.unmappedIngredientNames.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-5">
              <p className="text-sm font-semibold text-rose-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                {row.unmappedIngredientNames.length} unmapped ingredient
                {row.unmappedIngredientNames.length !== 1 ? "s" : ""}
              </p>
              <ul className="text-sm text-rose-800 list-disc pl-5 space-y-1.5">
                {(showAll
                  ? row.unmappedIngredientNames
                  : row.unmappedIngredientNames.slice(0, 8)
                ).map((n) => (
                  <li key={n} className="font-medium">{n}</li>
                ))}
              </ul>
              {row.unmappedIngredientNames.length > 8 && (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-4 text-xs font-bold uppercase tracking-wider text-rose-700 hover:text-rose-900 transition-colors"
                >
                  {showAll
                    ? "Show fewer"
                    : `Show all ${row.unmappedIngredientNames.length}`}
                </button>
              )}
            </div>
          )}

          {row.cuisineTags.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-[hsl(var(--muted-foreground))] mb-3">
                Cuisine Tags
              </p>
              <div className="flex flex-wrap gap-2">
                {row.cuisineTags.map((c) => (
                  <span
                    key={c}
                    className="px-3 py-1 rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] text-sm font-medium border border-[hsl(var(--border))]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {row.instructionsSummary && (
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-[hsl(var(--muted-foreground))] mb-3">
                Instructions Summary
              </p>
              <div className="bg-[hsl(var(--background))] p-5 rounded-xl border border-[hsl(var(--border))]">
                <p className="text-sm whitespace-pre-wrap leading-relaxed text-[hsl(var(--foreground))]/90 font-serif">
                  {row.instructionsSummary}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!isFinal && (
          <div className="flex-none p-8 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <div className="mb-5">
              <label className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] block mb-2">
                Decision Note (Optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why are you promoting / rejecting this?"
                rows={2}
                className="w-full px-4 py-3 text-sm rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-transparent transition-shadow resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold shadow-sm bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                <CheckCircle className="w-4 h-4" /> Promote
              </button>
              <button
                onClick={onClose}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border-2 border-rose-200 text-rose-700 hover:bg-rose-50 transition-colors"
              >
                <XCircle className="w-4 h-4" /> Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CardGrid() {
  const [status, setStatus] = useState("pending");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const FILTER_LABELS: Record<string, string> = {
    pending: "In Queue",
    imported: "Imported",
    ready: "Ready",
    needs_review: "Needs Review",
    promoted: "Promoted",
    rejected: "Rejected",
    all: "All",
  };

  const filtered = useMemo(() => {
    return MOCK_ROWS.filter((r) => {
      if (status === "pending") {
        if (!["imported", "ready", "needs_review"].includes(r.status)) return false;
      } else if (status !== "all" && r.status !== status) return false;
      if (source && r.source !== source) return false;
      if (q && !r.title.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [status, source, q]);

  const openRow = useMemo(() => MOCK_ROWS.find((r) => r.id === openId) ?? null, [openId]);

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <PageHeader
        title="Recipe Staging"
        description="Curate and triage imported recipes before they hit the live catalog."
        actions={
          <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-[hsl(var(--input))] bg-[hsl(var(--card))] shadow-sm hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] transition-all">
            <Wand2 className="w-4 h-4" /> Re-map Ingredients
          </button>
        }
      />

      <div className="max-w-[1600px] mx-auto p-8 space-y-8">
        {/* Filters & Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex flex-wrap items-center gap-2">
            {["pending", "imported", "ready", "needs_review", "promoted", "rejected", "all"].map(
              (s) => {
                const facet = FACETS.statuses.find((f) => f.status === s);
                const pendingTotal =
                  s === "pending"
                    ? FACETS.statuses
                        .filter((f) => ["imported", "ready", "needs_review"].includes(f.status))
                        .reduce((sum, f) => sum + f.count, 0)
                    : null;
                const allTotal =
                  s === "all" ? FACETS.statuses.reduce((sum, f) => sum + f.count, 0) : null;
                const count = pendingTotal ?? allTotal ?? facet?.count ?? 0;

                const isActive = status === s;

                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 border",
                      isActive
                        ? "bg-[hsl(var(--foreground))] text-[hsl(var(--background))] border-[hsl(var(--foreground))] shadow-md"
                        : "bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))] hover:border-[hsl(var(--foreground))]/30 hover:text-[hsl(var(--foreground))]"
                    )}
                  >
                    {FILTER_LABELS[s] ?? s}{" "}
                    <span className={cn("ml-1.5 opacity-60 tabular-nums", isActive ? "text-[hsl(var(--background))]" : "")}>
                      {count}
                    </span>
                  </button>
                );
              }
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-[280px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search titles…"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-transparent transition-shadow"
              />
            </div>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="px-4 py-2.5 rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-transparent cursor-pointer transition-shadow"
            >
              <option value="">All Sources</option>
              {FACETS.sources.map((s) => (
                <option key={s.source} value={s.source}>
                  {s.source} ({s.count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Card Grid */}
        {filtered.length === 0 ? (
          <div className="py-24 text-center border-2 border-dashed border-[hsl(var(--border))] rounded-2xl bg-[hsl(var(--card))]/50">
            <div className="w-16 h-16 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
            </div>
            <h3 className="text-lg font-bold text-[hsl(var(--foreground))] mb-1">No recipes found</h3>
            <p className="text-[hsl(var(--muted-foreground))]">
              Try adjusting your filters or search query.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
            {filtered.map((row) => (
              <RecipeCard key={row.id} row={row} onClick={() => setOpenId(row.id)} />
            ))}
          </div>
        )}

        {/* Pagination Footer */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between pt-6 border-t border-[hsl(var(--border))]">
            <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
              Showing <span className="text-[hsl(var(--foreground))]">{filtered.length}</span> recipes
            </p>
            <div className="flex gap-2">
              <button
                disabled
                className="p-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled
                className="p-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <StagingDetailDrawer row={openRow} onClose={() => setOpenId(null)} />
    </div>
  );
}

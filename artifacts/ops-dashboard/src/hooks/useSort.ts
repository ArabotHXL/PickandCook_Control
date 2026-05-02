import { useState, useCallback } from "react";
import type { SortState } from "@/components/SortableHeader";

/**
 * Manages sort state for a list page. `null` means use the server default.
 * `setSort` callback can be passed directly to <SortableHeader onChange=… />.
 *
 * Returns `qs` — the `&sort=…&dir=…` suffix (empty string when null) —
 * to splice into a query URL.
 */
export function useSort(): {
  sort: SortState | null;
  setSort: (next: SortState | null) => void;
  qs: string;
} {
  const [sort, setSort] = useState<SortState | null>(null);
  const update = useCallback((next: SortState | null) => setSort(next), []);
  const qs = sort ? `&sort=${encodeURIComponent(sort.col)}&dir=${sort.dir}` : "";
  return { sort, setSort: update, qs };
}

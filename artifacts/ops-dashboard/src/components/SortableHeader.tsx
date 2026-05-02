import type { ReactNode } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";
export interface SortState {
  col: string;
  dir: SortDir;
}

interface SortableHeaderProps {
  /** API field key the server understands. */
  col: string;
  /** Currently active sort, or null when default. */
  active: SortState | null;
  /** Default direction applied when this column is first clicked. */
  defaultDir?: SortDir;
  align?: "left" | "right";
  onChange: (next: SortState) => void;
  children: ReactNode;
  testIdPrefix?: string;
  className?: string;
}

export function SortableHeader({
  col,
  active,
  defaultDir = "desc",
  align = "left",
  onChange,
  children,
  testIdPrefix = "sort",
  className,
}: SortableHeaderProps) {
  const isActive = active?.col === col;
  const dir = isActive ? active!.dir : null;

  function handleClick() {
    if (!isActive) {
      onChange({ col, dir: defaultDir });
    } else {
      onChange({ col, dir: dir === "asc" ? "desc" : "asc" });
    }
  }

  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <th
      className={cn(
        "px-4 py-3 font-medium text-muted-foreground select-none",
        align === "right" ? "text-right" : "text-left",
        className
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        data-testid={`${testIdPrefix}-${col}`}
        aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
        className={cn(
          "inline-flex items-center gap-1.5 hover:text-foreground transition-colors",
          align === "right" && "flex-row-reverse",
          isActive && "text-foreground"
        )}
      >
        <span>{children}</span>
        <Icon
          className={cn(
            "w-3 h-3 shrink-0",
            isActive ? "opacity-100" : "opacity-40"
          )}
        />
      </button>
    </th>
  );
}

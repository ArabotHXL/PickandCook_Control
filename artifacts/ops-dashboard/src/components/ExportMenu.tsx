import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { downloadCsv, downloadXlsx } from "@/lib/csv";
import { useToast } from "@/hooks/use-toast";

interface ExportMenuProps {
  /** API path to call. `format=csv|xlsx` is appended automatically. */
  path: string;
  /** Filename without extension (e.g. `users-2026-05-02`). */
  filenameStem: string;
  disabled?: boolean;
  testId?: string;
}

export function ExportMenu({ path, filenameStem, disabled, testId = "button-export" }: ExportMenuProps) {
  const [busy, setBusy] = useState<"csv" | "xlsx" | null>(null);
  const { toast } = useToast();

  async function run(kind: "csv" | "xlsx") {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === "csv") await downloadCsv(path, filenameStem);
      else await downloadXlsx(path, filenameStem);
    } catch (e) {
      toast({
        title: "Export failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={disabled || busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid={testId}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          Export
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onSelect={() => void run("csv")}
          data-testid={`${testId}-csv`}
          className="gap-2"
        >
          <FileText className="w-3.5 h-3.5 text-muted-foreground" /> Download CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void run("xlsx")}
          data-testid={`${testId}-xlsx`}
          className="gap-2"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Download Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

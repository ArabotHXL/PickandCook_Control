import type { Response } from "express";

// Neutralize Excel/Sheets formula injection: prefix any cell starting with
// =, +, -, @, tab, or CR with a single quote so the spreadsheet treats it as text.
function neutralizeFormula(s: string): string {
  if (s.length === 0) return s;
  const first = s.charAt(0);
  if (first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r") {
    return `'${s}`;
  }
  return s;
}

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const iso = v.toISOString();
    return /[",\n\r]/.test(iso) ? `"${iso.replace(/"/g, '""')}"` : iso;
  }
  if (typeof v === "object") {
    const raw = JSON.stringify(v);
    const s = neutralizeFormula(raw);
    return `"${s.replace(/"/g, '""')}"`;
  }
  const s = neutralizeFormula(String(v));
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function sendCsv(
  res: Response,
  filename: string,
  rows: Array<Record<string, unknown>>,
  columns?: string[]
): void {
  const cols = columns ?? Array.from(rows.reduce((acc, r) => {
    Object.keys(r).forEach((k) => acc.add(k));
    return acc;
  }, new Set<string>()));
  const lines = [cols.join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => escapeCell(row[c])).join(","));
  }
  const csv = lines.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

export function isCsvRequested(format: unknown): boolean {
  return typeof format === "string" && format.toLowerCase() === "csv";
}

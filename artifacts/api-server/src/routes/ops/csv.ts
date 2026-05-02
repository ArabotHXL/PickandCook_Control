import type { Response } from "express";
import ExcelJS from "exceljs";

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

export function isXlsxRequested(format: unknown): boolean {
  return (
    typeof format === "string" &&
    (format.toLowerCase() === "xlsx" || format.toLowerCase() === "excel")
  );
}

// Cell value coerced to a type ExcelJS can store safely. Strings get
// formula-injection neutralized via `cell.value = { text }` semantics —
// ExcelJS will never evaluate a string set this way. Dates stored natively.
function xlsxCellValue(v: unknown): string | number | boolean | Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object") return neutralizeFormula(JSON.stringify(v));
  return neutralizeFormula(String(v));
}

export async function sendXlsx(
  res: Response,
  filename: string,
  rows: Array<Record<string, unknown>>,
  columns?: string[]
): Promise<void> {
  const cols = columns ?? Array.from(rows.reduce((acc, r) => {
    Object.keys(r).forEach((k) => acc.add(k));
    return acc;
  }, new Set<string>()));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Pick & Cook Ops";
  wb.created = new Date();
  const sheet = wb.addWorksheet("Export");

  sheet.columns = cols.map((c) => ({ header: c, key: c, width: Math.max(12, Math.min(40, c.length + 4)) }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle" };

  for (const row of rows) {
    const values: Record<string, unknown> = {};
    for (const c of cols) values[c] = xlsxCellValue(row[c]);
    sheet.addRow(values);
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

/**
 * Convenience: dispatch on `req.query.format` and write the requested format,
 * returning true if a download was sent. Caller should `return` immediately
 * after a true result.
 */
export async function maybeSendExport(
  res: Response,
  format: unknown,
  filenameStem: string,
  rows: Array<Record<string, unknown>>,
  columns: string[]
): Promise<boolean> {
  if (isCsvRequested(format)) {
    sendCsv(res, `${filenameStem}.csv`, rows, columns);
    return true;
  }
  if (isXlsxRequested(format)) {
    await sendXlsx(res, `${filenameStem}.xlsx`, rows, columns);
    return true;
  }
  return false;
}

/**
 * Resolve a user-supplied sort column against an allowlist of API field
 * names → SQL expressions. Returns a safe `ORDER BY` clause (with leading
 * whitespace) plus a deterministic tiebreaker. Falls back to `defaultSql`
 * if the requested key isn't allowed.
 *
 * IMPORTANT: never interpolate raw user input into SQL. The allowlist is
 * the only path from API col name → SQL expression.
 */
export function buildOrderBy(
  rawSort: unknown,
  rawDir: unknown,
  allowed: Record<string, string>,
  defaultSql: string,
  tiebreakerSql?: string
): string {
  const dir = String(rawDir ?? "").toLowerCase() === "asc" ? "ASC" : "DESC";
  const key = typeof rawSort === "string" ? rawSort : "";
  const sql = allowed[key] ?? defaultSql;
  const tb = tiebreakerSql ? `, ${tiebreakerSql}` : "";
  return ` ORDER BY ${sql} ${dir} NULLS LAST${tb}`;
}

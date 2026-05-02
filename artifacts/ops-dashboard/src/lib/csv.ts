import { apiFetch } from "./query-client";

async function downloadFromQuery(path: string, format: "csv" | "xlsx", filename: string): Promise<void> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await apiFetch(`${path}${sep}format=${format}`);
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCsv(path: string, filename: string): Promise<void> {
  return downloadFromQuery(path, "csv", filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export function downloadXlsx(path: string, filename: string): Promise<void> {
  return downloadFromQuery(path, "xlsx", filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

import { apiFetch } from "./query-client";

export async function downloadCsv(path: string, filename: string): Promise<void> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await apiFetch(`${path}${sep}format=csv`);
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

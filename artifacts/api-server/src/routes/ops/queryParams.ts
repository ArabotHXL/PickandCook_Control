import { HttpError } from "../../lib/httpError.js";

function parseIntStrict(raw: unknown, name: string): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (Array.isArray(raw)) {
    throw new HttpError(400, `Query param '${name}' must be a single value`);
  }
  const s = String(raw).trim();
  if (!/^-?\d+$/.test(s)) {
    throw new HttpError(400, `Query param '${name}' must be an integer (got '${s}')`);
  }
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isSafeInteger(n)) {
    throw new HttpError(400, `Query param '${name}' is out of range`);
  }
  return n;
}

export function parseLimit(
  raw: unknown,
  opts: { def: number; max: number; min?: number } = { def: 50, max: 100 }
): number {
  const min = opts.min ?? 1;
  const n = parseIntStrict(raw, "limit");
  if (n === undefined) return opts.def;
  if (n < min || n > opts.max) {
    throw new HttpError(400, `Query param 'limit' must be between ${min} and ${opts.max}`);
  }
  return n;
}

export function parsePage(raw: unknown): number {
  const n = parseIntStrict(raw, "page");
  if (n === undefined) return 1;
  if (n < 1) {
    throw new HttpError(400, `Query param 'page' must be >= 1`);
  }
  return n;
}

export function parseDays(
  raw: unknown,
  opts: { def: number; max: number; min?: number } = { def: 30, max: 90 }
): number {
  const min = opts.min ?? 1;
  const n = parseIntStrict(raw, "days");
  if (n === undefined) return opts.def;
  if (n < min || n > opts.max) {
    throw new HttpError(400, `Query param 'days' must be between ${min} and ${opts.max}`);
  }
  return n;
}

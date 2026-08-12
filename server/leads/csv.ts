/**
 * CSV parsing and field coercion for bulk lead import.
 *
 * Separated from import.ts (which is "use server") so these pure functions can be
 * unit tested. Every bug fixed here was a row silently rejected in production.
 */

export interface ParsedRow {
  /** 1-based line number in the ORIGINAL file, so error messages point at the real line. */
  line: number;
  values: Record<string, string>;
}

/**
 * Minimal CSV parser: handles quoted fields, escaped quotes and embedded newlines.
 *
 * Tracks the true source line for every row. The previous version skipped blank
 * rows and then reported errors as `index + 2`, so a single blank line shifted every
 * subsequent error number and the list became useless for fixing the file.
 */
export function parseCsv(text: string): ParsedRow[] {
  // Strip a UTF-8 BOM: Excel adds one, and it corrupts the first header name.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const raw: { line: number; cells: string[] }[] = [];
  let field = "";
  let cells: string[] = [];
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  const endRow = () => {
    cells.push(field);
    field = "";
    if (cells.some((f) => f.trim() !== "")) raw.push({ line: rowStartLine, cells });
    cells = [];
    rowStartLine = line;
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (c === "\n") line++;
        field += c;
      }
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      cells.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      line++;
      endRow();
    } else field += c;
  }
  if (field !== "" || cells.length) endRow();

  if (raw.length === 0) return [];

  const headers = raw[0]!.cells.map((h) => normaliseHeader(h));
  return raw.slice(1).map(({ line: l, cells: r }) => {
    const values: Record<string, string> = {};
    headers.forEach((h, i) => {
      values[h] = (r[i] ?? "").trim();
    });
    return { line: l, values };
  });
}

/**
 * Collapse a header to a lookup key: lowercase, non-alphanumerics removed.
 * So "Budget Min", "budget_min", "BudgetMin" and "budget-min" all match.
 */
export function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Read the first present value among several header spellings. */
export function pick(values: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = values[normaliseHeader(k)];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

/**
 * Ringgit text → integer cents.
 *
 * The old version was `v ? Math.round(Number(v) * 100) : null`, which returned NaN
 * for "1,200,000", "RM 850000" and "850k" — and because NaN fails the Zod schema,
 * the ENTIRE row was rejected: name, phone and all. Thousands separators are the
 * default in every Excel export, so this was rejecting ordinary data.
 *
 * Returns null for anything genuinely unparseable, so a bad budget costs you the
 * budget rather than the lead.
 */
export function ringgitToCents(input: string | undefined | null): number | null {
  if (input === undefined || input === null) return null;
  let s = String(input).trim();
  if (s === "") return null;

  // Drop currency words/symbols and spaces: "RM 850,000", "MYR850000", "rm850k".
  s = s.replace(/^(rm|myr)\s*/i, "").replace(/\s/g, "");

  // Shorthand: 850k / 1.2m
  let multiplier = 1;
  const suffix = s.slice(-1).toLowerCase();
  if (suffix === "k") {
    multiplier = 1_000;
    s = s.slice(0, -1);
  } else if (suffix === "m") {
    multiplier = 1_000_000;
    s = s.slice(0, -1);
  }

  // Remove thousands separators, keep one decimal point.
  s = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;

  const ringgit = Number(s) * multiplier;
  if (!Number.isFinite(ringgit) || ringgit < 0) return null;
  return Math.round(ringgit * 100);
}

/**
 * Normalise a phone number to E.164 for Malaysia.
 *
 * Agents type "012-345 6789", "+60 12 3456789" and "0123456789". Only the last of
 * those used to pass, so genuine rows were rejected on formatting alone.
 * Returns null when it cannot be made valid, letting Zod produce the error.
 */
export function toE164My(input: string | undefined | null): string | null {
  if (!input) return null;
  let s = String(input).trim().replace(/[\s()\-.]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (s.startsWith("+")) return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
  // Local Malaysian format: leading 0 replaced with +60.
  if (s.startsWith("0")) s = `+60${s.slice(1)}`;
  else if (/^60\d+$/.test(s)) s = `+${s}`;
  else if (/^\d{9,10}$/.test(s)) s = `+60${s}`;
  else return null;
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
}

const INTEREST_VALUES = ["buy", "rent", "sell"] as const;

/**
 * Normalise the interest column. "Buy", " RENT ", "Sell" are what humans type into
 * a spreadsheet; previously any of them failed the enum check and killed the row.
 */
export function toInterest(input: string | undefined | null): "buy" | "rent" | "sell" | null {
  if (!input) return null;
  const v = String(input).trim().toLowerCase();
  const found = INTEREST_VALUES.find((i) => i === v);
  if (found) return found;
  // Common variants seen in ad-platform exports.
  if (["purchase", "buying", "beli"].includes(v)) return "buy";
  if (["rental", "renting", "lease", "sewa"].includes(v)) return "rent";
  if (["selling", "list", "jual"].includes(v)) return "sell";
  return null;
}

/** Truthy consent only. Never defaults to true — see the PDPA note in import.ts. */
export function toConsent(input: string | undefined | null): boolean {
  if (input === undefined || input === null) return false;
  return ["true", "yes", "y", "1", "on", "agree", "agreed", "setuju"].includes(
    String(input).trim().toLowerCase(),
  );
}

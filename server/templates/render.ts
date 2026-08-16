/**
 * Placeholder substitution for message templates.
 *
 * Templates are written by whoever runs the agency, in `{{name}}` form, and filled
 * in with values from the record the agent is looking at:
 *
 *   "Hi {{name}}, confirming our viewing at {{property}}."
 *   → "Hi Ali, confirming our viewing at Vista Kiara 3-bed."
 *
 * Pure and dependency-free so the rules can be tested directly.
 */

/** Values available to a template. Anything absent is handled, never printed raw. */
export interface TemplateValues {
  /** The client's name — first name only, which is how agents actually write. */
  name?: string | null;
  /** The full name, for formal messages. */
  fullName?: string | null;
  /** The agent sending the message. */
  agent?: string | null;
  agency?: string | null;
  /** Set when the message is about a specific listing. */
  property?: string | null;
  price?: string | null;
  area?: string | null;
}

/** Placeholders an author may use. Shown in the editor so nobody has to guess. */
export const PLACEHOLDERS = [
  "name",
  "fullName",
  "agent",
  "agency",
  "property",
  "price",
  "area",
] as const;

export type Placeholder = (typeof PLACEHOLDERS)[number];

/**
 * Fill `{{placeholders}}` in `body` from `values`.
 *
 * Tolerant of how people actually type: `{{name}}`, `{{ name }}` and `{{Name}}` all
 * work, because a template written in a hurry should not silently fail.
 *
 * An unknown or empty placeholder collapses to nothing, and the surrounding
 * whitespace is tidied afterwards. The alternative — leaving `{{property}}` visible —
 * means an agent eventually sends a client a message with braces in it, which looks
 * worse than a slightly shorter sentence.
 */
export function renderTemplate(body: string, values: TemplateValues): string {
  const lookup = new Map<string, string>();
  for (const key of PLACEHOLDERS) {
    const v = values[key];
    if (v != null && String(v).trim() !== "") lookup.set(key.toLowerCase(), String(v).trim());
  }

  const filled = body.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_m, rawKey: string) => {
    return lookup.get(rawKey.toLowerCase()) ?? "";
  });

  return tidy(filled);
}

/**
 * Clean up after a removed placeholder.
 *
 * "Hi , welcome" and "at  on Saturday" are the giveaways that a template was filled
 * from an incomplete record. Collapse runs of spaces, close up spaces before
 * punctuation, and drop a dangling comma left where a value used to be.
 */
function tidy(s: string): string {
  return s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/(^|\n)[ \t]+/g, "$1")
    .replace(/[ \t]+($|\n)/g, "$1")
    .trim();
}

/** Placeholders used by a template, in order of first appearance, deduplicated. */
export function placeholdersUsed(body: string): string[] {
  const found = body.match(/\{\{\s*([a-zA-Z]+)\s*\}\}/g) ?? [];
  const keys = found.map((m) => m.replace(/[{}\s]/g, "").toLowerCase());
  return [...new Set(keys)];
}

/**
 * Which placeholders in this template have no value for this record?
 *
 * Used to warn an author while editing, and to flag at send time that a template
 * expects something the record does not have — better the agent knows before the
 * message goes than after.
 */
export function missingValues(body: string, values: TemplateValues): string[] {
  const available = new Set(
    PLACEHOLDERS.filter((k) => {
      const v = values[k];
      return v != null && String(v).trim() !== "";
    }).map((k) => k.toLowerCase()),
  );
  return placeholdersUsed(body).filter((k) => !available.has(k));
}

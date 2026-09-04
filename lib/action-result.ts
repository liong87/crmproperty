import type { ActionResult } from "@/types";
import type { z } from "zod";

export const ok = <T>(data: T): ActionResult<T> => ({ success: true, data });

/**
 * A failure. Pass `fieldErrors` when the caller can attribute the problem to specific
 * inputs — the form then marks those fields `aria-invalid` and prints the message
 * beside them, instead of showing one sentence at the bottom of a long form.
 */
export const fail = (error: string, fieldErrors?: Record<string, string>): ActionResult<never> =>
  fieldErrors ? { success: false, error, fieldErrors } : { success: false, error };

/**
 * Turn a ZodError into a failure that keeps the path→message mapping.
 *
 * `err.issues.map(i => i.message).join("; ")` was the previous shape everywhere, and it
 * threw away `issue.path` — the one piece of information that lets the UI point at the
 * offending field.
 */
export function failFromZod(err: z.ZodError, prefix?: string): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const summary = err.issues.map((i) => i.message).join("; ");
  return fail(prefix ? `${prefix} ${summary}` : summary, Object.keys(fieldErrors).length ? fieldErrors : undefined);
}

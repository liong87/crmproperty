/** Shared app types. */

/** Standard server-action return shape (see Coding Conventions). */
export type ActionResult<T = void> =
  | { success: true; data: T }
  /**
   * `error` is the sentence a human reads. `fieldErrors` is the same failure keyed by
   * the form field it belongs to, so a 20-field form can put the message next to the
   * input that caused it instead of stranding it in the footer. Optional on purpose:
   * every existing caller keeps working, and only forms that render field errors need
   * to read it.
   */
  | { success: false; error: string; fieldErrors?: Record<string, string> };

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

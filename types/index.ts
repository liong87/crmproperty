/** Shared app types. */

/** Standard server-action return shape (see Coding Conventions). */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

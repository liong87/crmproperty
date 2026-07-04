import type { ActionResult } from "@/types";

export const ok = <T>(data: T): ActionResult<T> => ({ success: true, data });
export const fail = (error: string): ActionResult<never> => ({ success: false, error });

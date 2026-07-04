"use server";
/** PDPA admin actions: hard-delete a contact (right to erasure). Export is a GET route. */
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireDbUser, assertRole, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { purgeContact } from "./service";

export async function hardDeleteContact(contactId: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin"); // erasure is admin-only
    z.string().uuid().parse(contactId);

    await purgeContact(contactId);
    monitoring.captureMessage("PDPA erasure executed", { by: me.id }); // no PII
    revalidatePath("/contacts");
  } catch (err) {
    if (err instanceof AuthorizationError) return fail("Only admins can delete personal data.");
    if (err instanceof z.ZodError) return fail("Invalid contact id.");
    if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
    monitoring.captureException(err, { where: "hardDeleteContact" });
    return fail("Deletion failed.");
  }
  // Redirect after successful purge (outside try so redirect's control-flow throw isn't caught).
  redirect("/contacts");
  return ok(undefined);
}

"use server";
/** Contact mutations. Authn + RBAC + Zod + ActionResult. */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { contacts, type Contact } from "@/lib/db/schema";
import { requireDbUser, assertCanEdit, AuthorizationError } from "@/lib/auth";
import { INTEREST } from "@/lib/constants";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { getContactById } from "./queries";
import { assertCanEditOwned } from "@/server/auth/ownership";
import { toE164My } from "@/server/leads/csv";

/**
 * Same rule as leads: accept `012-345 6789` and store E.164. See the note on
 * `phoneField` in server/leads/actions.ts for why the bare regex was wrong.
 */
const phoneField = z
  .string()
  .transform((v) => toE164My(v) ?? v)
  .refine((v) => /^\+[1-9]\d{6,14}$/.test(v), {
    message: "That does not look like a phone number. Try 012-345 6789 or +60123456789.",
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  phone: phoneField.optional(),
  email: z.string().email().max(320).optional().or(z.literal("")).nullable(),
  interest: z.enum(INTEREST).optional().nullable(),
  budgetMin: z.coerce.number().int().nonnegative().optional().nullable(),
  budgetMax: z.coerce.number().int().nonnegative().optional().nullable(),
  preferredAreas: z.string().max(1000).optional().nullable(),
  idType: z.enum(["nric", "passport", "company"]).optional().nullable(),
  idNumber: z.string().max(100).optional().nullable(),
  nationality: z.string().max(100).optional().nullable(),
  occupation: z.string().max(255).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export async function updateContact(input: unknown): Promise<ActionResult<Contact>> {
  try {
    const me = await requireDbUser();
    const d = updateSchema.parse(input);
    const contact = await getContactById(d.id);
    if (!contact) return fail("Contact not found.");
    await assertCanEditOwned(me, contact.assignedTo);

    const [row] = await db
      .update(contacts)
      .set({
        name: d.name ?? contact.name,
        phone: d.phone ?? contact.phone,
        email: d.email !== undefined ? d.email || null : contact.email,
        interest: d.interest !== undefined ? d.interest : contact.interest,
        budgetMin: d.budgetMin !== undefined ? d.budgetMin : contact.budgetMin,
        budgetMax: d.budgetMax !== undefined ? d.budgetMax : contact.budgetMax,
        preferredAreas: d.preferredAreas !== undefined ? d.preferredAreas : contact.preferredAreas,
        idType: d.idType !== undefined ? d.idType : contact.idType,
        idNumber: d.idNumber !== undefined ? d.idNumber : contact.idNumber,
        nationality: d.nationality !== undefined ? d.nationality : contact.nationality,
        occupation: d.occupation !== undefined ? d.occupation : contact.occupation,
        notes: d.notes !== undefined ? d.notes : contact.notes,
      })
      .where(eq(contacts.id, d.id))
      .returning();

    revalidatePath("/contacts");
    revalidatePath(`/contacts/${d.id}`);
    return ok(row!);
  } catch (err) {
    if (err instanceof AuthorizationError) return fail(err.message);
    if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
    if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
    monitoring.captureException(err, { where: "updateContact" });
    return fail("Something went wrong.");
  }
}

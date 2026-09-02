"use server";
/**
 * Duplicate client detection across agents.
 *
 * Two agents unknowingly working the same buyer is the most common source of
 * internal conflict in an agency, and it usually surfaces at the worst possible
 * moment — when a commission is due. The data to prevent it is already there;
 * nothing was looking.
 *
 * Matched on PHONE first, EMAIL second. Phone is the closest thing to a unique
 * person identifier here: everyone has one, it rarely changes, and it is stored
 * normalised as E.164 so comparison is exact.
 *
 * Name is deliberately NOT a key. "Tan Wei Ming" matches several unrelated people in
 * any real book, and a warning that cries wolf is worse than none — agents learn to
 * dismiss it without reading, and then miss the real one.
 */
import { and, eq, isNull, ne, notInArray, or } from "drizzle-orm";
import { DEAD_STATUSES } from "@/lib/constants";
import { db } from "@/lib/db/client";
import { leads, contacts, users } from "@/lib/db/schema";
import { requireDbUser } from "@/lib/auth";

export interface DuplicateHit {
  kind: "lead" | "contact";
  /** Which field matched — shown so the agent can judge whether it is really the same person. */
  matchedOn: "phone" | "email";
  /** The owning agent's name. Deliberately the ONLY detail exposed about their record. */
  ownerName: string;
  /** True when the current user owns it — then it is not a conflict, just a duplicate. */
  isMine: boolean;
}

/**
 * Does another record already exist for this phone or email?
 *
 * Returns at most one hit per kind, and never exposes the other record's id, budget,
 * notes or history — only which agent holds it. An agent can then go and talk to that
 * colleague, which is the point. Anything more would turn this into a way to browse a
 * colleague's client book, which the ownership rules exist to prevent.
 *
 * NOT ownership-filtered, necessarily: the whole purpose is to see across agents.
 * That is why the payload is limited to a name.
 */
export async function findDuplicateClients(input: {
  phone?: string | null;
  email?: string | null;
  /** Exclude the record being edited, so a save does not flag itself. */
  excludeLeadId?: string | null;
  excludeContactId?: string | null;
}): Promise<DuplicateHit[]> {
  const me = await requireDbUser();

  const phone = input.phone?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;
  if (!phone && !email) return [];

  const hits: DuplicateHit[] = [];

  const leadMatch = or(
    ...(phone ? [eq(leads.phone, phone)] : []),
    ...(email ? [eq(leads.email, email)] : []),
  );
  const [leadRow] = await db
    .select({ phone: leads.phone, owner: users.name, ownerId: leads.assignedTo })
    .from(leads)
    .leftJoin(users, eq(leads.assignedTo, users.id))
    .where(
      and(
        isNull(leads.deletedAt),
        // A lead that became a contact is represented by the contact; flagging both
        // would report the same person twice.
        isNull(leads.convertedToContactId),
        // A rejected enquiry is not a live claim on the client.
        notInArray(leads.status, DEAD_STATUSES),
        leadMatch,
        input.excludeLeadId ? ne(leads.id, input.excludeLeadId) : undefined,
      ),
    )
    .limit(1);

  if (leadRow) {
    hits.push({
      kind: "lead",
      matchedOn: phone && leadRow.phone === phone ? "phone" : "email",
      ownerName: leadRow.owner ?? "an unassigned record",
      isMine: leadRow.ownerId === me.id,
    });
  }

  const contactMatch = or(
    ...(phone ? [eq(contacts.phone, phone)] : []),
    ...(email ? [eq(contacts.email, email)] : []),
  );
  const [contactRow] = await db
    .select({ phone: contacts.phone, owner: users.name, ownerId: contacts.assignedTo })
    .from(contacts)
    .leftJoin(users, eq(contacts.assignedTo, users.id))
    .where(
      and(
        isNull(contacts.deletedAt),
        contactMatch,
        input.excludeContactId ? ne(contacts.id, input.excludeContactId) : undefined,
      ),
    )
    .limit(1);

  if (contactRow) {
    hits.push({
      kind: "contact",
      matchedOn: phone && contactRow.phone === phone ? "phone" : "email",
      ownerName: contactRow.owner ?? "an unassigned record",
      isMine: contactRow.ownerId === me.id,
    });
  }

  return hits;
}

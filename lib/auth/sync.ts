/**
 * Local user sync — keeps a row in our `users` table for every authenticated
 * identity (Migration Readiness: user data must live in our DB, not only in Clerk).
 *
 * Provider-agnostic: depends only on the generic AuthUser from the adapter.
 * Call syncCurrentUser() from the dashboard layout so a row always exists.
 */
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, type User } from "@/lib/db/schema";
import { cache } from "react";
import { getCurrentAuthId, getCurrentUser } from "./active-provider";
import { monitoring } from "@/lib/monitoring";

/**
 * Upsert the current identity into `users`.
 *  1. Match on external_auth_id → update name/email.
 *  2. Else match on a VERIFIED email (links pre-seeded staff to their first login) →
 *     attach external_auth_id, keep role.
 *  3. Else insert a new row as role "agent", inactive.
 *
 * Step 2 adopts the existing row's ROLE, which makes it a privilege boundary rather
 * than a convenience: whoever signs in claiming an admin's address becomes that admin.
 * It therefore requires the auth provider to have verified the address. An unverified
 * one is refused outright rather than falling through to step 3, because `users.email`
 * is unique and inserting would fail anyway — and failing closed is the right answer
 * for an identity claiming somebody else's address.
 */
export async function syncCurrentUser(): Promise<User | null> {
  const authUser = await getCurrentUser();
  if (!authUser) return null;

  const [byAuthId] = await db
    .select()
    .from(users)
    .where(eq(users.externalAuthId, authUser.externalAuthId));

  if (byAuthId) {
    if (byAuthId.name !== authUser.name || byAuthId.email !== authUser.email) {
      const [updated] = await db
        .update(users)
        .set({ name: authUser.name || byAuthId.name, email: authUser.email || byAuthId.email })
        .where(eq(users.id, byAuthId.id))
        .returning();
      return updated ?? byAuthId;
    }
    return byAuthId;
  }

  if (authUser.email) {
    const [byEmail] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, authUser.email), isNull(users.deletedAt)));

    if (byEmail && !authUser.emailVerified) {
      // Someone is signing in with an unverified address that already belongs to a
      // member of staff. Adopting the row would hand over its role.
      monitoring.captureMessage("Refused to link an unverified email to an existing user", {
        externalAuthId: authUser.externalAuthId,
        userId: byEmail.id,
      });
      return null;
    }

    if (byEmail) {
      const [linked] = await db
        .update(users)
        .set({ externalAuthId: authUser.externalAuthId, name: authUser.name || byEmail.name })
        .where(eq(users.id, byEmail.id))
        .returning();
      return linked ?? byEmail;
    }
  }

  // Internal tool: brand-new sign-ups arrive INACTIVE and must be approved by an
  // admin (Users page) before they can access any data. Pre-seeded staff linked by
  // email above keep their existing active status.
  const [created] = await db
    .insert(users)
    .values({
      externalAuthId: authUser.externalAuthId,
      name: authUser.name || "New User",
      email: authUser.email,
      role: "agent",
      active: false,
    })
    .returning();
  return created ?? null;
}

/**
 * The current identity's local DB row (with role), or null if unauthenticated.
 *
 * Soft-deleted users are treated as unauthenticated. deleteUser() intentionally does
 * NOT revoke the identity at the auth provider, so without this filter an offboarded
 * member of staff kept a working session - and any route using this helper instead of
 * requireDbUser (the PDPA export endpoint, for one) still served them client data.
 */
export const getCurrentDbUser = cache(async (): Promise<User | null> => {
  /*
   * `getCurrentAuthId`, not `getCurrentUser`.
   *
   * All this needs is the external id to look up our own row. The full profile — name,
   * email, verification status — costs an HTTPS round trip to the auth provider's API
   * and is used only by `syncCurrentUser`, which runs once per request in the layout.
   * Asking for it here meant every page paid for a network call to fetch a name it then
   * ignored, two or three times over.
   *
   * Memoised with `cache` for the same reason: a page, its layout and any server module
   * calling `requireDbUser` all land here, and they should share one SELECT.
   */
  const externalAuthId = await getCurrentAuthId();
  if (!externalAuthId) return null;
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.externalAuthId, externalAuthId), isNull(users.deletedAt)));
  return row ?? null;
});

/** Like getCurrentDbUser but throws if missing — use in server actions. */
export async function requireDbUser(): Promise<User> {
  const user = await getCurrentDbUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!user.active) throw new Error("INACTIVE_USER");
  return user;
}

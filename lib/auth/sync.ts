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
import { getCurrentUser } from "./active-provider";

/**
 * Upsert the current identity into `users`.
 *  1. Match on external_auth_id → update name/email.
 *  2. Else match on email (links pre-seeded staff to their first login) → attach external_auth_id, keep role.
 *  3. Else insert a new row as role "agent".
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

/** The current identity's local DB row (with role), or null if unauthenticated. */
export async function getCurrentDbUser(): Promise<User | null> {
  const authUser = await getCurrentUser();
  if (!authUser) return null;
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.externalAuthId, authUser.externalAuthId));
  return row ?? null;
}

/** Like getCurrentDbUser but throws if missing — use in server actions. */
export async function requireDbUser(): Promise<User> {
  const user = await getCurrentDbUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!user.active) throw new Error("INACTIVE_USER");
  return user;
}

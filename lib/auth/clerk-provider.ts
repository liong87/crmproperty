import { auth, currentUser } from "@clerk/nextjs/server";
import type { AuthProvider, AuthUser } from "./interface";

/** Clerk implementation of AuthProvider. Only this file imports Clerk. */
export const clerkProvider: AuthProvider = {
  async getCurrentAuthId(): Promise<string | null> {
    // `auth()` reads the verified session token. No call to api.clerk.com.
    const { userId } = await auth();
    return userId ?? null;
  },
  async getCurrentUser(): Promise<AuthUser | null> {
    const { userId } = await auth();
    if (!userId) return null;
    const u = await currentUser();
    if (!u) return null;
    const primary = u.primaryEmailAddress;
    return {
      externalAuthId: u.id,
      email: primary?.emailAddress ?? "",
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || (u.username ?? ""),
      // Anything other than an explicit "verified" is treated as unverified. A missing
      // or unrecognised status must fail closed — this gates role adoption.
      emailVerified: primary?.verification?.status === "verified",
    };
  },
  async requireUser(): Promise<AuthUser> {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("UNAUTHENTICATED");
    return user;
  },
};

import { auth, currentUser } from "@clerk/nextjs/server";
import type { AuthProvider, AuthUser } from "./interface";

/** Clerk implementation of AuthProvider. Only this file imports Clerk. */
export const clerkProvider: AuthProvider = {
  async getCurrentUser(): Promise<AuthUser | null> {
    const { userId } = await auth();
    if (!userId) return null;
    const u = await currentUser();
    if (!u) return null;
    return {
      externalAuthId: u.id,
      email: u.primaryEmailAddress?.emailAddress ?? "",
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || (u.username ?? ""),
    };
  },
  async requireUser(): Promise<AuthUser> {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("UNAUTHENTICATED");
    return user;
  },
};

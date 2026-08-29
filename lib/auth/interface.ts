/** AuthProvider contract. App code depends on this, never on Clerk directly. */
export type Role = "admin" | "manager" | "agent";

export interface AuthUser {
  externalAuthId: string;
  email: string;
  name: string;
  /**
   * Has the provider VERIFIED this address belongs to the person signing in?
   *
   * Load-bearing, not informational. `syncCurrentUser` links a new identity to an
   * existing staff row by email and adopts that row's role, so an unverified address
   * would let anyone who claims an admin's email inherit the admin account.
   */
  emailVerified: boolean;
}

export interface AuthProvider {
  /** The currently authenticated user (from the request context), or null. */
  getCurrentUser(): Promise<AuthUser | null>;
  /** Require an authenticated user; throws if none. */
  requireUser(): Promise<AuthUser>;
}

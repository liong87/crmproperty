/** AuthProvider contract. App code depends on this, never on Clerk directly. */
export type Role = "admin" | "team_lead" | "agent";

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
  /**
   * The signed-in identity's id, and NOTHING else.
   *
   * Separate from `getCurrentUser` because it is the cheap one: with Clerk it reads the
   * session cookie and makes no network call, whereas the full profile is an HTTPS
   * round trip to the provider's API. Almost every request only needs the id — enough
   * to find our own `users` row — so paying for the profile on each was the app's
   * largest avoidable latency.
   */
  getCurrentAuthId(): Promise<string | null>;
  /** The currently authenticated user's full profile (from the request context), or null. */
  getCurrentUser(): Promise<AuthUser | null>;
  /** Require an authenticated user; throws if none. */
  requireUser(): Promise<AuthUser>;
}

/** AuthProvider contract. App code depends on this, never on Clerk directly. */
export type Role = "admin" | "manager" | "agent";

export interface AuthUser {
  externalAuthId: string;
  email: string;
  name: string;
}

export interface AuthProvider {
  /** The currently authenticated user (from the request context), or null. */
  getCurrentUser(): Promise<AuthUser | null>;
  /** Require an authenticated user; throws if none. */
  requireUser(): Promise<AuthUser>;
}

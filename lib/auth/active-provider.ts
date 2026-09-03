import { cache } from "react";
import { clerkProvider } from "./clerk-provider";
import type { AuthProvider } from "./interface";

// The active auth provider. Swap here to migrate (e.g. Better Auth / Auth.js).
export const authProvider: AuthProvider = clerkProvider;

/*
 * MEMOISED PER REQUEST.
 *
 * A single page render asks who is signed in two or three times: the dashboard layout
 * syncs the user, the page itself loads them, and helpers like `requireDbUser` inside
 * server modules ask again. Each of those was a fresh HTTPS round trip to Clerk's API
 * and a repeated SELECT on `users`, and Cloudflare bills the Worker for the time spent
 * assembling every one of them.
 *
 * React's `cache` scopes the result to one request — never across requests, never
 * across users — so the second and third callers get the first call's answer. Nothing
 * else in this codebase used it; this is the pattern to copy for other per-request
 * lookups.
 */
export const getCurrentAuthId = cache(() => authProvider.getCurrentAuthId());
export const getCurrentUser = cache(() => authProvider.getCurrentUser());
export const requireUser = () => authProvider.requireUser();

import { clerkProvider } from "./clerk-provider";
import type { AuthProvider } from "./interface";

// The active auth provider. Swap here to migrate (e.g. Better Auth / Auth.js).
export const authProvider: AuthProvider = clerkProvider;

export const getCurrentUser = () => authProvider.getCurrentUser();
export const requireUser = () => authProvider.requireUser();

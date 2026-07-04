/**
 * Clerk UI components re-exported through the auth adapter so app code never
 * imports @clerk/nextjs directly. Swap these on migration.
 */
export { ClerkProvider as AuthUIProvider, SignIn, SignUp, UserButton, SignOutButton } from "@clerk/nextjs";

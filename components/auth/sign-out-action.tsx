"use client";

/**
 * Sign-out control for use from SERVER components.
 *
 * Clerk's <SignOutButton> attaches its click handler to whatever child it is
 * given, via cloneElement. A child rendered by a server component has already
 * crossed the server/client boundary, so the handler cannot be attached and the
 * page throws on hydration — which is what broke /pending: an agent who signed up
 * and was waiting for approval saw "Application error" instead of the message
 * explaining the wait.
 *
 * Marking this file "use client" makes the child a real client element, so Clerk
 * can wire the handler up. buttonVariants is a pure class-name helper, so the
 * button keeps the app's styling without pulling in the server-side Button.
 */
import { SignOutButton } from "@/lib/auth/provider-components";
import { buttonVariants } from "@/components/ui/button";

export function SignOutAction({ label = "Sign out" }: { label?: string }) {
  return (
    <SignOutButton>
      <button type="button" className={buttonVariants({ variant: "outline" })}>
        {label}
      </button>
    </SignOutButton>
  );
}

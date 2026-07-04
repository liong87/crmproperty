import Link from "next/link";
import { getCurrentDbUser } from "@/lib/auth";
import { SignOutButton } from "@/lib/auth/provider-components";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";

/**
 * Shown to authenticated users whose account is not yet active (awaiting admin
 * approval). No app data is reachable from here.
 */
export default async function PendingPage() {
  const user = await getCurrentDbUser();
  // Already active? Send them in.
  if (user?.active) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Link href="/dashboard"><Button>Go to dashboard</Button></Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="inline-block rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-accent-foreground">
        {APP_NAME}
      </span>
      <h1 className="font-display text-2xl font-semibold">Account pending approval</h1>
      <p className="text-sm text-muted-foreground">
        Your account has been created but needs an administrator to activate it before you can access
        the CRM. Please contact your manager — you&apos;ll be in as soon as they approve you.
      </p>
      <SignOutButton>
        <Button variant="outline">Sign out</Button>
      </SignOutButton>
    </main>
  );
}

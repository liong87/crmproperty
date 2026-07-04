import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-6 text-center">
      {/* ambient teal wash */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--secondary))_0%,transparent_70%)]" />
      <div className="mx-auto max-w-lg space-y-6">
        <span className="inline-block rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-accent-foreground">
          Property CRM · Malaysia
        </span>
        <h1 className="font-display text-4xl font-semibold leading-tight text-primary sm:text-5xl">
          {APP_NAME}
        </h1>
        <p className="text-muted-foreground">
          Internal tool for the team. Capture leads, qualify contacts, track listings, and move deals
          through your pipeline — from your desk or your phone in the field.
        </p>
        <div className="flex justify-center">
          <Link href="/dashboard"><Button size="lg">Sign in</Button></Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Access is by invitation only. Ask your administrator to add you.
        </p>
      </div>
    </main>
  );
}

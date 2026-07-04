import { redirect } from "next/navigation";
import Link from "next/link";
import { syncCurrentUser, isManagerOrAbove } from "@/lib/auth";
import { UserButton } from "@/lib/auth/provider-components";
import { AppNav, type NavLink } from "@/components/nav/app-nav";
import { APP_NAME } from "@/lib/constants";

/**
 * Authenticated shell. Middleware blocks unauthenticated access; here we ensure a
 * local users row exists (sync) and load role for nav. Desktop = left sidebar,
 * mobile = compact top bar + scrollable icon nav (field-first).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await syncCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.active) redirect("/pending");

  const links: NavLink[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/leads", label: "Leads" },
    { href: "/contacts", label: "Contacts" },
    { href: "/properties", label: "Properties" },
    { href: "/pipeline", label: "Pipeline" },
    { href: "/reminders", label: "Reminders" },
    { href: "/reports", label: "Reports" },
    ...(isManagerOrAbove(user) ? [{ href: "/users", label: "Users" }] : []),
  ];

  return (
    <div className="min-h-dvh sm:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card p-4 sm:flex">
        <Link href="/dashboard" className="mb-6 block px-2 font-display text-lg font-semibold text-primary">
          {APP_NAME}
        </Link>
        <div className="flex-1">
          <AppNav links={links} variant="sidebar" />
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-4">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{user.role}</span>
          <UserButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-card/90 px-4 py-3 backdrop-blur sm:hidden">
          <Link href="/dashboard" className="font-display text-base font-semibold text-primary">{APP_NAME}</Link>
          <UserButton />
        </header>
        {/* Mobile nav */}
        <div className="sticky top-[57px] z-10 border-b bg-card/90 backdrop-blur sm:hidden">
          <AppNav links={links} variant="bar" />
        </div>

        <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

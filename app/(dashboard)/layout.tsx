import { redirect } from "next/navigation";
import Link from "next/link";
import { syncCurrentUser, isTeamLeadOrAbove } from "@/lib/auth";
import { UserButton } from "@/lib/auth/provider-components";
import { AppNav, type NavGroup } from "@/components/nav/app-nav";
import { APP_NAME } from "@/lib/constants";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  team_lead: "Team Lead",
  agent: "Agent",
};

/**
 * Authenticated shell. Middleware blocks unauthenticated access; here we ensure a
 * local users row exists (sync) and load role for nav. Desktop = left sidebar,
 * mobile = compact top bar + scrollable icon nav (field-first).
 *
 * The nav is grouped by what the agent is doing rather than listed flat: a flat list
 * of fifteen links makes the reader scan the whole thing to find one page, and it
 * hides which pages belong together.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await syncCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.active) redirect("/pending");

  const lead = isTeamLeadOrAbove(user);
  const leadOnly = <T,>(items: T[]): T[] => (lead ? items : []);

  // Role filtering happens here, on the server, so a team-lead-only href is never sent
  // to an agent's browser at all.
  const groups: NavGroup[] = [
    {
      label: "Workspace",
      links: [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/inbox", label: "Inbox" },
        { href: "/appointments", label: "Appointments" },
        { href: "/reminders", label: "Reminders" },
      ],
    },
    {
      label: "Lead management",
      links: [
        { href: "/leads", label: "Leads" },
        { href: "/contacts", label: "Contacts" },
        ...leadOnly([{ href: "/leads-capture", label: "Leads capture" }]),
      ],
    },
    {
      label: "Sales",
      links: [
        { href: "/projects", label: "Projects" },
        { href: "/properties", label: "Properties" },
        { href: "/pipeline", label: "Pipeline" },
      ],
    },
    {
      label: "Communication",
      links: leadOnly([{ href: "/templates", label: "Templates" }]),
    },
    {
      label: "Insights",
      links: [
        { href: "/reports", label: "Reports" },
        ...leadOnly([{ href: "/settings/commission", label: "Commission" }]),
      ],
    },
    {
      label: "Team",
      links: leadOnly([
        { href: "/team", label: "My team" },
        { href: "/users", label: "Users" },
      ]),
    },
    {
      label: "Support",
      links: [{ href: "/help", label: "Guide" }],
    },
  ];

  return (
    <div className="min-h-dvh sm:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card sm:flex">
        <div className="border-b px-4 py-4">
          <Link href="/dashboard" className="block font-display text-lg font-semibold leading-tight text-primary">
            {APP_NAME}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {user.name} · {ROLE_LABEL[user.role] ?? user.role}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <AppNav groups={groups} variant="sidebar" />
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <span className="truncate text-xs text-muted-foreground">{user.name}</span>
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
          <AppNav groups={groups} variant="bar" />
        </div>

        <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { syncCurrentUser, isTeamLeadOrAbove } from "@/lib/auth";
import { UserButton } from "@/lib/auth/provider-components";
import { AppNav, type NavGroup } from "@/components/nav/app-nav";
import { APP_NAME } from "@/lib/constants";
import { BookOpen } from "lucide-react";

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
  /**
   * Six primary links, then everything else folded away.
   *
   * The list was fifteen items under seven headings, which is a lot of reading to find
   * the one page you want — and the headings did not help, because the eye still has to
   * pass all of them. What an agent uses every day is now unheaded and on top; what they
   * touch occasionally is one click away; what only a Team Lead touches is in Settings.
   *
   * Nothing was deleted. Every page still resolves by URL and by the links that lead to
   * it from the pages where it matters — Contacts from Leads, Properties from Projects.
   */
  const groups: NavGroup[] = [
    {
      label: null,
      links: [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/inbox", label: "Inbox" },
        { href: "/working-leads", label: "Working leads" },
        { href: "/leads", label: "Leads" },
        { href: "/appointments", label: "Appointments" },
        { href: "/pipeline", label: "Pipeline" },
        { href: "/projects", label: "Projects" },
      ],
    },
    {
      label: "More",
      collapsible: true,
      links: [
        { href: "/contacts", label: "Contacts" },
        { href: "/properties", label: "Properties" },
        { href: "/reports", label: "Reports" },
      ],
    },
    {
      label: "Team",
      collapsible: true,
      links: leadOnly([{ href: "/team", label: "My team" }]),
    },
    {
      label: "Settings",
      collapsible: true,
      links: leadOnly([
        { href: "/leads-capture", label: "Leads capture" },
        { href: "/templates", label: "Templates" },
        { href: "/settings/commission", label: "Commission" },
        { href: "/users", label: "Users" },
      ]),
    },
  ];

  return (
    <div className="app-shell min-h-dvh sm:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col sm:flex">
        <div className="px-4 py-5">
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
        <div className="flex items-center justify-between gap-2 border-t border-gray-200/70 px-4 py-3 dark:border-gray-800">
          <span className="truncate text-xs text-muted-foreground">{user.name}</span>
          <div className="flex shrink-0 items-center gap-1">
            {/* The guide is reference, not a destination — an icon, not a nav row. */}
            <Link
              href="/help"
              title="User guide"
              aria-label="User guide"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <BookOpen className="h-4 w-4" />
            </Link>
            <UserButton />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200/70 bg-card/80 px-4 py-3 backdrop-blur sm:hidden">
          <Link href="/dashboard" className="font-display text-base font-semibold text-primary">{APP_NAME}</Link>
          <UserButton />
        </header>
        {/* Mobile nav */}
        <div className="sticky top-[57px] z-10 border-b border-gray-200/70 bg-card/80 backdrop-blur sm:hidden">
          <AppNav groups={groups} variant="bar" />
        </div>

        <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

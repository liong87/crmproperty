import { redirect } from "next/navigation";
import Link from "next/link";
import { syncCurrentUser, isTeamLeadOrAbove } from "@/lib/auth";
import { UserButton } from "@/lib/auth/provider-components";
import { AppNav, type NavGroup } from "@/components/nav/app-nav";
import { countActiveWorkingLeads } from "@/server/leads/working";
import { APP_NAME } from "@/lib/constants";
import { COMMISSION_ENABLED } from "@/lib/features";
import { BookOpen } from "lucide-react";
import { GlobalSearch } from "@/components/search/global-search";
import { MeProvider } from "@/lib/me-context";

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
  // One cheap count; the sidebar renders on every page.
  const activeCount = await countActiveWorkingLeads(user);
  const leadOnly = <T,>(items: T[]): T[] => (lead ? items : []);

  // Role filtering happens here, on the server, so a team-lead-only href is never sent
  // to an agent's browser at all.
  /**
   * Grouped by what you are DOING, not by what kind of record it is.
   *
   * Workspace is today's work; Lead management is where leads come from and how they
   * are administered. That split is why Leads capture moved out of Settings — routing
   * rules and the lead database are the same job, and burying capture next to Users
   * made it feel like configuration rather than part of the pipeline.
   *
   * Workspace and Lead management never collapse: between them they are most of what
   * anybody opens, and a fold on the thing you use hourly is friction, not tidiness.
   */
  const groups: NavGroup[] = [
    {
      label: null,
      links: [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/inbox", label: "Inbox" },
      ],
    },
    {
      label: "Workspace",
      mobile: true,
      links: [
        { href: "/working-leads", label: "Working leads", badge: activeCount },
        { href: "/appointments", label: "Appointments" },
        { href: "/pipeline", label: "Pipeline" },
      ],
    },
    {
      label: "Lead management",
      links: [
        { href: "/leads", label: "Leads" },
        ...leadOnly([{ href: "/leads-capture", label: "Leads capture" }]),
        { href: "/reports", label: "Reports" },
      ],
    },
    {
      label: "Learning",
      collapsible: true,
      links: [{ href: "/learning", label: "Learning hub" }],
    },
    {
      label: "Property",
      collapsible: true,
      links: [
        { href: "/properties", label: "Properties" },
        { href: "/projects", label: "Projects" },
        { href: "/contacts", label: "Contacts" },
      ],
    },
    {
      label: "Team",
      collapsible: true,
      links: leadOnly([
        { href: "/team", label: "My team" },
        ...(COMMISSION_ENABLED ? [{ href: "/settings/commission", label: "Commission" }] : []),
      ]),
    },
    {
      label: "Settings",
      collapsible: true,
      links: leadOnly([
        { href: "/templates", label: "Templates" },
        { href: "/users", label: "Users" },
      ]),
    },
  ];

  return (
    /*
     * MeProvider carries the viewer's own id to every Client Component below, so a name
     * that is yours renders as "Name (You)" wherever colleagues' names appear beside it.
     * See lib/me-context.tsx for why this is a context and not a prop.
     */
    <MeProvider id={user.id}>
    <div className="app-shell min-h-dvh sm:flex">
      {/* Fifteen nav links sit ahead of the content in tab order on every route. */}
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col sm:flex">
        <div className="px-4 pb-3 pt-5">
          <Link href="/dashboard" className="block font-display text-lg font-semibold leading-tight text-primary">
            {APP_NAME}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {user.name} · {ROLE_LABEL[user.role] ?? user.role}
          </p>
        </div>
        <div className="px-4 pb-1">
          <GlobalSearch />
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
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-gray-200/70 bg-card/80 px-4 py-3 backdrop-blur sm:hidden">
          <Link href="/dashboard" className="min-w-0 truncate font-display text-base font-semibold text-primary">{APP_NAME}</Link>
          <div className="flex shrink-0 items-center gap-1">
            {/*
              The nav is filtered by role on the server, so on a phone — where the name
              and role never appeared at all — a team lead and an agent saw two different
              menus with nothing on screen explaining why.
            */}
            <span className="mr-1 hidden text-[11px] text-muted-foreground xs:inline">
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
            <GlobalSearch variant="icon" />
            <UserButton />
          </div>
        </header>
        {/* Mobile nav */}
        <div className="sticky top-[57px] z-10 border-b border-gray-200/70 bg-card/80 backdrop-blur sm:hidden">
          <AppNav groups={groups} variant="bar" />
        </div>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 p-4 outline-none sm:p-6">
          {children}
        </main>
      </div>
    </div>
    </MeProvider>
  );
}

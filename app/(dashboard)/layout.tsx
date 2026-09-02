import { redirect } from "next/navigation";
import Link from "next/link";
import { syncCurrentUser, isTeamLeadOrAbove } from "@/lib/auth";
import { UserButton } from "@/lib/auth/provider-components";
import { AppNav, SidebarToggle, type NavGroup } from "@/components/nav/app-nav";
import { getSidebarCollapsed } from "@/lib/sidebar-pref";
import { countActiveWorkingLeads } from "@/server/leads/working";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { COMMISSION_ENABLED } from "@/lib/features";
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
  // One cheap count; the sidebar renders on every page.
  const activeCount = await countActiveWorkingLeads(user);
  // Read before the first paint, so a collapsed rail never renders wide and
  // then snap to narrow — see server/preferences/sidebar.ts.
  const collapsed = await getSidebarCollapsed();
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
      label: "Property",
      collapsible: true,
      links: [
        { href: "/properties", label: "Properties" },
        { href: "/projects", label: "Projects" },
        { href: "/contacts", label: "Contacts" },
      ],
    },
    {
      // Learning Hub is visible to everyone: a Team Lead uploads and publishes,
      // their downline watches. Only "My team" and "Commission" stay lead-only —
      // the reason this group is not wrapped in leadOnly() as a whole. Anybody
      // who wants it out of the fold and up top can pin it (see below), which is
      // a better answer than the layout deciding that for all three roles.
      label: "Team",
      collapsible: true,
      links: [
        ...leadOnly([{ href: "/team", label: "My team" }]),
        { href: "/learning", label: "Learning Hub" },
        ...leadOnly(COMMISSION_ENABLED ? [{ href: "/settings/commission", label: "Commission" }] : []),
      ],
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
    <div className="app-shell min-h-dvh sm:flex">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col sm:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className={cn("py-5", collapsed ? "px-2 text-center" : "px-4")}>
          <Link
            href="/dashboard"
            title={collapsed ? APP_NAME : undefined}
            className="block truncate font-display font-semibold leading-tight text-primary"
          >
            {/* Collapsed, the wordmark becomes its initial — the logo slot still
                reads as "home", which is what people click it for. */}
            {collapsed ? <span className="text-xl">{APP_NAME.charAt(0)}</span> : <span className="text-lg">{APP_NAME}</span>}
          </Link>
          {!collapsed && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {user.name} · {ROLE_LABEL[user.role] ?? user.role}
            </p>
          )}
        </div>
        <div className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-4")}>
          <AppNav groups={groups} variant="sidebar" collapsed={collapsed} />
        </div>
        <div
          className={cn(
            "border-t border-gray-200/70 py-3 dark:border-gray-800",
            collapsed ? "flex flex-col items-center gap-1 px-2" : "flex items-center justify-between gap-2 px-4",
          )}
        >
          {!collapsed && <span className="truncate text-xs text-muted-foreground">{user.name}</span>}
          <div className={cn("flex shrink-0 items-center gap-1", collapsed && "flex-col")}>
            {/* The guide is reference, not a destination — an icon, not a nav row. */}
            <Link
              href="/help"
              title="User guide"
              aria-label="User guide"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <BookOpen className="h-4 w-4" />
            </Link>
            <SidebarToggle collapsed={collapsed} />
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

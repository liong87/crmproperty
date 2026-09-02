"use client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, Inbox, Contact, Building2, Columns3, ChevronRight, BarChart3, UserCog,
  MessageSquareText, CalendarCheck, Landmark, Radio, BookOpen, Percent, BellRing, Users2, Settings2, LayoutGrid, ListChecks, GraduationCap,
  PanelLeftClose, PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { setSidebarCollapsed } from "@/server/preferences/sidebar";

const ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/inbox": BellRing,
  "/working-leads": ListChecks,
  "/leads": Inbox,
  "/contacts": Contact,
  "/projects": Landmark,
  "/properties": Building2,
  "/pipeline": Columns3,
  "/appointments": CalendarCheck,
  "/reports": BarChart3,
  "/help": BookOpen,
  "/settings/commission": Percent,
  "/leads-capture": Radio,
  "/templates": MessageSquareText,
  "/team": Users2,
  "/learning": GraduationCap,
  "/settings": Settings2,
  "/more": LayoutGrid,
  "/users": UserCog,
};

export interface NavLink {
  href: string;
  label: string;
  /** A count on the right of the row. Zero renders NOTHING — a "0" badge is noise
   *  that trains the eye to ignore the badge entirely, which defeats the point. */
  badge?: number;
}

/**
 * A section of the sidebar.
 *
 * `label: null` renders the links bare, with no heading — that is the primary block,
 * the six things an agent uses every day.
 *
 * `collapsible` folds a section away behind its heading. Seven headed groups was itself
 * a form of clutter: the eye still has to read past all of them. Everything an agent
 * touches occasionally now sits inside a fold, open only when they go looking.
 *
 * A group whose links are all filtered out by role disappears entirely, heading and
 * all, so an agent never sees an empty "Settings".
 */
export interface NavGroup {
  label: string | null;
  links: NavLink[];
  /** Folds behind its heading. Workspace and Lead management never do. */
  collapsible?: boolean;
  /** Included in the mobile strip. A phone gets what you do today, nothing else. */
  mobile?: boolean;
}

export function AppNav({
  groups, variant, collapsed,
}: {
  groups: NavGroup[];
  variant: "sidebar" | "bar";
  /** Icons-only rail. Sidebar variant only; the mobile strip is always icons. */
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const visible = groups.filter((g) => g.links.length > 0);

  const item = (l: NavLink) => {
    const Icon = ICONS[l.href] ?? LayoutDashboard;
    const isActive = active(l.href);
    return (
      <Link
        key={l.href}
        href={l.href}
        aria-current={active(l.href) ? "page" : undefined}
        // The title is what makes the collapsed rail usable: an icon alone is a
        // guess, and a rail you have to expand to read is a rail nobody keeps
        // collapsed. Native title rather than a tooltip component — it costs
        // nothing and works before hydration.
        title={collapsed ? l.label : undefined}
        className={cn(
          "flex items-center rounded-lg text-sm font-medium transition-colors",
          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2",
          isActive
            ? "bg-brand-gradient text-primary-foreground shadow-md shadow-primary/25"
            : "text-muted-foreground hover:bg-gray-900/5 hover:text-foreground dark:hover:bg-white/10",
        )}
      >
        <span className="relative shrink-0">
          <Icon className="h-4 w-4" />
          {/* Collapsed, there is no room for a number, so the badge becomes a
              dot — it still says "something is waiting here", which is the only
              part that has to survive the loss of the label. */}
          {collapsed && l.badge !== undefined && l.badge > 0 && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2",
                isActive ? "bg-white ring-primary" : "bg-primary ring-card",
              )}
            />
          )}
        </span>
        {!collapsed && <span className="truncate">{l.label}</span>}
        {!collapsed && l.badge !== undefined && l.badge > 0 && (
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
              isActive ? "bg-white/20 text-primary-foreground" : "bg-secondary text-secondary-foreground",
            )}
          >
            {l.badge}
          </span>
        )}
      </Link>
    );
  };

  /*
   * Collapsed: one flat column of icons, no headings and no folds.
   *
   * Group headings are the first thing to go — "LEAD MANAGEMENT" does not fit,
   * and truncating it to "LEA…" is worse than nothing. The folds go too: a
   * <details> summary you cannot read is a control nobody can use, and hiding
   * half the icons behind it would make the rail actively worse than the full
   * sidebar it replaced. A thin rule between groups keeps the grouping legible
   * without needing words for it.
   */
  if (variant === "sidebar" && collapsed) {
    return (
      <nav className="flex flex-col gap-1">
        {visible.map((group, i) => (
          <div key={group.label ?? "primary"} className="flex flex-col gap-1">
            {i > 0 && <div aria-hidden="true" className="mx-auto my-1 h-px w-6 bg-gray-200/70 dark:bg-gray-800" />}
            {group.links.map((l) => item(l))}
          </div>
        ))}
      </nav>
    );
  }

  if (variant === "sidebar") {
    return (
      <nav className="flex flex-col gap-4">
        {visible.map((group) => {
          if (group.label === null) {
            return (
              <div key="primary" className="flex flex-col gap-1">
                {group.links.map(item)}
              </div>
            );
          }

          if (group.collapsible) {
            // <details> rather than useState: it is a disclosure, the browser already
            // implements one, and it renders open-or-closed correctly on the server.
            // Open when the current page lives inside it, so you never land on a page
            // whose nav entry is hidden.
            const containsCurrent = group.links.some((l) => active(l.href));
            return (
              <details key={group.label} open={containsCurrent} className="group/fold">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/70 hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-3 w-3 shrink-0 transition-transform duration-200 group-open/fold:rotate-90" />
                  {group.label}
                </summary>
                <div className="mt-1 flex flex-col gap-1">{group.links.map(item)}</div>
              </details>
            );
          }

          return (
            <div key={group.label} className="flex flex-col gap-1">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/70">
                {group.label}
              </p>
              {group.links.map(item)}
            </div>
          );
        })}
      </nav>
    );
  }

  /*
   * Mobile: the primary block only, plus one "More" tile.
   *
   * Flattening every group here put thirteen icons in a strip nobody scrolls to the end
   * of. A phone is where an agent works leads between viewings; it is not where anybody
   * edits a commission scheme.
   */
  const barLinks: NavLink[] = [
    ...visible.filter((g) => g.label === null || g.mobile).flatMap((g) => g.links),
    { href: "/more", label: "More" },
  ];

  return (
    <nav className="flex gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {barLinks.map((l) => {
        const Icon = ICONS[l.href] ?? LayoutDashboard;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active(l.href) ? "page" : undefined}
            className={cn(
              "flex shrink-0 flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors",
              active(l.href)
              ? "bg-brand-gradient text-primary-foreground"
              : "text-muted-foreground",
            )}
          >
            <span className="relative">
              <Icon className="h-[18px] w-[18px]" />
              {l.badge !== undefined && l.badge > 0 && (
                <span className="absolute -right-2 -top-1 min-w-[14px] rounded-full bg-primary px-1 text-[9px] font-bold leading-[14px] text-primary-foreground">
                  {l.badge}
                </span>
              )}
            </span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The collapse toggle, at the foot of the sidebar.
 *
 * Writes a cookie through a server action and then refreshes, rather than
 * flipping a class locally: the width has to be right on the NEXT first paint
 * too, and a client-only toggle forgets by the next full page load. The refresh
 * is what makes the server re-read the cookie it just set.
 */
export function SidebarToggle({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  return (
    <button
      type="button"
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-expanded={!collapsed}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setSidebarCollapsed(!collapsed);
          router.refresh();
        })
      }
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
    >
      {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
    </button>
  );
}

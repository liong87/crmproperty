"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, Inbox, Contact, Building2, Columns3, ChevronRight, BarChart3, UserCog,
  MessageSquareText, CalendarCheck, Landmark, Radio, BookOpen, Percent, BellRing, Users2, Settings2, LayoutGrid, ListChecks,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  "/settings": Settings2,
  "/more": LayoutGrid,
  "/users": UserCog,
};

export interface NavLink { href: string; label: string }

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
  collapsible?: boolean;
}

export function AppNav({ groups, variant }: { groups: NavGroup[]; variant: "sidebar" | "bar" }) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const visible = groups.filter((g) => g.links.length > 0);

  const item = (l: NavLink) => {
    const Icon = ICONS[l.href] ?? LayoutDashboard;
    return (
      <Link
        key={l.href}
        href={l.href}
        aria-current={active(l.href) ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active(l.href)
            ? "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-md shadow-primary/25"
            : "text-muted-foreground hover:bg-gray-900/5 hover:text-foreground dark:hover:bg-white/10",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {l.label}
      </Link>
    );
  };

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
    ...(visible.find((g) => g.label === null)?.links ?? []),
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
              ? "bg-gradient-to-r from-primary to-accent text-primary-foreground"
              : "text-muted-foreground",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

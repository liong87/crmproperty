"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, Inbox, Contact, Building2, Columns3, Bell, BarChart3, UserCog,
  MessageSquareText, CalendarCheck, Landmark, Radio, BookOpen, Percent, BellRing, Users2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/inbox": BellRing,
  "/leads": Inbox,
  "/contacts": Contact,
  "/projects": Landmark,
  "/properties": Building2,
  "/pipeline": Columns3,
  "/appointments": CalendarCheck,
  "/reminders": Bell,
  "/reports": BarChart3,
  "/help": BookOpen,
  "/settings/commission": Percent,
  "/leads-capture": Radio,
  "/templates": MessageSquareText,
  "/team": Users2,
  "/users": UserCog,
};

export interface NavLink { href: string; label: string }
/**
 * A labelled section of the sidebar. A group whose links are all filtered out by role
 * disappears with its heading, so an agent never sees an empty "Team" label.
 */
export interface NavGroup { label: string; links: NavLink[] }

export function AppNav({ groups, variant }: { groups: NavGroup[]; variant: "sidebar" | "bar" }) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const visible = groups.filter((g) => g.links.length > 0);

  if (variant === "sidebar") {
    return (
      <nav className="flex flex-col gap-5">
        {visible.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/70">
              {group.label}
            </p>
            {group.links.map((l) => {
              const Icon = ICONS[l.href] ?? LayoutDashboard;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active(l.href) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active(l.href)
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {l.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    );
  }

  // Mobile: one scrollable strip. Group headings would cost a whole row of a screen
  // that has four, so the grouping survives only as the order of the icons.
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {visible.flatMap((g) => g.links).map((l) => {
        const Icon = ICONS[l.href] ?? LayoutDashboard;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active(l.href) ? "page" : undefined}
            className={cn(
              "flex shrink-0 flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors",
              active(l.href) ? "bg-primary text-primary-foreground" : "text-muted-foreground",
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

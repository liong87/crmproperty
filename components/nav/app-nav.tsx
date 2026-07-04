"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, Inbox, Contact, Building2, Columns3, Bell, BarChart3, UserCog,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/leads": Inbox,
  "/contacts": Contact,
  "/properties": Building2,
  "/pipeline": Columns3,
  "/reminders": Bell,
  "/reports": BarChart3,
  "/users": UserCog,
};

export interface NavLink { href: string; label: string }

export function AppNav({ links, variant }: { links: NavLink[]; variant: "sidebar" | "bar" }) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  if (variant === "sidebar") {
    return (
      <nav className="flex flex-col gap-1">
        {links.map((l) => {
          const Icon = ICONS[l.href] ?? LayoutDashboard;
          return (
            <Link
              key={l.href}
              href={l.href}
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
      </nav>
    );
  }

  return (
    <nav className="flex gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {links.map((l) => {
        const Icon = ICONS[l.href] ?? LayoutDashboard;
        return (
          <Link
            key={l.href}
            href={l.href}
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

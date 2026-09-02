import Link from "next/link";
import { cn } from "@/lib/utils";

export interface SegmentItem { href: string; label: string; count?: number; active: boolean }

/**
 * Segmented tabs — Active / Inactive / Appointment.
 *
 * The active tab carries the app's ONLY box-shadow, and it is a coloured one matching
 * its own gradient. That is what makes it pop on a shadowless interface; using shadow
 * anywhere else spends the effect and the tab stops reading as selected.
 *
 * Fixed 30px height, and each count is its own element rather than baked into the
 * label, so the number can be toned down without dimming the word.
 */
export function Segmented({ items }: { items: SegmentItem[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition",
            t.active
              ? "bg-brand-gradient text-primary-foreground shadow-md shadow-primary/25"
              : "text-muted-foreground hover:bg-gray-900/5 hover:text-foreground dark:hover:bg-white/10",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cn("tabular-nums", t.active ? "opacity-80" : "opacity-60")}>
              {t.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

/** Filter chips: pill, hairline border, no fill until selected. */
export function FilterChip({
  href, label, active,
}: {
  href: string; label: string; active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition",
        active
          ? "border-transparent bg-brand-gradient text-primary-foreground"
          : "border-input bg-card text-muted-foreground hover:border-gray-300 hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

import { statusGroup } from "@/lib/constants";
/** Semantic tint classes for status badges (palette-derived, not raw traffic-light). */
/**
 * Status chip colours, keyed by STAGE GROUP rather than by name.
 *
 * Nine names would be nine cases to forget; five groups is the whole vocabulary and a
 * new status inherits a sensible colour the moment it is added to the list.
 */
export function leadStatusTone(status: string): string {
  switch (statusGroup(status)) {
    case "new": return "bg-secondary text-secondary-foreground";
    case "working": return "bg-accent/15 text-accent-foreground";
    case "appointment": return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
    case "closed": return "bg-primary/10 text-primary";
    case "dead": return "bg-muted text-muted-foreground";
  }
}


export function propertyStatusTone(status: string): string {
  switch (status) {
    case "active": return "bg-primary/10 text-primary";
    case "pending": return "bg-accent/15 text-accent-foreground";
    case "sold":
    case "rented": return "bg-primary text-primary-foreground";
    case "withdrawn": return "bg-muted text-muted-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

export function projectStatusTone(status: string): string {
  switch (status) {
    case "upcoming": return "bg-secondary text-secondary-foreground";
    case "open": return "bg-primary/10 text-primary";
    case "closing": return "bg-accent/15 text-accent-foreground";
    case "closed": return "bg-muted text-muted-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

/** Slugs read better as words in the UI: "no-show" -> "no show". */
export function humaniseSlug(s: string): string {
  return s.replace(/-/g, " ");
}

export function appointmentStatusTone(status: string): string {
  switch (status) {
    case "showed-up": return "bg-primary/10 text-primary";
    case "no-show": return "bg-amber-100 text-amber-900";
    case "cancelled": return "bg-muted text-muted-foreground";
    case "scheduled": return "bg-secondary text-secondary-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

export function appointmentOutcomeTone(outcome: string): string {
  switch (outcome) {
    // A booking is the whole point; it should be the one thing that stands out.
    case "booked": return "bg-primary text-primary-foreground";
    case "interested": return "bg-accent/15 text-accent-foreground";
    case "not-interested": return "bg-muted text-muted-foreground";
    case "undecided": return "bg-secondary text-secondary-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

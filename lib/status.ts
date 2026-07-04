/** Semantic tint classes for status badges (palette-derived, not raw traffic-light). */
export function leadStatusTone(status: string): string {
  switch (status) {
    case "new": return "bg-secondary text-secondary-foreground";
    case "contacted": return "bg-accent/15 text-accent-foreground";
    case "qualified": return "bg-primary/10 text-primary";
    case "disqualified": return "bg-muted text-muted-foreground";
    default: return "bg-muted text-muted-foreground";
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

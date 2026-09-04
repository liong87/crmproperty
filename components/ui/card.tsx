import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A card is: white, 16px radius, a 1px hairline, and NO shadow.
 *
 * The canvas behind it is tinted, so the card already reads as raised. Adding a
 * shadow on top is what makes an interface look like a template — and it spends the
 * one visual effect the design system reserves for the active segmented tab.
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-gray-100 bg-card text-card-foreground dark:border-gray-800", className)}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-5", className)} {...props} />;
}

/**
 * `as` defaults to h2, not h3.
 *
 * Every page has one h1 (PageTitle) and then cards. Hardcoding h3 made the whole app
 * jump h1 → h3 with no h2 anywhere, which is what axe flags on /dashboard and /help
 * and what makes the heading list useless for navigating by heading. Pass
 * `as="h3"` for a card genuinely nested inside a titled section.
 */
export function CardTitle({
  className,
  as: Tag = "h2",
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" | "h4" }) {
  return <Tag className={cn("text-base font-semibold leading-none tracking-tight", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

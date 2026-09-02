import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A card is: white, 16px radius, a 1px gray-100 hairline, and NO shadow.
 *
 * The canvas behind it is #eef2f9, so the card already reads as raised. Adding a
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
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold leading-none tracking-tight", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format MYR integer cents -> "RM 1,234.56" */
export function formatMYR(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(cents / 100);
}

/** Price per sqft in RM, computed (not stored) from cents + built-up area. */
export function pricePerSqft(askingPriceCents: number, builtUpSqft: number | null | undefined): string {
  if (!builtUpSqft || builtUpSqft <= 0) return "—";
  const rm = askingPriceCents / 100 / builtUpSqft;
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", maximumFractionDigits: 0 }).format(rm);
}

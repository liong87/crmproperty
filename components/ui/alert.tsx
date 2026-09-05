"use client";
import * as React from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one place a form or a row action announces a failure.
 *
 * Before this, every error in the app was a bare `<p className="text-destructive-ink">`.
 * There was not one `role="alert"` in `components/`, which means a failed save was
 * completely silent to a screen reader — the user pressed Save, nothing was read out,
 * and the record was not written.
 *
 * `focusOnMount` additionally moves focus to the message, which is what makes a
 * summary at the top of a long form useful rather than decorative.
 */
export const FormAlert = React.forwardRef<
  HTMLDivElement,
  {
    children: React.ReactNode;
    tone?: "error" | "success";
    className?: string;
    focusOnMount?: boolean;
  }
>(function FormAlert({ children, tone = "error", className, focusOnMount }, ref) {
  const inner = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => inner.current as HTMLDivElement);
  React.useEffect(() => {
    if (focusOnMount) inner.current?.focus();
  }, [focusOnMount]);

  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      ref={inner}
      role={tone === "error" ? "alert" : "status"}
      tabIndex={focusOnMount ? -1 : undefined}
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tone === "error"
          ? "border-destructive/30 bg-destructive/5 text-destructive-ink"
          : "border-primary/30 bg-primary/5 text-primary",
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
});

/** Polite announcement with no box — for counts and transient status. */
export function LiveStatus({ children }: { children: React.ReactNode }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {children}
    </span>
  );
}

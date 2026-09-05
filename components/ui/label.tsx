import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * `required` renders the asterisk AND an sr-only "required", because an asterisk on
 * its own is a convention sighted users learn and screen-reader users are simply not
 * told. The input itself should still carry `required` / `aria-required`.
 */
export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }
>(({ className, required, children, ...props }, ref) => (
  <label ref={ref} className={cn("text-sm font-medium leading-none", className)} {...props}>
    {children}
    {required && (
      <>
        <span aria-hidden="true" className="ml-0.5 text-destructive-ink">
          *
        </span>
        <span className="sr-only"> (required)</span>
      </>
    )}
  </label>
));
Label.displayName = "Label";

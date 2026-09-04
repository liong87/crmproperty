import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Focus: `ring-2 ring-ring` alone was invisible on the gradient primary button and on
 * the destructive one, because the ring sat directly on a saturated fill. It now gets
 * a 2px offset in the page colour, which is the only way a single ring reads on both a
 * white card and a coloured button.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        // One gradient for every primary action, brightened on hover rather than
        // swapped for a second colour — one thing to maintain, and nothing competes.
        default: "bg-brand-gradient text-primary-foreground hover:brightness-110",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-110",
        /*
         * `text-muted-foreground` at rest is 4.6:1 on the card — it passes, but only
         * just, and the hardcoded `gray-50` / `gray-300` hovers sat outside the token
         * system, so they did not follow the theme. Both are now tokens, and the label
         * is `text-foreground` so a secondary action is still legible at a glance.
         */
        outline:
          "border border-input bg-card text-foreground hover:border-ring/40 hover:bg-secondary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-foreground hover:bg-secondary",
      },
      size: {
        // h-10 is the toolbar height everything else lines up to. h-11 stays as
        // "touch" for the field forms, where a 44px target still matters more.
        default: "h-10 rounded-xl px-4",
        sm: "h-9 rounded-lg px-3",
        lg: "h-12 rounded-xl px-8",
        touch: "h-11 rounded-xl px-4",
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    // Defaulting to type="button" — an unset type inside a <form> is "submit", which
    // is how a Cancel next to a Save ends up submitting the form.
    <button type={type} className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // One gradient for every primary action, brightened on hover rather than
        // swapped for a second colour — one thing to maintain, and nothing competes.
        default: "bg-brand-gradient text-primary-foreground hover:brightness-110",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-110",
        outline:
          "border border-input bg-card text-muted-foreground hover:border-gray-300 hover:bg-gray-50 hover:text-foreground dark:hover:bg-gray-800",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
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
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };

"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Arm-then-confirm, done so a keyboard user can actually finish it.
 *
 * The pattern itself is right and stays: no `window.confirm`, no modal for a one-row
 * delete. What was wrong is that arming replaced the focused button with a different
 * subtree, so focus fell to `<body>` and the user had to Tab from the top of the page
 * to reach "Confirm" — and nothing was announced, so a screen-reader user did not know
 * the question had been asked.
 *
 * Here the question is a `role="alertdialog"` group, focus moves to Confirm, Escape
 * cancels, and cancelling returns focus to the trigger.
 */
export function ConfirmButton({
  onConfirm,
  question,
  confirmLabel = "Confirm",
  children,
  pending,
  disabled,
  variant = "ghost",
  size = "sm",
  className,
  triggerLabel,
}: {
  onConfirm: () => void;
  /** Names the record. "Delete Ali Rahman?" — never a bare "Are you sure?". */
  question: string;
  confirmLabel?: string;
  children: React.ReactNode;
  pending?: boolean;
  disabled?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  /** Accessible name when `children` is icon-only. */
  triggerLabel?: string;
}) {
  const [armed, setArmed] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const confirm = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (armed) confirm.current?.focus();
  }, [armed]);

  const cancel = React.useCallback(() => {
    setArmed(false);
    trigger.current?.focus();
  }, []);

  if (!armed) {
    return (
      <Button
        ref={trigger}
        variant={variant}
        size={size}
        disabled={disabled || pending}
        aria-label={triggerLabel}
        className={className}
        onClick={() => setArmed(true)}
      >
        {children}
      </Button>
    );
  }

  return (
    <span
      role="alertdialog"
      aria-label={question}
      className={cn("inline-flex flex-wrap items-center gap-1.5", className)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          cancel();
        }
      }}
    >
      <span className="text-xs text-muted-foreground">{question}</span>
      <Button
        ref={confirm}
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={cancel}>
        Cancel
      </Button>
    </span>
  );
}

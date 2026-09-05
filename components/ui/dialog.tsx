"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * The app's modal.
 *
 * `edit-lead-dialog.tsx` had `role="dialog" aria-modal="true"` and nothing else: Tab
 * walked straight out of it into the leads table behind the backdrop, focus never
 * entered the dialog on open, and it never came back to the row's Edit button on
 * close. `add-form-dialog.tsx` could not be closed from the keyboard at all.
 *
 * Everything that was missing lives here once:
 *  - focus moves in on open (to `initialFocus`, or the first focusable element)
 *  - Tab and Shift+Tab are trapped
 *  - Escape closes, but NOT while a value is mid-composition (IME) — and the owner
 *    decides via `onRequestClose` whether unsaved work should ask first
 *  - focus returns to whatever opened it
 *  - the page behind stops scrolling
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  initialFocus,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  initialFocus?: React.RefObject<HTMLElement>;
}) {
  const panel = React.useRef<HTMLDivElement>(null);
  const restoreTo = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const descId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const first = initialFocus?.current ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.current;
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // An IME candidate window also swallows Escape; don't close mid-composition.
        if ((e as unknown as { isComposing?: boolean }).isComposing) return;
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose, initialFocus]);

  if (!open) return null;

  /*
   * PORTALLED TO <body>, and it has to be.
   *
   * A dialog opened from a table row renders inside that row's cell, and the leads
   * table pins two columns with `sticky z-10`. A z-index creates a stacking context,
   * so `z-50` on the overlay only outranks things INSIDE the same cell — every later
   * row's pinned cell still paints over it. The dialog looked correct and its buttons
   * were unclickable, which Playwright caught as "subtree intercepts pointer events".
   *
   * Escaping to the body puts the overlay in the root stacking context, where z-50
   * means what it appears to mean. Rendered only after mount, since `document` does
   * not exist while the server renders this.
   */
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          "max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border bg-card p-5 shadow-lg sm:max-w-lg sm:rounded-2xl",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

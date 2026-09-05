"use client";
import * as React from "react";
import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A labelled field with the three wires that were missing everywhere except
 * `lead-form.tsx`: `htmlFor`/`id`, `aria-invalid`, and `aria-describedby` pointing at
 * BOTH the hint and the error.
 *
 * The old shared helper was
 *
 *   function Field({ label, children }) { return <div><Label>{label}</Label>{children}</div> }
 *
 * — no `htmlFor`, and the wrapped input had no `id`. That made roughly forty controls
 * on the Property and Project forms announce as an unnamed "edit text", and clicking a
 * label focused nothing. `Field` now hands the child the ids it needs via a render
 * prop, so the wiring cannot be forgotten at the call site.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
    required?: boolean;
  }) => React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-error` : undefined;
  const described = [hintId, errId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children({
        id,
        required: required || undefined,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": described,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="flex items-start gap-1.5 text-sm font-medium text-destructive-ink">
          {/* The icon is the non-colour half of the signal — the message must not depend
              on red alone. A bare "!" character did that job but read as a typo in the
              sentence it preceded. */}
          <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

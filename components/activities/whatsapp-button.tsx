"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { sendWhatsAppAndLog } from "@/server/activities/actions";
import { renderTemplate, type TemplateValues } from "@/server/templates/render";
import type { TemplateRow } from "@/server/templates/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** "viewing_confirmation" reads better in a dropdown as "Viewing confirmation". */
function humanise(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function WhatsAppButton({
  entityType,
  entityId,
  toPhone,
  defaultMessage,
  templates = [],
  values = {},
}: {
  entityType: string;
  entityId: string;
  toPhone: string;
  defaultMessage?: string;
  /** Active WhatsApp templates, loaded by the page. Empty is fine — picker hides. */
  templates?: TemplateRow[];
  /** Values available for substitution on this record. */
  values?: TemplateValues;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [msg, setMsg] = React.useState(defaultMessage ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    // Replace rather than append: the box holds a greeting stub, and an agent picking
    // a template means "use this", not "add this to what is there".
    setMsg(renderTemplate(t.body, values));
  }

  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}>WhatsApp</Button>;

  function send() {
    setError(null);
    start(async () => {
      const res = await sendWhatsAppAndLog({ entityType, entityId, toPhone, message: msg });
      if (!res.success) return setError(res.error);
      window.open(res.data.url, "_blank", "noopener");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      {templates.length > 0 && (
        <div className="space-y-1">
          <Select
            aria-label="Use a template"
            defaultValue=""
            onChange={(e) => {
              applyTemplate(e.target.value);
              e.target.value = ""; // reset, so the same template can be picked twice
            }}
          >
            <option value="">Use a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {humanise(t.key)}
              </option>
            ))}
          </Select>
        </div>
      )}

      <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message…" />
      <p className="text-xs text-muted-foreground">
        Opens WhatsApp with this message ready — you still press send there.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={send} disabled={pending || !msg}>
          {pending ? "Opening…" : "Open WhatsApp"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

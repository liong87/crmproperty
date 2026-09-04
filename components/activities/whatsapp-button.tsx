"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { sendWhatsAppAndLog } from "@/server/activities/actions";
import { renderTemplate, missingValues, type TemplateValues } from "@/server/templates/render";
import type { TemplateRow } from "@/server/templates/actions";
import type { PickableListing } from "@/server/matching/queries";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormAlert } from "@/components/ui/alert";
import { formatMYR } from "@/lib/utils";

/**
 * "viewing_confirmation" and "sendPropertyDetails" both read better in a dropdown as
 * plain words. Seeded templates use camelCase, hand-written ones use underscores.
 */
function humanise(key: string): string {
  const s = key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "propertyTitle" → "property title", for a warning an agent can act on. */
function readablePlaceholder(raw: string): string {
  return raw.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

export function WhatsAppButton({
  entityType,
  entityId,
  toPhone,
  defaultMessage,
  templates = [],
  values = {},
  listings = [],
}: {
  entityType: string;
  entityId: string;
  toPhone: string;
  defaultMessage?: string;
  /** Active WhatsApp templates, loaded by the page. Empty is fine — picker hides. */
  templates?: TemplateRow[];
  /** Values available for substitution on this record. */
  values?: TemplateValues;
  /**
   * Listings the agent can reference. A lead has no property attached, so templates
   * mentioning one need somewhere to get it from.
   */
  listings?: PickableListing[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [msg, setMsg] = React.useState(defaultMessage ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [gaps, setGaps] = React.useState<string[]>([]);
  const [templateId, setTemplateId] = React.useState("");
  const [listingId, setListingId] = React.useState("");
  const [pending, start] = React.useTransition();

  /** Record values, plus the chosen listing's details when one is selected. */
  function valuesWith(listing: PickableListing | undefined): TemplateValues {
    if (!listing) return values;
    return {
      ...values,
      property: listing.title,
      price: formatMYR(listing.askingPrice),
      // Prefer the listing's area over the client's stated preference: the message is
      // about this property, so "in Mont Kiara" should describe where it actually is.
      area: listing.area,
    };
  }

  function apply(tId: string, lId: string) {
    const t = templates.find((x) => x.id === tId);
    if (!t) return;
    const merged = valuesWith(listings.find((l) => l.id === lId));
    // Replace rather than append: the box holds a greeting stub, and an agent picking
    // a template means "use this", not "add this to what is there".
    setMsg(renderTemplate(t.body, merged));
    // Warn about anything still unfilled. Without this the agent gets a sentence that
    // simply stops — "here are the details for:" — and may not notice before sending.
    setGaps(missingValues(t.body, merged));
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
        <Select
          aria-label="Use a template"
          value={templateId}
          onChange={(e) => {
            setTemplateId(e.target.value);
            apply(e.target.value, listingId);
          }}
        >
          <option value="">Use a template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {humanise(t.key)}
            </option>
          ))}
        </Select>
      )}

      {/* An empty picker is indistinguishable from a broken one, so say why it is
          missing rather than silently omitting it. */}
      {templateId !== "" && listings.length === 0 && gaps.length > 0 && (
        <p className="text-xs text-muted-foreground">
          This template refers to a listing, but there are no active properties to choose
          from yet. Add one under Properties, or edit the message by hand.
        </p>
      )}

      {/* Only worth showing once a template is chosen — otherwise it is a dropdown
          with no visible effect. Changing it re-fills the message. */}
      {templateId !== "" && listings.length > 0 && (
        <Select
          aria-label="About which listing"
          value={listingId}
          onChange={(e) => {
            setListingId(e.target.value);
            apply(templateId, e.target.value);
          }}
        >
          <option value="">About a listing… (optional)</option>
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title} — {l.area} · {formatMYR(l.askingPrice)}
            </option>
          ))}
        </Select>
      )}

      <Textarea
        value={msg}
        onChange={(e) => {
          setMsg(e.target.value);
          // Once the agent edits it themselves, the warning is stale.
          if (gaps.length > 0) setGaps([]);
        }}
        placeholder="Message…"
      />

      {gaps.length > 0 && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          This template expects {gaps.map(readablePlaceholder).join(", ")}, which this
          record does not have. Check the message before sending.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Opens WhatsApp with this message ready — you still press send there.
      </p>
      {error && <FormAlert>{error}</FormAlert>}
      <div className="flex gap-2">
        <Button onClick={send} disabled={pending || !msg}>
          {pending ? "Opening…" : "Open WhatsApp"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

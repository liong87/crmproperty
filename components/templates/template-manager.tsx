"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type TemplateRow,
} from "@/server/templates/actions";
import { PLACEHOLDERS, renderTemplate, placeholdersUsed } from "@/server/templates/render";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

/** Sample values for the live preview — recognisably fake, so nobody mistakes it for real data. */
const PREVIEW = {
  name: "Ali",
  fullName: "Ali bin Hassan",
  agent: "Your name",
  agency: "PropertyAgent CRM",
  property: "Vista Kiara 3-bed",
  price: "RM 850,000",
  area: "Mont Kiara",
};

/**
 * Quick-insert emoji for message bodies.
 *
 * A short curated row, not a full picker: this is a WhatsApp message to a
 * property buyer, and the useful set is small and boring — a greeting, a
 * viewing, a key, a tick. A 1,800-emoji grid would be a component to maintain
 * and a decision to make every time somebody writes a template.
 *
 * Kept deliberately restrained. One or two in a message reads warm; a message
 * built out of them reads like spam, which is the fastest way to have an agency
 * number reported and blocked.
 */
const EMOJI: Array<{ char: string; label: string }> = [
  { char: "👋", label: "Greeting" },
  { char: "🙏", label: "Thanks" },
  { char: "😊", label: "Friendly" },
  { char: "📅", label: "Date" },
  { char: "⏰", label: "Time" },
  { char: "📍", label: "Location" },
  { char: "🏠", label: "Property" },
  { char: "🔑", label: "Keys" },
  { char: "💰", label: "Price" },
  { char: "✅", label: "Confirmed" },
  { char: "📞", label: "Call" },
  { char: "📄", label: "Document" },
];

const BLANK = { key: "", channel: "whatsapp", body: "", active: true };

export function TemplateManager({ initial }: { initial: TemplateRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<TemplateRow | null>(null);
  const [form, setForm] = React.useState<{
    key: string;
    channel: string;
    body: string;
    active: boolean;
  }>(BLANK);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function edit(t: TemplateRow) {
    setEditing(t);
    setForm({ key: t.key, channel: t.channel, body: t.body, active: t.active });
    setError(null);
  }

  function reset() {
    setEditing(null);
    setForm(BLANK);
    setError(null);
  }

  function save() {
    setError(null);
    start(async () => {
      const res = editing
        ? await updateTemplate({ ...form, id: editing.id })
        : await createTemplate(form);
      if (!res.success) return setError(res.error);
      reset();
      router.refresh();
    });
  }

  function remove(id: string) {
    setError(null);
    start(async () => {
      const res = await deleteTemplate(id);
      if (!res.success) return setError(res.error);
      if (editing?.id === id) reset();
      router.refresh();
    });
  }

  const used = placeholdersUsed(form.body);

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">{editing ? `Edit “${editing.key}”` : "New template"}</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="key">Name</Label>
            <Input
              id="key"
              value={form.key}
              placeholder="viewing_confirmation"
              onChange={(e) => setForm({ ...form, key: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Lowercase, underscores instead of spaces.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="channel">Channel</Label>
            <Select
              id="channel"
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="body">Message</Label>
          <Textarea
            id="body"
            className="min-h-28"
            value={form.body}
            placeholder="Hi {{name}} 👋 Confirming our viewing at {{property}} 🏠"
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span>Insert:</span>
            {PLACEHOLDERS.map((p) => (
              <button
                key={p}
                type="button"
                className="rounded bg-secondary px-1.5 py-0.5 font-mono hover:bg-secondary/70"
                onClick={() => setForm((f) => ({ ...f, body: `${f.body}{{${p}}}` }))}
              >
                {`{{${p}}}`}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span>Emoji:</span>
            {EMOJI.map((e) => (
              <button
                key={e.char}
                type="button"
                title={e.label}
                aria-label={`Insert ${e.label} emoji`}
                className="rounded px-1 py-0.5 text-base leading-none hover:bg-secondary"
                onClick={() => setForm((f) => ({ ...f, body: `${f.body}${e.char}` }))}
              >
                {e.char}
              </button>
            ))}
          </div>
          {used.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Uses: {used.join(", ")}. Anything the record cannot fill is left out.
            </p>
          )}
        </div>

        {form.body.trim() !== "" && (
          <div className="rounded-md bg-secondary/50 p-3">
            <p className="text-xs font-medium text-muted-foreground">Preview</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{renderTemplate(form.body, PREVIEW)}</p>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Available to agents
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={save} disabled={pending || !form.key || !form.body}>
            {pending ? "Saving…" : editing ? "Save changes" : "Create template"}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={reset} disabled={pending}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-medium">Templates</h2>
        {initial.length === 0 && (
          <p className="text-sm text-muted-foreground">
            None yet. The first one takes a minute and saves your agents typing it every day.
          </p>
        )}
        <ul className="divide-y rounded-lg border">
          {initial.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t.key}</span>
                  <Badge variant="outline">{t.channel}</Badge>
                  {!t.active && <Badge variant="outline">inactive</Badge>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => edit(t)} disabled={pending}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(t.id)} disabled={pending}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

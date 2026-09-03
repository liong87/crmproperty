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
  agency: "Lanthorn Properties CRM",
  property: "Vista Kiara 3-bed",
  price: "RM 850,000",
  area: "Mont Kiara",
};

/**
 * Quick-insert emoji, grouped.
 *
 * Hand-written rather than an emoji-picker dependency: the whole set below is
 * about 2 KB of strings, where a picker library is hundreds of kilobytes of
 * component plus a sprite sheet or a font — and this Worker has a 10 MB
 * compressed budget for the entire app (see .github/workflows/deploy-cloudflare.yml).
 * Nobody writing a viewing confirmation needs to search 1,800 emoji; they need
 * the twenty that come up in property messages and a few faces.
 *
 * Grouped because a flat grid of ninety is worse than twelve: with headings the
 * eye goes to a section, without them it scans everything every time.
 */
const EMOJI_GROUPS: Array<{ label: string; chars: string[] }> = [
  {
    label: "Greetings & tone",
    chars: ["👋", "🙏", "😊", "🙂", "😄", "🥳", "🤝", "👍", "👌", "💪", "🎉", "✨", "❤️", "🔥", "🙌", "😉"],
  },
  {
    label: "Property",
    chars: ["🏠", "🏡", "🏢", "🏘️", "🔑", "🚪", "🛋️", "🛏️", "🛁", "🚿", "🍳", "🌳", "🏊", "🅿️", "🏗️", "📐"],
  },
  {
    label: "Money & documents",
    chars: ["💰", "💵", "💳", "🏦", "📄", "📝", "✍️", "🧾", "📊", "📈", "📉", "🔖", "📋", "🗂️", "✒️", "💼"],
  },
  {
    label: "Time & place",
    chars: ["📅", "🗓️", "⏰", "⏳", "🕐", "📍", "🗺️", "🚗", "🚇", "🚉", "☀️", "🌙", "⭐", "🌤️", "🧭", "🚦"],
  },
  {
    label: "Contact",
    chars: ["📞", "☎️", "📱", "💬", "📧", "✉️", "📢", "🔔", "📷", "🎥", "🔗", "📎", "🖨️", "💻", "🖥️", "📨"],
  },
  {
    label: "Status",
    chars: ["✅", "❌", "⚠️", "❗", "❓", "🆕", "🔴", "🟢", "🟡", "⏸️", "▶️", "🔄", "🎯", "🏆", "⭕", "☑️"],
  },
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
  const [emojiOpen, setEmojiOpen] = React.useState(false);
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
          <div className="space-y-1.5">
            <button
              type="button"
              aria-expanded={emojiOpen}
              onClick={() => setEmojiOpen((v) => !v)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {emojiOpen ? "Hide emoji" : "Add emoji 😊"}
            </button>

            {emojiOpen && (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border bg-card p-2">
                {EMOJI_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="px-0.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/70">
                      {group.label}
                    </p>
                    <div className="flex flex-wrap gap-0.5">
                      {group.chars.map((char) => (
                        <button
                          key={char}
                          type="button"
                          aria-label={`Insert ${char}`}
                          className="grid h-8 w-8 place-items-center rounded text-lg leading-none hover:bg-secondary"
                          onClick={() => setForm((f) => ({ ...f, body: `${f.body}${char}` }))}
                        >
                          {char}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="px-0.5 pt-1 text-[11px] text-muted-foreground">
                  One or two reads warm. A message built out of emoji is how an agency number gets
                  reported and blocked.
                </p>
              </div>
            )}
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

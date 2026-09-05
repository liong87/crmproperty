"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Upload, Link2, Trash2, Send, EyeOff } from "lucide-react";
import {
  createTopic,
  addChapter,
  setPublished,
  deleteTopic,
  createUploadUrl,
} from "@/server/learning/actions";
import type { TopicCard } from "@/server/learning/queries";
import { cn } from "@/lib/utils";
import { FormAlert } from "@/components/ui/alert";

/**
 * My uploads — a leader's own topics, drafts included.
 *
 * The video for a chapter is either a link or a file, and the file goes STRAIGHT to R2
 * from the browser using a presigned PUT. The bytes never pass through the Worker,
 * which is not a nicety: a Worker's CPU budget cannot receive and re-upload a training
 * video, and attempting it fails after the agent has already waited ten minutes.
 */
export function TopicEditor({ topics }: { topics: TopicCard[] }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function create() {
    setError(null);
    start(async () => {
      const res = await createTopic({ title, summary, category });
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      setTitle("");
      setSummary("");
      setCategory("");
      setCreating(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Your training. Drafts stay hidden from your team until you publish them.
        </p>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New topic
        </button>
      </div>

      {creating && (
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Handling the first call"
                className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Category</span>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Prospecting"
                className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              What will they be able to do after watching?
            </span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder="Open a call confidently and book a viewing without sounding scripted."
              className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={create}
              disabled={pending || !title.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Create draft
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-xl px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          {error && <FormAlert>{error}</FormAlert>}
        </div>
      )}

      {topics.length === 0 && !creating && (
        <p className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          You have not created any training yet. A topic holds one or more chapters, each
          a video with your notes under it.
        </p>
      )}

      {topics.map((t) => (
        <TopicRow key={t.id} topic={t} />
      ))}
    </div>
  );
}

function TopicRow({ topic }: { topic: TopicCard }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  function publish(next: boolean) {
    setError(null);
    start(async () => {
      const res = await setPublished(topic.id, next);
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const res = await deleteTopic(topic.id);
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-base font-semibold">
            {topic.title}
            {!topic.isPublished && (
              <span className="ml-2 rounded-full border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                Draft
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {topic.chapters} {topic.chapters === 1 ? "chapter" : "chapters"}
            {topic.category ? ` · ${topic.category}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-xl border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {open ? "Close" : "Add chapter"}
          </button>
          <button
            type="button"
            onClick={() => publish(!topic.isPublished)}
            disabled={pending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50",
              topic.isPublished
                ? "border text-muted-foreground hover:text-foreground"
                : "bg-primary text-primary-foreground hover:brightness-110",
            )}
          >
            {topic.isPublished ? (
              <>
                <EyeOff className="h-3.5 w-3.5" aria-hidden />
                Unpublish
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" aria-hidden />
                Publish to team
              </>
            )}
          </button>
          {confirming ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="rounded-lg bg-destructive px-2 py-1 text-[11px] font-semibold text-destructive-foreground"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-1.5 text-[11px] text-muted-foreground"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label="Delete this topic"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive-ink"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {open && <ChapterForm topicId={topic.id} onDone={() => setOpen(false)} />}
      {error && <FormAlert className="mt-2">{error}</FormAlert>}
    </div>
  );
}

function ChapterForm({ topicId, onDone }: { topicId: string; onDone: () => void }) {
  const router = useRouter();
  const [kind, setKind] = React.useState<"link" | "file">("link");
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * XMLHttpRequest rather than fetch, for one reason: upload progress.
   *
   * fetch cannot report how far a PUT has got, and a 400 MB video with no progress bar
   * looks identical to a frozen page — people cancel and retry, which is how you get
   * three half-uploaded copies in the bucket.
   */
  function putWithProgress(uploadUrl: string, body: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl, true);
      xhr.setRequestHeader("content-type", body.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload failed (${xhr.status}).`));
      xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
      xhr.send(body);
    });
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      let videoUrlOrKey = url.trim();

      if (kind === "file") {
        if (!file) throw new Error("Choose a video file first.");
        const signed = await createUploadUrl(topicId, file.name, file.type || "video/mp4");
        if (!signed.success) throw new Error(signed.error ?? "Could not start the upload.");
        setProgress(0);
        await putWithProgress(signed.data.uploadUrl, file);
        videoUrlOrKey = signed.data.key;
      }

      const res = await addChapter(topicId, {
        title,
        videoKind: kind,
        videoUrlOrKey,
        notes,
      });
      if (!res.success) throw new Error(res.error ?? "Could not save the chapter.");

      setTitle("");
      setUrl("");
      setNotes("");
      setFile(null);
      setProgress(null);
      onDone();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      <div className="flex gap-2">
        {(["link", "file"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
              kind === k
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {k === "link" ? <Link2 className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
            {k === "link" ? "YouTube / Vimeo link" : "Upload a file"}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Chapter title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Opening the call"
          className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary"
        />
      </label>

      {kind === "link" ? (
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Video link</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtu.be/…"
            className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary"
          />
        </label>
      ) : (
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Video file</span>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Uploads straight to storage from your browser — it never passes through the CRM,
            so a long video is fine.
          </span>
        </label>
      )}

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Notes for your team</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="The three questions to ask before offering a viewing…"
          className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>

      {progress !== null && (
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Uploading… {progress}%</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !title.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          Add chapter
        </button>
        {error && <FormAlert>{error}</FormAlert>}
      </div>
    </div>
  );
}

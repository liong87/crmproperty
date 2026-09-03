"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Paperclip, Loader2, Download } from "lucide-react";
import { markWatched, attachmentUrl } from "@/server/learning/actions";
import { cn } from "@/lib/utils";
import type { TopicDetail } from "@/server/learning/queries";

/**
 * Turn a YouTube or Vimeo watch link into something an iframe can play.
 *
 * Pasting the address bar URL is what everybody actually does, and youtube.com/watch
 * refuses to render in a frame — the agent sees a grey box and concludes the CRM is
 * broken. Anything unrecognised is returned untouched and rendered as a link instead of
 * being embedded, because a silent grey box is the worst of the three outcomes.
 */
export function embedUrl(raw: string): { kind: "iframe" | "video" | "link"; url: string } {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return { kind: "iframe", url: `https://www.youtube.com/embed${u.pathname}` };
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return { kind: "iframe", url: `https://www.youtube.com/embed/${v}` };
      if (u.pathname.startsWith("/embed/")) return { kind: "iframe", url: raw };
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return { kind: "iframe", url: `https://player.vimeo.com/video/${id}` };
    }
    if (host === "player.vimeo.com") return { kind: "iframe", url: raw };
  } catch {
    /* not a URL we can parse */
  }
  return { kind: "link", url: raw };
}

export function TopicPlayer({ topic }: { topic: TopicDetail }) {
  const router = useRouter();
  const [current, setCurrent] = React.useState(0);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const chapter = topic.chapters[current];
  if (!chapter) {
    return (
      <p className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
        This topic has no chapters yet. {topic.canEdit ? "Add one from My uploads." : "Your team leader is still putting it together."}
      </p>
    );
  }

  const media =
    chapter.videoKind === "file"
      ? ({ kind: "video", url: chapter.videoUrl } as const)
      : embedUrl(chapter.videoUrl);

  function toggleWatched() {
    setError(null);
    start(async () => {
      const res = await markWatched(chapter!.id, !chapter!.watched);
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  function openAttachment(id: string) {
    setError(null);
    start(async () => {
      const res = await attachmentUrl(id);
      if (!res.success) return setError(res.error ?? "Could not open that file.");
      // A signed URL, minted now and short-lived. Never stored, never shared.
      window.open(res.data.url, "_blank", "noopener");
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl border bg-black">
          {media.kind === "video" ? (
            <video src={media.url} controls className="aspect-video w-full" />
          ) : media.kind === "iframe" ? (
            <iframe
              src={media.url}
              title={chapter.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
              className="aspect-video w-full"
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-muted p-6 text-center">
              <a
                href={media.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium underline underline-offset-4"
              >
                Open this video in a new tab
              </a>
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold">{chapter.title}</h2>
              <p className="text-xs text-muted-foreground">
                Chapter {current + 1} of {topic.chapters.length}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleWatched}
              disabled={pending}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition disabled:opacity-50",
                chapter.watched
                  ? "border text-muted-foreground hover:text-foreground"
                  : "bg-primary text-primary-foreground hover:brightness-110",
              )}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : chapter.watched ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              ) : null}
              {chapter.watched ? "Watched" : "Mark as watched"}
            </button>
          </div>

          {chapter.notes && (
            <div className="mt-3 border-t pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Notes from {topic.ownerName}
              </p>
              {/* whitespace-pre-wrap so a leader's line breaks survive — they write
                  these as scripts and lists, not as prose. */}
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{chapter.notes}</p>
            </div>
          )}

          {chapter.attachments.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5" aria-hidden />
                Files
              </p>
              <ul className="mt-1.5 space-y-1">
                {chapter.attachments.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => openAttachment(a.id)}
                      disabled={pending}
                      className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4 hover:text-primary"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      {a.filename}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      </div>

      <aside className="rounded-2xl border bg-card p-4">
        <p className="text-sm font-semibold">Chapters</p>
        <ol className="mt-2 space-y-1">
          {topic.chapters.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setCurrent(i)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition",
                  i === current ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                )}
              >
                {c.watched ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{c.title}</span>
                  {c.attachments.length > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      {c.attachments.length} file{c.attachments.length === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

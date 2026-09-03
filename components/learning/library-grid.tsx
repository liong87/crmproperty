import Link from "next/link";
import { PlayCircle, FileVideo, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TopicCard } from "@/server/learning/queries";

/** "1h 12m", "8m", or null when no chapter reported a duration. */
export function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * The library: every topic this person may watch.
 *
 * The progress bar is per-viewer, not per-team — an agent opening this wants to know
 * what THEY still owe, and a team average here would be a number about somebody else.
 */
export function LibraryGrid({
  topics,
  emptyHint,
}: {
  topics: TopicCard[];
  emptyHint: string;
}) {
  if (topics.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
        {emptyHint}
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {topics.map((t) => {
        const duration = formatDuration(t.durationSeconds);
        const done = t.progress === 1;
        return (
          <Link
            key={t.id}
            href={`/learning/${t.id}`}
            className="group flex flex-col rounded-2xl border bg-card p-4 transition hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <PlayCircle className="h-4.5 w-4.5 text-primary" aria-hidden />
              </span>
              {!t.isPublished && (
                <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Draft
                </span>
              )}
              {done && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Done
                </span>
              )}
            </div>

            <h3 className="mt-3 font-display text-base font-semibold leading-snug">{t.title}</h3>
            {t.summary && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.summary}</p>
            )}

            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileVideo className="h-3.5 w-3.5" aria-hidden />
                {t.chapters} {t.chapters === 1 ? "chapter" : "chapters"}
              </span>
              {duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {duration}
                </span>
              )}
              <span>by {t.ownerName}</span>
            </p>

            <div className="mt-auto pt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    done ? "bg-emerald-500" : "bg-primary",
                  )}
                  style={{ width: `${Math.round((t.progress ?? 0) * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {t.chapters === 0
                  ? "No chapters yet"
                  : `${t.watched} of ${t.chapters} watched`}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

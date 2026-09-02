"use client";
/**
 * Learning Hub, as an agent or Team Lead sees it.
 *
 * Read-only for agents by design, same split as the sales kit
 * (components/project-resources/sales-kit.tsx): a Team Lead uploads and publishes,
 * their downline watches. The server has already applied the one-level-upline
 * visibility rule (server/learning/access.ts) — this component only renders what it
 * was handed and never re-derives who may see what.
 *
 * A topic is a container of CHAPTERS, each its own uploaded video — "Closing
 * Masterclass" is a topic, "Handling objections" and "No-shows" are its chapters.
 * Every action calls `router.refresh()` on success rather than patching local
 * state, so what a Team Lead sees after publishing is always the server's own
 * answer to "who can watch this now", not a client-side guess that could drift.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  createTopic, updateTopic, publishTopic, unpublishTopic, removeTopic,
  createChapterUploadUrl, confirmChapterUpload, removeChapter, getChapterVideoUrl,
} from "@/server/learning/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { BookOpen, Search, Play, Upload, Plus, X } from "lucide-react";

export interface LearningChapterView {
  id: string;
  title: string;
  hasVideo: boolean;
  filename: string | null;
  size: number | null;
}

export interface LearningTopicView {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  uploaderUserId: string;
  uploaderName: string;
  chapters: LearningChapterView[];
}

function formatSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  const mb = bytes / (1024 * 1024);
  return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(2)} GB`;
}

export function LearningHub({
  meId, canUpload, myUploads, topics,
}: {
  meId: string;
  canUpload: boolean;
  myUploads: number;
  topics: LearningTopicView[];
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const [playingChapterId, setPlayingChapterId] = React.useState<string | null>(null);
  const [videoUrl, setVideoUrl] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        t.chapters.some((c) => c.title.toLowerCase().includes(q)),
    );
  }, [topics, query]);

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      try {
        const res = await fn();
        if (!res.success) return setError(res.error ?? "Something went wrong.");
        router.refresh();
      } catch (err) {
        // Anything that THROWS inside a transition takes the whole page down through
        // the error boundary — never let one video's failure do that.
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  async function watch(chapterId: string) {
    setError(null);
    if (playingChapterId === chapterId) {
      setPlayingChapterId(null);
      setVideoUrl(null);
      return;
    }
    const res = await getChapterVideoUrl(chapterId);
    if (!res.success) return setError(res.error);
    setPlayingChapterId(chapterId);
    setVideoUrl(res.data.url);
  }

  const totalChapters = topics.reduce((n, t) => n + t.chapters.length, 0);

  return (
    <div className="space-y-5">
      <PageTitle
        title="Learning Hub"
        count={topics.length}
        actions={
          <div className="flex items-center gap-2">
            {canUpload && (
              <Badge variant="secondary" className="whitespace-nowrap">
                My Uploads {myUploads}
              </Badge>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 w-56 pl-8"
                placeholder="Search topics or chapters…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        }
      >
        {topics.length === 1 ? "topic" : "topics"} · {totalChapters} {totalChapters === 1 ? "video" : "videos"} ready to watch.
      </PageTitle>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {canUpload && <CreateTopic onDone={() => router.refresh()} setError={setError} />}

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nothing to watch yet"
          hint="Topics you upload, and topics your upline or collaborators share, show up here ready to watch."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => {
            const mine = t.uploaderUserId === meId;
            return (
              <TopicCard
                key={t.id}
                topic={t}
                mine={mine}
                pending={pending}
                playingChapterId={playingChapterId}
                videoUrl={videoUrl}
                onWatch={watch}
                onRun={run}
                onDone={() => router.refresh()}
                setError={setError}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopicCard({
  topic, mine, pending, playingChapterId, videoUrl, onWatch, onRun, onDone, setError,
}: {
  topic: LearningTopicView;
  mine: boolean;
  pending: boolean;
  playingChapterId: string | null;
  videoUrl: string | null;
  onWatch: (chapterId: string) => void;
  onRun: (fn: () => Promise<{ success: boolean; error?: string }>) => void;
  onDone: () => void;
  setError: (e: string | null) => void;
}) {
  const [addingChapter, setAddingChapter] = React.useState(false);
  const hasAnyVideo = topic.chapters.some((c) => c.hasVideo);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{topic.title}</p>
              {mine && (
                <Badge variant={topic.status === "published" ? "secondary" : "outline"}>
                  {topic.status === "published" ? "Published" : "Draft"}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {topic.chapters.length} {topic.chapters.length === 1 ? "chapter" : "chapters"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{mine ? "You" : topic.uploaderName}</p>
            {topic.description && (
              <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">{topic.description}</p>
            )}
          </div>

          {mine && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {topic.status === "published" ? (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => onRun(() => unpublishTopic(topic.id))}>
                  Unpublish
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending || !hasAnyVideo}
                  title={hasAnyVideo ? undefined : "Add a chapter with a video before publishing"}
                  onClick={() => onRun(() => publishTopic(topic.id))}
                >
                  Publish
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => onRun(() => removeTopic(topic.id))}>
                Remove
              </Button>
            </div>
          )}
        </div>

        {topic.chapters.length > 0 && (
          <ul className="space-y-2 border-t pt-3">
            {topic.chapters.map((c) => (
              <li key={c.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.hasVideo ? c.filename : "No video attached"}
                      {formatSize(c.size) ? ` · ${formatSize(c.size)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.hasVideo && (
                      <Button size="sm" variant="outline" onClick={() => onWatch(c.id)}>
                        <Play className="mr-1.5 h-3.5 w-3.5" />
                        {playingChapterId === c.id ? "Hide" : "Watch"}
                      </Button>
                    )}
                    {mine && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => onRun(() => removeChapter(c.id))}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                {playingChapterId === c.id && videoUrl && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    key={videoUrl}
                    src={videoUrl}
                    controls
                    className="mt-2 w-full rounded-lg bg-black"
                    style={{ maxHeight: 480 }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {mine && !addingChapter && (
          <Button size="sm" variant="outline" onClick={() => setAddingChapter(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add a chapter
          </Button>
        )}

        {mine && addingChapter && (
          <AddChapter
            topicId={topic.id}
            onDone={() => {
              setAddingChapter(false);
              onDone();
            }}
            onCancel={() => setAddingChapter(false)}
            setError={setError}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** Create the topic shell. Chapters are added to it afterward, once it exists. */
function CreateTopic({ onDone, setError }: { onDone: () => void; setError: (e: string | null) => void }) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");

  async function save() {
    if (!title.trim()) return setError("Give the topic a title first.");
    setError(null);
    setSaving(true);
    try {
      const res = await createTopic({ title, description: description.trim() || null });
      if (!res.success) return setError(res.error);
      setTitle("");
      setDescription("");
      setOpen(false);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        New topic
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Topic title</Label>
          <Input
            className="h-9 max-w-md"
            placeholder="Closing Masterclass"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Description (optional)</Label>
          <Textarea
            className="max-w-xl"
            rows={2}
            placeholder="What this covers and who it's for."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Create the topic first, then add one or more video chapters to it below.
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={saving || !title.trim()} onClick={save}>
            Create topic
          </Button>
          <Button size="sm" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Direct-to-storage upload for one chapter: create the chapter row, mint a
 * presigned PUT, send the bytes straight to R2, then tell the server what landed.
 */
function AddChapter({
  topicId, onDone, onCancel, setError,
}: {
  topicId: string;
  onDone: () => void;
  onCancel: () => void;
  setError: (e: string | null) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [title, setTitle] = React.useState("");

  async function upload(file: File) {
    if (!title.trim()) return setError("Give the chapter a title first.");
    if (!file.type) {
      return setError("Your browser did not report a type for that file. Rename it with a proper extension and try again.");
    }

    setError(null);
    setUploading(true);
    try {
      const started = await createChapterUploadUrl({
        topicId, title, filename: file.name, contentType: file.type, size: file.size,
      });
      if (!started.success) return setError(started.error);

      let put: Response;
      try {
        put = await fetch(started.data.url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
      } catch {
        // A CORS rejection does not come back as a failed response — fetch THROWS a
        // TypeError, and the browser withholds the reason. In practice this is
        // always the bucket's CORS rule on a first upload.
        return setError(
          "Could not reach object storage. The bucket needs a CORS rule allowing PUT from this site.",
        );
      }
      if (!put.ok) return setError(`Storage rejected the upload (${put.status}).`);

      const confirmed = await confirmChapterUpload({
        chapterId: started.data.chapterId, key: started.data.key, filename: file.name, contentType: file.type, size: file.size,
      });
      if (!confirmed.success) return setError(confirmed.error);

      setTitle("");
      onDone();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Chapter title</Label>
        <Input
          className="h-9 max-w-md"
          placeholder="Handling objections on price"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={uploading}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className={uploading ? "pointer-events-none opacity-50" : "cursor-pointer"}>
          <span className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-secondary">
            {uploading ? "Uploading…" : "Choose video"}
          </span>
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
        </label>
        <Button size="sm" variant="ghost" disabled={uploading} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

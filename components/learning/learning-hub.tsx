"use client";
/**
 * Learning Hub, as an agent or Team Lead sees it.
 *
 * Read-only for agents by design, same split as the sales kit
 * (components/project-resources/sales-kit.tsx): a Team Lead uploads and publishes,
 * their downline watches. The server has already applied the one-level-upline
 * visibility rule (server/learning/access.ts) — this component only renders what it
 * was handed and never re-derives who may see what. Every action calls
 * `router.refresh()` on success rather than patching local state, so what a Team
 * Lead sees after publishing is always the server's own answer to "who can watch
 * this now", not a client-side guess that could drift from it.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  createTopicUploadUrl, confirmTopicUpload, publishTopic, unpublishTopic,
  removeTopic, getTopicVideoUrl,
} from "@/server/learning/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { BookOpen, Search, Play, Upload } from "lucide-react";

export interface LearningTopicView {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  uploaderUserId: string;
  uploaderName: string;
  hasVideo: boolean;
  filename: string | null;
  size: number | null;
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
  const [playingId, setPlayingId] = React.useState<string | null>(null);
  const [videoUrl, setVideoUrl] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(
      (t) => t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q),
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

  async function watch(id: string) {
    setError(null);
    if (playingId === id) {
      setPlayingId(null);
      setVideoUrl(null);
      return;
    }
    const res = await getTopicVideoUrl(id);
    if (!res.success) return setError(res.error);
    setPlayingId(id);
    setVideoUrl(res.data.url);
  }

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
                placeholder="Search topics…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        }
      >
        {topics.length === 1 ? "topic" : "topics"} ready to watch.
      </PageTitle>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {canUpload && <UploadTopic onDone={() => router.refresh()} setError={setError} />}

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
              <Card key={t.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{t.title}</p>
                        {mine && (
                          <Badge variant={t.status === "published" ? "secondary" : "outline"}>
                            {t.status === "published" ? "Published" : "Draft"}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {mine ? "You" : t.uploaderName}
                        {t.filename ? ` · ${t.filename}` : ""}
                        {formatSize(t.size) ? ` · ${formatSize(t.size)}` : ""}
                      </p>
                      {t.description && (
                        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">{t.description}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {t.hasVideo && (
                        <Button size="sm" variant="outline" onClick={() => watch(t.id)}>
                          <Play className="mr-1.5 h-3.5 w-3.5" />
                          {playingId === t.id ? "Hide" : "Watch"}
                        </Button>
                      )}
                      {mine && (
                        <>
                          {t.status === "published" ? (
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => unpublishTopic(t.id))}>
                              Unpublish
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending || !t.hasVideo}
                              title={t.hasVideo ? undefined : "Attach a video before publishing"}
                              onClick={() => run(() => publishTopic(t.id))}
                            >
                              Publish
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeTopic(t.id))}>
                            Remove
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {playingId === t.id && videoUrl && (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      key={videoUrl}
                      src={videoUrl}
                      controls
                      className="w-full rounded-lg bg-black"
                      style={{ maxHeight: 480 }}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Direct-to-storage upload, same shape as the sales kit: create the draft row, mint
 * a presigned PUT, send the bytes straight to R2, then tell the server what landed.
 */
function UploadTopic({
  onDone, setError,
}: {
  onDone: () => void;
  setError: (e: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [publishNow, setPublishNow] = React.useState(true);

  async function upload(file: File) {
    if (!title.trim()) return setError("Give the topic a title first.");
    if (!file.type) {
      return setError("Your browser did not report a type for that file. Rename it with a proper extension and try again.");
    }

    setError(null);
    setUploading(true);
    try {
      const started = await createTopicUploadUrl({
        title, description: description.trim() || null, filename: file.name, contentType: file.type, size: file.size,
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

      const confirmed = await confirmTopicUpload({
        id: started.data.id, key: started.data.key, filename: file.name, contentType: file.type, size: file.size,
      });
      if (!confirmed.success) return setError(confirmed.error);

      if (publishNow) {
        const published = await publishTopic(started.data.id);
        if (!published.success) return setError(published.error);
      }

      setTitle("");
      setDescription("");
      setOpen(false);
      onDone();
    } finally {
      setUploading(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        Upload a video
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Title</Label>
          <Input
            className="h-9 max-w-md"
            placeholder="Handling objections on price"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={uploading}
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
            disabled={uploading}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={publishNow}
            onChange={(e) => setPublishNow(e.target.checked)}
            disabled={uploading}
          />
          Publish immediately (otherwise it saves as a draft only you can see)
        </label>
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
          <Button size="sm" variant="ghost" disabled={uploading} onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentDbUser } from "@/lib/auth";
import { PageTitle } from "@/components/ui/page-title";
import { TopicPlayer } from "@/components/learning/player";
import { WhoWatched } from "@/components/learning/team-progress";
import { getTopic, whoHasWatched } from "@/server/learning/queries";
import { TopicNotFoundError } from "@/server/learning/access";

export default async function TopicPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  const { topicId } = await params;

  try {
    const topic = await getTopic(me, topicId);
    // Empty for anyone who is not the owner, so the panel simply does not render.
    const watchers = await whoHasWatched(me, topicId);

    return (
      <div className="space-y-5">
        <Link
          href="/learning"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Learning hub
        </Link>

        <PageTitle title={topic.title} count={topic.chapters.length}>
          {topic.chapters.length === 1 ? "chapter" : "chapters"}
          {topic.category ? ` · ${topic.category}` : ""} · by {topic.ownerName}
          {!topic.isPublished && " · draft, not visible to your team"}
        </PageTitle>

        {topic.summary && <p className="max-w-prose text-sm text-muted-foreground">{topic.summary}</p>}

        <TopicPlayer topic={topic} />

        {watchers.length > 0 && <WhoWatched rows={watchers} />}
      </div>
    );
  } catch (err) {
    // A topic belonging to another team is NOT FOUND, never forbidden — a 403 would
    // confirm it exists and belongs to somebody.
    if (err instanceof TopicNotFoundError) notFound();
    throw err;
  }
}

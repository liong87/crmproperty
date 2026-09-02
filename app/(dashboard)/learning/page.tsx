import { redirect } from "next/navigation";
import { getCurrentDbUser } from "@/lib/auth";
import { listVisibleTopics, countMyUploads, canUploadLearning } from "@/server/learning/access";
import { LearningHub } from "@/components/learning/learning-hub";

/**
 * Learning Hub — training videos, grouped into topics with one or more chapters,
 * a Team Lead shares with their own downline.
 *
 * All the visibility logic lives in server/learning/access.ts; this page only calls
 * it and hands the result to the client component that renders the list and (for a
 * Team Lead or admin) the upload form.
 */
export default async function LearningPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  const [topics, myUploads] = await Promise.all([listVisibleTopics(), countMyUploads(me)]);

  return (
    <LearningHub
      meId={me.id}
      canUpload={canUploadLearning(me)}
      myUploads={myUploads}
      topics={topics.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        uploaderUserId: t.uploaderUserId,
        uploaderName: t.uploaderName,
        chapters: t.chapters.map((c) => ({
          id: c.id,
          title: c.title,
          hasVideo: c.documentId !== null,
          filename: c.filename,
          size: c.size,
        })),
      }))}
    />
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { getCurrentDbUser } from "@/lib/auth";
import { PageTitle } from "@/components/ui/page-title";
import { LibraryGrid } from "@/components/learning/library-grid";
import { TopicEditor } from "@/components/learning/topic-editor";
import { TeamProgressTable } from "@/components/learning/team-progress";
import { listLibrary, listMyTopics, getTeamProgress } from "@/server/learning/queries";
import { canOwnTopics } from "@/server/learning/access";
import { cn } from "@/lib/utils";

/**
 * Learning Hub.
 *
 * One page, three tabs, because they are three views of the same material rather than
 * three features: what I must watch, what I teach, and who has watched it.
 *
 * Only the visible tab's data is fetched — the same lesson the report page learned the
 * hard way when it built both tabs on every request and blew the Worker's CPU budget.
 */
export default async function LearningPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  const leader = canOwnTopics(me);
  const requested = (await searchParams).tab;
  const tab = leader && (requested === "uploads" || requested === "progress") ? requested : "library";

  const library = tab === "library" ? await listLibrary(me) : [];
  const mine = tab === "uploads" ? await listMyTopics(me) : [];
  const progress = tab === "progress" ? await getTeamProgress(me) : null;

  const TABS = [
    { key: "library", label: "Library" },
    ...(leader
      ? [
          { key: "uploads", label: "My uploads" },
          { key: "progress", label: "Team progress" },
        ]
      : []),
  ] as const;

  return (
    <div className="space-y-5">
      <PageTitle title="Learning hub" count={tab === "library" ? library.length : undefined}>
        {tab === "library"
          ? `${library.length === 1 ? "topic" : "topics"} to learn from.`
          : "Training your team learns from."}
      </PageTitle>

      {TABS.length > 1 && (
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "library" ? "/learning" : `/learning?tab=${t.key}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "flex h-[30px] items-center rounded-lg px-3 text-[13px] font-semibold transition",
                tab === t.key
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}

      {tab === "library" && (
        <LibraryGrid
          topics={library}
          emptyHint={
            leader
              ? "Nothing published yet. Create a topic under My uploads, add a chapter, then publish it to your team."
              : "No training yet. Topics appear here when your team leader publishes them — you will see a progress bar on each one as you work through it."
          }
        />
      )}

      {tab === "uploads" && <TopicEditor topics={mine} />}

      {tab === "progress" && progress && <TeamProgressTable data={progress} />}

      {tab === "library" && library.length === 0 && !leader && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <GraduationCap className="h-3.5 w-3.5" aria-hidden />
          Marking a chapter watched is how your leader sees you have covered it.
        </p>
      )}
    </div>
  );
}

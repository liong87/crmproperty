import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDbUser } from "@/lib/auth";
import { getBoard, countOrphanedDeals, type DealPipeline } from "@/server/deals/queries";
import { DealCard } from "@/components/deals/deal-card";
import { formatMYR, cn } from "@/lib/utils";

/**
 * The deal board.
 *
 * Two pipelines, because a new-launch deal and a resale deal do not pass through the
 * same columns. The project pipeline starts at **Booked** — everything before that is
 * the appointment board's job, and repeating those steps here would count the same
 * event in two places and let the funnel and the pipeline disagree.
 */
export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ pipeline?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const sp = await searchParams;
  const pipeline: DealPipeline = sp.pipeline === "resale" ? "resale" : "project";

  const [board, orphaned] = await Promise.all([getBoard(me, pipeline), countOrphanedDeals(me)]);
  const empty = board.every((c) => c.cards.length === 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Pipeline</h1>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          <Tab href="/pipeline" label="New launch" active={pipeline === "project"} />
          <Tab href="/pipeline?pipeline=resale" label="Resale" active={pipeline === "resale"} />
        </div>
      </div>

      {board.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No stages configured for this pipeline. Run <code className="font-mono text-xs">pnpm db:migrate</code> to seed them.
        </p>
      ) : (
        <>
          {empty && (
            <p className="text-sm text-muted-foreground">
              {pipeline === "project"
                ? "No booked units yet. A project deal is created once a client books — the steps before that live on the appointment board."
                : "No resale deals yet."}
            </p>
          )}

          {/* Mobile-first: horizontal scroll of stage columns. */}
          <div className="flex gap-3 overflow-x-auto pb-4">
            {board.map((col) => {
              const total = col.cards.reduce((s, c) => s + (c.value ?? 0), 0);
              const stages = board.map((c) => ({ id: c.stage.id, name: c.stage.name }));
              return (
                <div key={col.stage.id} className="w-64 shrink-0 rounded-lg bg-muted/40 p-2">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-sm font-medium">{col.stage.name}</span>
                    <span className="text-xs text-muted-foreground tnum">{col.cards.length}</span>
                  </div>
                  <div className="mb-2 px-1 text-xs text-muted-foreground tnum">{formatMYR(total)}</div>
                  <div className="space-y-2">
                    {col.cards.map((card) => <DealCard key={card.id} card={card} stages={stages} />)}
                    {col.cards.length === 0 && (
                      <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                        Empty
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {orphaned > 0 && (
        <p className="text-xs text-muted-foreground">
          {orphaned} {orphaned === 1 ? "deal is" : "deals are"} in a stage that no longer exists and
          appear on neither board. A manager can move {orphaned === 1 ? "it" : "them"} from the contact.
        </p>
      )}
    </div>
  );
}

function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

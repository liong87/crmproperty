import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDbUser } from "@/lib/auth";
import { getBoard, countOrphanedDeals, type DealPipeline } from "@/server/deals/queries";
import { DealCard } from "@/components/deals/deal-card";
import { PageTitle } from "@/components/ui/page-title";
import { formatMYR, cn } from "@/lib/utils";

/**
 * The deal board.
 *
 * Two pipelines, because a new-launch deal and a resale deal do not pass through the
 * same columns. The project pipeline starts at **Booked** — everything before that is
 * the appointment board's job, and repeating those steps here would count the same
 * event in two places and let the funnel and the pipeline disagree.
 *
 * ONE noun for the record: a **deal**. Pipeline is the board it sits on and Paperwork is
 * one section of the deal's own page, so neither is the thing itself. Card links,
 * controls and empty states all say "deal" now; before, the same object was called
 * three things on one screen.
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
  const dealCount = board.reduce((s, c) => s + c.cards.length, 0);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Pipeline"
        count={dealCount}
        actions={
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
            <Tab href="/pipeline" label="New launch" active={pipeline === "project"} />
            <Tab href="/pipeline?pipeline=resale" label="Resale" active={pipeline === "resale"} />
          </div>
        }
      >
        {dealCount === 1 ? "deal on this board." : "deals on this board."}
      </PageTitle>

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

          {/* Mobile-first: horizontal scroll of stage columns. The strip is a named,
              focusable region because a five-column board runs off every phone, and a
              scroll container with no tab stop is unreachable without a pointer. */}
          <div
            role="region"
            aria-label={`${pipeline === "project" ? "New launch" : "Resale"} deal board`}
            tabIndex={0}
            className="flex gap-3 overflow-x-auto pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {board.map((col) => {
              const total = col.cards.reduce((s, c) => s + (c.value ?? 0), 0);
              const stages = board.map((c) => ({ id: c.stage.id, name: c.stage.name }));
              return (
                <div key={col.stage.id} className="w-64 shrink-0 rounded-lg bg-muted/40 p-2">
                  <div className="mb-2 flex items-center justify-between px-1">
                    {/* A real heading, not a styled span: the columns ARE the structure
                        of this page, and a heading list with only "Pipeline" in it is no
                        use to anyone navigating by heading. */}
                    <h2 className="text-sm font-medium">{col.stage.name}</h2>
                    <span className="text-xs text-muted-foreground tnum">{col.cards.length}</span>
                  </div>
                  <div className="mb-2 px-1 text-xs text-muted-foreground tnum">{formatMYR(total)}</div>
                  <div className="space-y-2">
                    {col.cards.map((card) => (
                      <DealCard key={card.id} card={card} stages={stages} stageName={col.stage.name} />
                    ))}
                    {col.cards.length === 0 && (
                      /* Named, because five columns of the bare word "Empty" tell a
                         screen-reader user nothing about which stage is empty. */
                      <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                        No deals in {col.stage.name}
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
          appear on neither board. A team lead can move {orphaned === 1 ? "it" : "them"} from the contact.
        </p>
      )}
    </div>
  );
}

function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

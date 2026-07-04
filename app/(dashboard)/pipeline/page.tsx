import { redirect } from "next/navigation";
import { getCurrentDbUser } from "@/lib/auth";
import { getBoard } from "@/server/deals/queries";
import { DealCard } from "@/components/deals/deal-card";
import { formatMYR } from "@/lib/utils";

export default async function PipelinePage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const board = await getBoard(me);
  const stages = board.map((c) => ({ id: c.stage.id, name: c.stage.name }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Pipeline</h1>
      {/* Mobile-first: horizontal scroll of stage columns. */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {board.map((col) => {
          const total = col.cards.reduce((s, c) => s + (c.value ?? 0), 0);
          return (
            <div key={col.stage.id} className="w-64 shrink-0 rounded-lg bg-muted/40 p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium">{col.stage.name}</span>
                <span className="text-xs text-muted-foreground">{col.cards.length}</span>
              </div>
              <div className="mb-2 px-1 text-xs text-muted-foreground">{formatMYR(total)}</div>
              <div className="space-y-2">
                {col.cards.map((card) => <DealCard key={card.id} card={card} stages={stages} />)}
                {col.cards.length === 0 && <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">Empty</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

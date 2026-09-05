import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { TeamProgressData } from "@/server/learning/queries";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/**
 * Every agent against every published topic.
 *
 * Drafts are excluded upstream on purpose: reporting somebody as 0% on training they
 * were never shown is a number a manager would act on, and it would be wrong.
 */
export function TeamProgressTable({ data }: { data: TeamProgressData }) {
  if (data.rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
        {data.topics.length === 0
          ? "Publish a topic and it will appear here, with a column per agent."
          : "Nobody reports to you yet. Assign agents to your team on the My team page and their progress shows up here."}
      </p>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-sm font-semibold">Team progress</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Share of chapters each agent has marked as watched. A blank column is a topic with
        no chapters yet.
      </p>
      <Table label="Team progress by topic">
        <THead>
          <TR>
            <TH>Agent</TH>
            {data.topics.map((t) => (
              <TH key={t.id} className="text-right">
                {t.title}
              </TH>
            ))}
            <TH className="text-right">Overall</TH>
          </TR>
        </THead>
        <TBody>
          {data.rows.map((r) => (
            <TR key={r.agentId}>
              <TD className="font-medium">{r.name}</TD>
              {data.topics.map((t) => (
                <TD key={t.id} className="text-right tabular-nums">
                  {pct(r.byTopic[t.id] ?? null)}
                </TD>
              ))}
              {/* Only a completely untouched agent is called out. A partial score is
                  normal progress, and colouring it would cry wolf every week. */}
              <TD
                className={cn(
                  "text-right font-medium tabular-nums",
                  r.overall === 0 ? "text-destructive-ink" : r.overall === 1 ? "text-emerald-600" : "",
                )}
              >
                {pct(r.overall)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

/** Who has watched this one topic — shown to its owner on the topic page. */
export function WhoWatched({ rows }: { rows: { name: string; watched: number; total: number }[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-sm font-semibold">Who has watched</p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate">{r.name}</span>
            <span
              className={cn(
                "shrink-0 tabular-nums",
                r.watched === 0 ? "text-destructive-ink" : r.watched === r.total ? "text-emerald-600" : "text-muted-foreground",
              )}
            >
              {r.watched} / {r.total}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

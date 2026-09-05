import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import type { BySourceData, SourceRow } from "@/server/reports/by-source";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/**
 * Leads by source, expandable to campaign › ad set › ad.
 *
 * Uses `<details>` rather than React state so it needs no JavaScript and, more
 * usefully here, so an expanded row still expands on a printed page — a client-side
 * accordion prints collapsed and silently drops the detail somebody expanded on
 * purpose before hitting print.
 */
export function SourceTable({ data }: { data: BySourceData }) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle>Leads by source</CardTitle>
        <p className="text-sm text-muted-foreground">
          Which channel produces deals, not just leads. Click a source to see its campaigns,
          ad sets and ads.
          {data.unattributed > 0 && (
            <>
              {" "}
              <strong className="font-semibold text-foreground">{data.unattributed}</strong>{" "}
              {data.unattributed === 1 ? "lead carries" : "leads carry"} no source at all — those
              rows can be counted but not explained.
            </>
          )}
        </p>
      </CardHeader>
      <CardContent>
        {data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No leads in this window. Sources appear here as soon as leads arrive from a form,
            a campaign or a walk-in.
          </p>
        ) : (
          <Table label="Leads by source">
            <THead>
              <TR>
                <TH>Source</TH>
                <TH className="text-right">Leads</TH>
                <TH className="text-right">Appts</TH>
                <TH className="text-right">Showed</TH>
                <TH className="text-right">Booked</TH>
                <TH className="text-right">Converted</TH>
                <TH className="text-right">Conv. rate</TH>
              </TR>
            </THead>
            <TBody>
              {data.rows.map((row) => (
                <SourceRows key={row.key} row={row} />
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function Cells({ row }: { row: SourceRow }) {
  return (
    <>
      <TD className="text-right tabular-nums">{row.leads}</TD>
      <TD className="text-right tabular-nums">{row.appointments}</TD>
      <TD className="text-right tabular-nums">{row.showedUp}</TD>
      <TD className="text-right tabular-nums">{row.booked}</TD>
      <TD className="text-right tabular-nums">{row.converted}</TD>
      <TD className="text-right tabular-nums font-medium">{pct(row.conversionRate)}</TD>
    </>
  );
}

function SourceRows({ row }: { row: SourceRow }) {
  const children = row.children ?? [];
  return (
    <>
      <TR>
        <TD className="font-medium">
          {children.length === 0 ? (
            row.label
          ) : (
            <details>
              <summary className="cursor-pointer list-none">
                <span className="mr-1.5 text-muted-foreground">▸</span>
                {row.label}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {children.length} {children.length === 1 ? "campaign" : "campaigns"}
                </span>
              </summary>
              <ul className="mt-1.5 space-y-1 pl-4 text-xs font-normal text-muted-foreground">
                {children.map((c) => (
                  <li key={c.key} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 break-words">{c.label}</span>
                    <span className="shrink-0 tabular-nums">
                      {c.leads} lead{c.leads === 1 ? "" : "s"} · {pct(c.conversionRate)} conv.
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </TD>
        <Cells row={row} />
      </TR>
    </>
  );
}

/**
 * Follow-up rate by agent.
 *
 * The one leading indicator on the page. Everything else says what happened; this says
 * what is about to. A low rate here is next month's appointment shortfall, visible a
 * month early.
 */
export function FollowUpTable({
  rows,
}: {
  rows: { agentId: string; name: string; openLeads: number; touched: number; rate: number | null }[];
}) {
  if (rows.length === 0) return null;
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle>Follow-up rate</CardTitle>
        <p className="text-sm text-muted-foreground">
          Of the open leads assigned to each agent, how many have been worked at least once.
          This is the number that predicts next month&apos;s appointments — unlike everything
          else here, it is about what has not happened yet.
        </p>
      </CardHeader>
      <CardContent>
        <Table label="Follow-up rate by agent">
          <THead>
            <TR>
              <TH>Agent</TH>
              <TH className="text-right">Open leads</TH>
              <TH className="text-right">Worked</TH>
              <TH className="text-right">Rate</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.agentId || r.name}>
                <TD className="font-medium">{r.name}</TD>
                <TD className="text-right tabular-nums">{r.openLeads}</TD>
                <TD className="text-right tabular-nums">{r.touched}</TD>
                {/* Only an untouched pile is called out. A partial rate is normal work in
                    progress, and colouring it would cry wolf.

                    "None worked" is spelled out beside the zero: red on its own said
                    nothing to a greyscale printout or to a reader who cannot separate
                    it from the other figures in the column. */}
                {r.rate !== null && r.rate === 0 && r.openLeads > 0 ? (
                  <TD className="text-right font-medium tabular-nums text-destructive-ink">
                    {pct(r.rate)} <span className="whitespace-nowrap font-normal">· none worked</span>
                  </TD>
                ) : (
                  <TD className="text-right font-medium tabular-nums">{pct(r.rate)}</TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

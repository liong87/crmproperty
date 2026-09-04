"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { recordSpend, deleteSpend, type SpendRow } from "@/server/campaign-spend/actions";
import type { CampaignCostReport } from "@/server/reports/spend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { FormAlert } from "@/components/ui/alert";
import { formatMYR } from "@/lib/utils";

/** A cost per lead is a small number; whole ringgit hides the difference. */
const money = (cents: number | null) => (cents == null ? "—" : formatMYR(cents));

function thisMonth(): string {
  // Malaysia is UTC+8, so shifting before formatting keeps "this month" correct for
  // the first eight hours of the 1st, when UTC is still in the previous month.
  const my = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return `${my.getUTCFullYear()}-${String(my.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface Draft {
  campaign: string;
  source: string;
  month: string;
  amount: string;
}

export function SpendManager({
  report,
  entries,
  knownCampaigns,
}: {
  report: CampaignCostReport;
  entries: SpendRow[];
  knownCampaigns: Array<{ campaign: string; source: string }>;
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft>({
    campaign: "",
    source: "meta",
    month: thisMonth(),
    amount: "",
  });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const set = <K extends keyof Draft>(k: K, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  function onSave() {
    if (!draft.campaign.trim()) return setError("Which campaign is this for?");
    if (!draft.amount.trim()) return setError("Enter what it cost.");
    run(async () => {
      const res = await recordSpend(draft);
      if (res.success) setDraft((d) => ({ ...d, campaign: "", amount: "" }));
      return res;
    });
  }

  const t = report.totals;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Spend" value={formatMYR(t.spend)} hint={`${t.leads} leads`} />
        <Stat label="Cost per lead" value={money(t.costPerLead)} />
        <Stat
          label="Cost per appointment"
          value={money(t.costPerAppointment)}
          hint={t.appointments === 0 ? "None set yet" : `${t.appointments} set`}
        />
        {/* The one to watch. A booking happens within weeks; a completion is months
            away, so cost per closed deal cannot inform this month's budget. */}
        <Stat
          label="Cost per booking"
          value={money(t.costPerBooking)}
          hint={t.bookings === 0 ? "Nothing booked yet" : `${t.bookings} booked`}
        />
        <Stat
          label="Cost per closed deal"
          value={money(t.costPerWon)}
          hint={t.won === 0 ? "Lags bookings by months" : `${t.won} closed`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Record what a campaign cost</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Every control here is wired to its label. They were four bare <Label>s
              with no htmlFor and four inputs with no id, so the whole row announced as
              unnamed edit fields and clicking a label focused nothing. */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="spend-campaign">Campaign</Label>
              <Input
                id="spend-campaign"
                list="known-campaigns"
                placeholder="Skyline August"
                value={draft.campaign}
                disabled={pending}
                onChange={(e) => set("campaign", e.target.value)}
              />
              {/* The names already on leads. Typing one by hand is how the join gets
                  broken, so offer the real spellings rather than trusting memory. */}
              <datalist id="known-campaigns">
                {knownCampaigns.map((c) => (
                  <option key={`${c.source}|${c.campaign}`} value={c.campaign} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="spend-source">Channel</Label>
              <Select id="spend-source" value={draft.source} disabled={pending} onChange={(e) => set("source", e.target.value)}>
                <option value="meta">meta</option>
                <option value="google">google</option>
                <option value="tiktok">tiktok</option>
                <option value="other">other</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="spend-month">Month</Label>
              <Input
                id="spend-month"
                type="month"
                value={draft.month}
                disabled={pending}
                onChange={(e) => set("month", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="spend-amount">Amount (RM)</Label>
              <Input
                id="spend-amount"
                inputMode="decimal"
                placeholder="3,500"
                value={draft.amount}
                disabled={pending}
                onChange={(e) => set("amount", e.target.value)}
              />
            </div>
          </div>
          {error && <FormAlert>{error}</FormAlert>}
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={pending} onClick={onSave}>
              {pending ? "Saving…" : "Save figure"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Entering the same campaign and month again replaces the figure rather than
              adding to it.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cost per lead by campaign</CardTitle>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing to show yet. Leads need a campaign on them — that arrives automatically
              from Meta and Google, or from the campaign column of a CSV import.
            </p>
          ) : (
            // No wrapping overflow-x-auto here: Table brings its own named, focusable
            // scroll region, and a second container around it swallows that tab stop.
            <div>
              <Table label="Cost per lead by campaign">
                <THead>
                  <TR>
                    <TH>Month</TH>
                    <TH>Campaign</TH>
                    <TH className="text-right">Spend</TH>
                    <TH className="text-right">Leads</TH>
                    <TH className="text-right">Appts</TH>
                    <TH className="text-right">Booked</TH>
                    <TH className="text-right">Closed</TH>
                    <TH className="text-right">Per lead</TH>
                    <TH className="text-right">Per appt</TH>
                    <TH className="text-right">Per booking</TH>
                    <TH className="text-right">Per deal</TH>
                  </TR>
                </THead>
                <TBody>
                  {report.rows.map((r) => (
                    <TR key={`${r.month}|${r.source}|${r.campaign}`}>
                      <TD className="whitespace-nowrap text-muted-foreground">{r.month}</TD>
                      <TD>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{r.campaign}</span>
                          <Badge variant="outline">{r.source}</Badge>
                          {r.spendWithoutLeads && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                              <AlertTriangle className="h-3 w-3" />
                              no leads matched this name
                            </span>
                          )}
                        </div>
                      </TD>
                      <TD className="text-right">{money(r.spend)}</TD>
                      <TD className="text-right">{r.leads}</TD>
                      <TD className="text-right">{r.appointments}</TD>
                      <TD className="text-right font-medium">{r.bookings}</TD>
                      <TD className="text-right">{r.won}</TD>
                      <TD className="text-right">{money(r.costPerLead)}</TD>
                      <TD className="text-right">{money(r.costPerAppointment)}</TD>
                      <TD className="text-right font-semibold">{money(r.costPerBooking)}</TD>
                      <TD className="text-right">{money(r.costPerWon)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {entries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Figures entered</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{e.campaign}</span>{" "}
                  <span className="text-muted-foreground">
                    · {e.source} · {e.month}
                  </span>
                  {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{formatMYR(e.amount)}</span>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteSpend(e.id))}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

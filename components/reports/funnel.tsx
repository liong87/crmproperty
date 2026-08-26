import type { FunnelData } from "@/server/reports/funnel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FUNNEL_RAMP, STATUS } from "@/lib/chart-colors";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/**
 * The funnel, as proportional horizontal bars on an ordinal ramp.
 *
 * Deliberately NOT the tapered trapezoid shape funnels usually get drawn as: that
 * encodes magnitude as area, which the eye reads badly and which exaggerates the top.
 * Bar length is read accurately, and because each stage is shorter than the one above
 * it, the shape still narrows and still reads as a funnel.
 *
 * Bars are measured against the TOP of the funnel, not the stage above, so the
 * cumulative drop-off is visible at a glance instead of every stage looking full.
 */
export function FunnelChart({ data }: { data: FunnelData }) {
  const top = data.stages[0]?.count ?? 0;

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between gap-3">
        <CardTitle>Funnel</CardTitle>
        <span className="text-xs text-muted-foreground">
          Last {data.sinceDays} days · {data.scope === "team" ? "whole team" : "your leads"}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {data.stages.map((s, i) => {
            const width = top > 0 ? Math.max(1.5, (s.count / top) * 100) : 1.5;
            return (
              <div key={s.key}>
                {/* Label and value only. The conversion sits under the bar rather than
                    fighting them for width — three items on one line wraps badly at 390px. */}
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{s.label}</span>
                  {/* Direct label on every stage: the value is never tooltip-only. */}
                  <span className="font-semibold">{s.count.toLocaleString("en-MY")}</span>
                </div>
                {/* Thin mark, rounded data-end, anchored to the baseline. */}
                <div className="h-2.5 w-full rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${width}%`, backgroundColor: FUNNEL_RAMP[i] ?? FUNNEL_RAMP[3] }}
                  />
                </div>
                {s.conversionFromPrevious != null && (
                  <div className="mt-1 text-right text-xs text-muted-foreground">
                    {pct(s.conversionFromPrevious)} of previous
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-4 border-t pt-4">
          <Figure
            label="Lead → booking"
            value={pct(data.stages.find((s) => s.key === "booked")?.conversionFromLeads ?? null)}
            hint="Of every enquiry"
          />
          <Figure
            label="No-show rate"
            value={pct(data.noShowRate)}
            hint="Kept or missed"
            /* Status colour, and only because this number MEANS good or bad. Paired
               with its label, never colour alone. */
            tone={data.noShowRate == null ? undefined : data.noShowRate > 0.3 ? STATUS.critical : data.noShowRate > 0.15 ? STATUS.warning : STATUS.good}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A stat figure. Proportional digits and the body sans on purpose — tabular figures
 * make a large standalone number look loose, and the display serif reads as decoration.
 */
function Figure({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold leading-none" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function FunnelBreakdown({
  title, rows, emptyHint, columns, note,
}: {
  title: string;
  rows: FunnelData["byProject"];
  emptyHint: string;
  /** Header overrides. The per-agent table counts different things — see `note`. */
  columns?: { appointments?: string; showedUp?: string; booked?: string };
  note?: string;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">{emptyHint}</p></CardContent>
      </Card>
    );
  }

  const maxLeads = Math.max(1, ...rows.map((r) => r.leads));

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>{title}</CardTitle>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </CardHeader>
      <CardContent className="px-0">
        {/* Wide table on a 390px screen: scroll the table, never the page. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-2 py-2 text-right font-medium">Leads</th>
                <th className="px-2 py-2 text-right font-medium">{columns?.appointments ?? "Appts"}</th>
                <th className="px-2 py-2 text-right font-medium">{columns?.showedUp ?? "Showed"}</th>
                <th className="px-2 py-2 text-right font-medium">{columns?.booked ?? "Booked"}</th>
                <th className="px-4 py-2 text-right font-medium">No-show</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id ?? "none"} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.label}</div>
                    {/* A hairline share bar: one series, one colour — never a value ramp. */}
                    <div className="mt-1 h-1 w-full max-w-[10rem] rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(r.leads / maxLeads) * 100}%`, backgroundColor: FUNNEL_RAMP[1] }}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tnum align-top">{r.leads}</td>
                  <td className="px-2 py-2 text-right tnum align-top">{r.appointments}</td>
                  <td className="px-2 py-2 text-right tnum align-top">{r.showedUp}</td>
                  <td className="px-2 py-2 text-right font-semibold tnum align-top">{r.booked}</td>
                  <td className="px-4 py-2 text-right tnum align-top">
                    {r.noShowRate == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span style={{ color: r.noShowRate > 0.3 ? STATUS.critical : undefined }}>
                        {pct(r.noShowRate)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

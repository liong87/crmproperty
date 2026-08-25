"use client";
import * as React from "react";
import type { TrendPoint } from "@/server/reports/funnel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SERIES, CHROME } from "@/lib/chart-colors";

/** Fixed slot order. Colour follows the entity, never its rank — filtering never repaints. */
const LINES = [
  { key: "leads", label: "Leads", color: SERIES.leads },
  { key: "appointments", label: "Appointments", color: SERIES.appointments },
  { key: "booked", label: "Booked", color: SERIES.booked },
] as const;

const W = 720;
const H = 220;
const PAD = { top: 12, right: 56, bottom: 28, left: 34 };

/**
 * Weekly trend across the funnel.
 *
 * One y-axis, always: counts of leads, appointments and bookings are the same kind of
 * quantity, so they belong on one scale. (Two scales on one plot would invent a
 * correlation that is not in the data.)
 *
 * Values are reachable three ways — the endpoint is direct-labelled, hovering gives the
 * whole week, and the table underneath carries every figure. The tooltip never gates a
 * number.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const [showTable, setShowTable] = React.useState(false);

  if (points.length < 2) {
    return (
      <Card>
        <CardHeader><CardTitle>Trend</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Not enough history yet — a trend needs at least two weeks of activity.
          </p>
        </CardContent>
      </Card>
    );
  }

  const max = Math.max(1, ...points.flatMap((p) => [p.leads, p.appointments, p.booked]));
  // Round the top up so the axis lands on a readable number rather than the data max.
  const top = niceCeil(max);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  const ticks = [0, top / 2, top];
  const active = hover ?? points.length - 1;

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between gap-3">
        <CardTitle>Trend</CardTitle>
        <div className="flex items-center gap-3">
          {/* Legend is always present for >= 2 series: identity is never colour alone. */}
          <div className="flex flex-wrap gap-3">
            {LINES.map((l) => (
              <span key={l.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-[220px] w-full min-w-[34rem]"
            role="img"
            aria-label={`Weekly leads, appointments and bookings over the last ${points.length} weeks`}
            onMouseLeave={() => setHover(null)}
          >
            {/* Recessive grid: solid hairlines one shade off the surface, never dashed. */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={CHROME.grid} strokeWidth="1" />
                <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="currentColor" className="text-muted-foreground tnum">
                  {Math.round(t)}
                </text>
              </g>
            ))}

            {/* x labels, thinned so they never collide on a narrow screen. */}
            {points.map((p, i) =>
              i % Math.ceil(points.length / 6) === 0 || i === points.length - 1 ? (
                <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="currentColor" className="text-muted-foreground">
                  {p.label}
                </text>
              ) : null,
            )}

            {/* Crosshair under the marks so it never obscures them. */}
            {hover != null && (
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke={CHROME.axis} strokeWidth="1" />
            )}

            {LINES.map((l) => {
              const d = points
                .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[l.key]).toFixed(1)}`)
                .join(" ");
              const last = points[points.length - 1]!;
              return (
                <g key={l.key}>
                  <path d={d} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {/* Endpoint marker with a 2px surface ring, so overlapping series stay legible. */}
                  <circle cx={x(points.length - 1)} cy={y(last[l.key])} r="4" fill={l.color} stroke={CHROME.surface} strokeWidth="2" />
                  {/* Selective direct label: the endpoint only, never a number on every point. */}
                  <text x={x(points.length - 1) + 9} y={y(last[l.key]) + 3.5} fontSize="11" fill={l.color} className="font-semibold">
                    {last[l.key]}
                  </text>
                  {hover != null && (
                    <circle cx={x(hover)} cy={y(points[hover]![l.key])} r="4" fill={l.color} stroke={CHROME.surface} strokeWidth="2" />
                  )}
                </g>
              );
            })}

            {/* Generous invisible hit targets — never make anyone land on a 4px dot. */}
            {points.map((_, i) => (
              <rect
                key={i}
                x={x(i) - plotW / (points.length - 1) / 2}
                y={PAD.top}
                width={plotW / (points.length - 1)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            ))}
          </svg>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-3 border-t pt-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-xs text-muted-foreground">
              {hover == null ? "Latest week" : "Week of"} {points[active]!.label}
            </span>
            {LINES.map((l) => (
              <span key={l.key} className="flex items-center gap-1.5 text-sm">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="text-muted-foreground">{l.label}</span>
                <span className="font-semibold tnum">{points[active]![l.key]}</span>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {showTable ? "Hide table" : "View as table"}
          </button>
        </div>

        {/* The table-view twin: every value readable without colour or hover. */}
        {showTable && (
          <div className="overflow-x-auto border-t pt-3">
            <table className="w-full min-w-[24rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">Week</th>
                  {LINES.map((l) => <th key={l.key} className="py-1 text-right font-medium">{l.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.label} className="border-t">
                    <td className="py-1">{p.label}</td>
                    {LINES.map((l) => <td key={l.key} className="py-1 text-right tnum">{p[l.key]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Round an axis maximum up to something a person would have chosen. */
function niceCeil(n: number): number {
  if (n <= 5) return 5;
  const mag = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / mag) * mag;
}

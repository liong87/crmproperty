# Build brief — PropertyAgent CRM dashboard revamp

**For:** the Claude session running in `C:\Users\weichong.liong\Desktop\Claude\Propertyagent\crm`
**From:** a competitor teardown of ZIEN CRM (ziencrm.com), 2 Sep 2026

Put this file, `CRM-REVAMP-SPEC.md` and `DESIGN-SYSTEM.md` in the repo root before you start.

---

## Paste this into the desktop session

> Read `BUILD-BRIEF.md`, `DESIGN-SYSTEM.md` and `CRM-REVAMP-SPEC.md` in the repo root. They are a teardown of a competitor CRM (ZIEN) and a spec for revamping ours.
>
> Start with Task 1 in the brief only — the dashboard funnel band. Don't touch anything else yet. Show me the diff and the deployed page before moving on.

---

## Context

ZIEN CRM is the competitor. Their dashboard is built around one idea we don't have: the lead funnel is drawn as **a single continuous tapering band** across five stages, not as separate stat tiles. That's the change we want first.

We are **not** adopting their blue/Tailwind visual identity. Our existing deep-green + serif look is better and stays. Only the *structure* is being copied.

Read `DESIGN-SYSTEM.md` for the full comparison, but the short version of what we keep vs change:

| | Ours today | Change to |
|---|---|---|
| Accent | deep green, serif headings | **keep exactly** |
| Funnel | 4 stat columns with thin top bars | one tapered SVG band, 5 stages |
| Per stage | 1 number | 3 numbers: % of pool, `x of y`, step conversion |
| Small metrics | 4 separate bordered cards | 1 divided strip |
| Follow-up rate | not surfaced | own panel |

---

## Task 1 — Funnel band component

### Requirements

1. Five stages: **Lead → Appt set → Showed up → Closed → Converted**. Stage list must be a prop, not hardcoded, so Report can reuse it with different stages.
2. One SVG, `viewBox="0 0 100 100"`, `preserveAspectRatio="none"` so it stretches to any container width.
3. Two paths: a padded ghost at `opacity .22` behind, and the solid funnel in front. Both filled with the same hard-stop gradient — one flat colour per stage, stops doubled at each boundary so colours butt instead of blending.
4. Each stage column shows:
   - the **percentage of the original lead pool**, large, serif, tabular-nums, centred inside the band
   - the raw count `22 of 248` below the band
   - the **step conversion from the previous stage** (`→ 36.1%`), below the count; stage 1 shows `starting point` instead
5. Colour ramps neutral → brand green across the five stages. Do **not** use amber/red mid-funnel the way ZIEN does — it reads as alarm when nothing is wrong.
6. An empty stage must still render a visible hairline (floor the half-height at `0.2` units), otherwise the band vanishes and looks broken.
7. Hairline dividers between columns run through header, band and footer as one continuous line.
8. Works with `values = [1, 1, 0, 0, 0]` (our current live data) without looking degenerate.
9. No client-side state needed — keep it a Server Component.
10. Responsive: below 620px reduce the band height and percentage size; the container never scrolls horizontally.

### Tokens to add

`globals.css`, alongside the existing theme tokens — match the naming convention already in the file:

```css
:root{
  --stage-1:#D3D8D0; --stage-2:#BCD2C4; --stage-3:#8FBBA6; --stage-4:#4A9280; --stage-5:#12564A;
  --stage-1-ink:#5F6B64; --stage-2-ink:#4E7A65; --stage-3-ink:#2F7D6C; --stage-4-ink:#217566; --stage-5-ink:#12564A;
}
/* dark theme — follow whatever pattern globals.css already uses */
  --stage-1:#3A4742; --stage-2:#375349; --stage-3:#3A6E5E; --stage-4:#3D8E79; --stage-5:#63C3AB;
  --stage-1-ink:#9AA9A2; --stage-2-ink:#7FBBA6; --stage-3-ink:#77C7AF; --stage-4-ink:#6ECDB2; --stage-5-ink:#7FD3BC;
```

### Reference implementation

Adapt to our conventions — file location, naming, and however we're already handling `cn()` / class merging. The geometry is lifted from ZIEN's live SVG and is correct; don't redesign it.

```tsx
// components/dashboard/funnel-band.tsx

type Stage = { label: string; value: number };

function buildPath(values: number[], max: number, pad: number) {
  const n = values.length;
  const w = 100 / n;
  const half = (v: number) =>
    Math.max(0.2, (32 + pad) * (max ? v / max : 0)) + pad * 0.25;
  const cx = (i: number) => w * (i + 0.5);
  const top = (i: number) => 50 - half(values[i]);
  const bot = (i: number) => 50 + half(values[i]);

  // top edge, left to right
  let d = `M 0 ${top(0)} L ${cx(0)} ${top(0)}`;
  for (let i = 0; i < n - 1; i++) {
    const bx = w * (i + 1);                    // stage boundary — both control points sit here
    d += ` C ${bx} ${top(i)}, ${bx} ${top(i + 1)}, ${cx(i + 1)} ${top(i + 1)}`;
  }
  d += ` L 100 ${top(n - 1)} L 100 ${bot(n - 1)}`;

  // bottom edge, right to left
  for (let j = n - 1; j > 0; j--) {
    const bx = w * j;
    d += ` C ${bx} ${bot(j)}, ${bx} ${bot(j - 1)}, ${cx(j - 1)} ${bot(j - 1)}`;
  }
  return d + ` L 0 ${bot(0)} Z`;
}

export function FunnelBand({ stages }: { stages: Stage[] }) {
  const values = stages.map((s) => s.value);
  const max = values[0] || 1;
  const n = stages.length;
  const w = 100 / n;

  const stops = stages.flatMap((_, i) => [
    <stop key={`a${i}`} offset={`${i * w}%`} stopColor={`var(--stage-${i + 1})`} />,
    <stop key={`b${i}`} offset={`${(i + 1) * w}%`} stopColor={`var(--stage-${i + 1})`} />,
  ]);

  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };

  return (
    <div className="px-5 pb-5">
      {/* headers */}
      <div className="grid" style={cols}>
        {stages.map((s, i) => (
          <div
            key={s.label}
            className="border-l border-[--line-soft] first:border-l-0 px-1.5 pt-3.5 pb-2.5
                       text-center text-[10.5px] font-semibold uppercase tracking-[0.11em]"
            style={{ color: `var(--stage-${i + 1}-ink)` }}
          >
            {s.label}
          </div>
        ))}
      </div>

      {/* band */}
      <div className="relative h-[168px] max-[620px]:h-[132px]">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden
             className="absolute inset-0 block h-full w-full">
          <defs>
            <linearGradient id="funnel-fill" x1="0" y1="0" x2="1" y2="0">{stops}</linearGradient>
          </defs>
          <path d={buildPath(values, max, 8)} fill="url(#funnel-fill)" opacity={0.22} />
          <path d={buildPath(values, max, 0)} fill="url(#funnel-fill)" />
        </svg>

        <div className="absolute inset-0 grid" style={cols}>
          {stages.map((s, i) => (
            <div key={s.label}
                 className="flex items-center justify-center border-l border-[--line-soft] first:border-l-0">
              <span className="font-serif text-3xl font-bold tabular-nums tracking-[-0.02em]
                               max-[620px]:text-xl"
                    style={{ color: `var(--stage-${i + 1}-ink)` }}>
                {max ? Math.round((s.value / max) * 1000) / 10 : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* counts + step conversion */}
      <div className="grid" style={cols}>
        {stages.map((s, i) => {
          const prev = i === 0 ? null : values[i - 1];
          return (
            <div key={s.label}
                 className="border-l border-[--line-soft] first:border-l-0 px-1.5 pt-3 pb-1 text-center">
              <div className="text-xs tabular-nums text-[--ink-3]">{s.value} of {max}</div>
              {i === 0 ? (
                <div className="mt-0.5 text-[11.5px] text-[--ink-3]">starting point</div>
              ) : (
                <div className="mt-0.5 text-[11.5px] font-semibold tabular-nums"
                     style={{ color: `var(--stage-${i + 1}-ink)` }}>
                  <span className="font-normal opacity-55">→</span>{" "}
                  {prev ? Math.round((s.value / prev) * 1000) / 10 : 0}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Call site:

```tsx
<FunnelBand stages={[
  { label: "Lead",       value: counts.leads },
  { label: "Appt set",   value: counts.appointmentsSet },
  { label: "Showed up",  value: counts.showedUp },
  { label: "Closed",     value: counts.closed },
  { label: "Converted",  value: counts.converted },
]} />
```

### Acceptance

- [ ] `pnpm typecheck` and `pnpm test` pass
- [ ] Page loads without a runtime error — **actually open it after deploying**, don't rely on the build passing
- [ ] Renders correctly with `[1,1,0,0,0]` and with `[248,96,61,22,14]`
- [ ] Light and dark both legible
- [ ] Nothing else on the dashboard changed

---

## Task 2 — Divided metric strip

Replace the four separate bordered metric cards with one bordered container, `grid-cols-4`, hairline `border-l` between cells, `overflow-hidden` and a single radius on the outer container. Below 900px it becomes `grid-cols-2` with a top border on the third and fourth cells.

Metrics: **Open leads** (not yet booked) · **Followed up** (% + `94 of 152 touched this week`) · **No-show rate** (+ `35 of 96 appointments missed`) · **Appointments ahead** (+ next date).

## Task 3 — Follow-up rate panel

New panel beside "Next appointment". Four labelled rows — Active, Inactive, Ongoing appt, Completed appt — each a `110px` label, a `7px` rounded track filled with the brand green, and a right-aligned tabular percentage.

This needs `last_followup_at` and `followup_count` on the lead record. If those columns don't exist yet, add them in a migration and backfill from the activity log before building the panel — see §3 of `CRM-REVAMP-SPEC.md`.

## Task 4 onwards

Stop here and check in. Everything past this point is in `CRM-REVAMP-SPEC.md` §14, which orders the whole revamp into five phases — Master Leads / Working Leads split, appointment kanban, collab pool, campaign reporting, WhatsApp. Do not start those without confirming scope first.

---

## Two standing rules

1. **Verify in the browser, not in the build.** A previous change shipped a Server→Client function-prop bug that typechecked and tested clean and only failed at render. After any deploy, load the page.
2. **Write empty states in ZIEN's voice.** They never say "No data" — they say *"No active leads yet. Leads land here when someone assigns them to you, or when you take one from the Collab Pool."* Every empty state teaches the feature. See §4 of `DESIGN-SYSTEM.md`.

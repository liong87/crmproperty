# Build brief 3 — Appointment board

**For:** the Claude session in `C:\Users\weichong.liong\Desktop\Claude\Propertyagent\crm`
**Companion to:** `BUILD-BRIEF.md`, `BRIEF-2-NAV-FILTERS-REMARKS.md`, `DESIGN-SYSTEM.md`

Three problems with our board today: it stops at `Booked` so the deal has nowhere to go, every column and card is the same white, and there's no search or follow-up figure. All three are fixed below. Values are lifted from ZIEN's live DOM.

---

## Paste this into the desktop session

> Read `BRIEF-3-APPOINTMENT-BOARD.md` in the repo root.
>
> Do Task 7 first — the stage set and the migration — and show me the schema before you run it. Then Task 8 (visual), then Task 9 (toolbar). Load the page in a browser after each deploy.

---

## Task 7 — The missing stages

**Scope correction.** Our architecture already splits this across two boards, and that split is correct — better than ZIEN's, which crams everything into one board because they're product-agnostic:

- **Appointments** = getting the client in front of you, up to the moment they book.
- **Pipeline** = the money after they book. Already `Booked → SPA Signed → Loan Approved → Completed`, with RM values per column, split by `New launch / Resale`.

So the mortgage and conversion stages I put on the appointment board in the first draft of this brief are **wrong** — they live in Pipeline and stay there. Our own on-screen copy already states the rule: *"A project deal is created once a client books — the steps before that live on the appointment board."* Keep that boundary.

What the appointment board is actually missing is the failure branch.

### Target stage set — Appointments only

| # | Stage | Hue | Meaning |
|---|---|---|---|
| 1 | Scheduled | amber | booked in, not yet happened |
| 2 | **No show** | rose | client didn't turn up — terminal |
| 3 | Showed up | orange | met the client |
| 4 | Booked | emerald | **handoff** — creates the Pipeline deal, terminal here |
| 5 | **Cancelled** | slate | called off before it happened — terminal |
| 6 | **Not interested** | slate | met, no fit — terminal |

Three of those are new. `No show` is the one to do first: it's why `No-show rate` renders as `—` today — there is nothing for it to count.

`Booked` becomes emerald rather than sky, because on this board it *is* the win. The board's job ends there.

### The handoff

Moving a card to **Booked** creates a Pipeline deal in the `Booked` column, and the appointment card then shows a **"View deal →"** link instead of a stage dropdown. One record, two views — never duplicate the stages across both boards.

If a deal is later deleted or reverted in Pipeline, the appointment stays at Booked. Don't try to sync backwards.

### One suggestion for Pipeline

Pipeline currently goes `Booked → SPA Signed → Loan Approved → Completed`. Consider inserting **Loan Submitted** before **Loan Approved**. Submitted and approved are different facts, and the gap between them is exactly where Malaysian property deals die — sitting with a bank for weeks with nobody chasing. ZIEN has a `Loan Submitted` stage for the same reason. Your call, but the visibility is worth the extra column.

### Requirements

1. Stages come from a **config table**, not a TypeScript enum. Name, hue, order and terminal-flag all editable — Configuration → Stages, same modal pattern as `CRM-REVAMP-SPEC.md` §12. This applies to both boards, sharing one component.
2. Terminal stages (No show, Cancelled, Not interested, Booked) close the appointment and must not sit in the `Ongoing` count.
3. Migration: map existing `Scheduled → Scheduled`, `Showed up → Showed up`, `Booked → Booked`. Nothing to backfill for the three new stages. Keep the old column until verified, drop it in a second migration.
4. Moving a card writes a `lead_remark` row with `kind = 'system'` — e.g. *"Appointment marked No show"* — so it lands in the lead's thread (see Brief 2, Task 6). Our help text already promises this: *"Moving a card to Showed up, No show or Cancelled records the outcome and writes it to the client's timeline."* Make it true for every stage, including Booked.
5. `No-show rate` = `no_show / (no_show + showed_up)`, over appointments whose scheduled time has passed. Show `—` only when the denominator is zero.

### Effect on the dashboard funnel

The five-stage funnel in `BUILD-BRIEF.md` spans **both** boards. Source each stage explicitly:

| Funnel stage | Comes from |
|---|---|
| Lead | leads created |
| Appt set | appointments created |
| Showed up | appointments at Showed up **or beyond** |
| Booked | appointments at Booked (= Pipeline deals created) |
| Converted | Pipeline deals at **Completed** |

"Showed up or beyond" matters — a client who showed up and booked must still count as having shown up, or the funnel will show numbers going back up.

---

## Task 8 — Make the board readable

Right now every column and every card is the same white, so the board carries no information until you read it. ZIEN tints each column by stage and gives each card a colour-coded banner. Two changes, both cheap.

### Column shell

```
rounded-2xl border transition-all duration-150
border-{hue}-200  bg-{hue}-50/30
dark:border-{hue}-700  dark:bg-{hue}-900/20
flex flex-col
```

Header:

```
px-3 py-2.5 flex items-center justify-between border-b border-white/60 dark:border-gray-700/60
```

Header label:

```
text-[10px] font-bold uppercase tracking-wide text-{hue}-700 dark:text-{hue}-400
```

Right of the label: the count, and a caret to collapse the column. `Cancelled` and `Not interested` use `slate` and sit collapsed by default — they're archive, not workflow.

Pipeline gets the same treatment with its own hues: `Booked` emerald, `SPA Signed` teal, `Loan Approved` indigo, `Completed` deep emerald. Its columns also carry an RM subtotal under the label, which the appointment board doesn't need — keep that difference.

The tint is `/30` — barely there. It should read as a wash you notice peripherally, not a block of colour. Resist deepening it.

Empty column renders a centred `Empty` in `text-gray-300 text-xs`, not a blank space. Ours already does this — keep it.

### Card

```
rounded-2xl border border-gray-100 dark:border-gray-800
bg-white dark:bg-gray-900
shadow-sm hover:shadow-md hover:border-gray-200
overflow-hidden flex flex-col
cursor-grab active:cursor-grabbing
transition-all select-none group
```

The card body stays white. The colour comes from **one banner strip across the top**:

```html
<div class="px-3 py-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200">
  <div class="flex items-center justify-between gap-1.5">
    <div class="text-[11px] font-semibold leading-tight flex items-center gap-0.5 flex-1 min-w-0">
      <span class="truncate opacity-90">Met1</span>
      <span class="opacity-60">@ Naza</span>
    </div>
    <span class="text-[11px] font-semibold shrink-0">Wed 9 Sept · 5:45 pm</span>
  </div>
</div>
```

**The banner hue encodes time, not stage** — the stage is already the column. Use proximity to the appointment:

| When | Hue |
|---|---|
| Overdue, still Scheduled | `rose` |
| Today | `amber` |
| Tomorrow / next 3 days | `emerald` |
| Later than that | `slate` |

This is the single highest-value detail on the board. It means an agent glancing at the Scheduled column instantly sees what's urgent without reading a single date.

Body below the banner:

```
name          text-[13px] font-bold text-gray-900 leading-tight truncate
phone         text-[11px] font-semibold  → WhatsApp link
CLOSER label  text-[9px] uppercase tracking-wide text-gray-400
closer        avatar + text-[11px] name
```

Footer chip showing the last activity: `Today · 10:25 am` in a light pill, then the event text in `text-[11px] text-gray-500`.

A card in the `Booked` column replaces its stage control with a **"View deal →"** link to the Pipeline record.

Keep drag-and-drop **and** the `Move to:` dropdown — the dropdown is the mobile path and ZIEN keeps both too. But restyle it: right now it's a full-width native `<select>` that dominates the card. Make it an icon button in the card's hover state that opens a small stage menu, so it disappears when you aren't using it.

---

## Task 9 — Board toolbar

Our board has `Board / Schedule`, a `No-show rate` figure and product chips. Add what's missing, matching the Working Leads toolbar from Brief 2 so the two pages feel like one app.

Left to right:

- **Tabs** — `Ongoing {n}` · `Completed {n}` · `Schedule {n}`. Ongoing excludes terminal stages. (We currently have `Board / Schedule` — this replaces it and adds the completed split.)
- **Search** — `Search name, phone, email, remarks…`, same component as Working Leads, searching remark bodies too.
- **Follow-up pill** — `↗ 1/1 followed up 100%`, same component and same calculation as Working Leads, scoped to leads with an appointment on this board. `h-10 rounded-xl border border-gray-200 bg-white`.
- **Configuration** — opens the shared modal on its Stages tab.

Filter chip row below: **Product · Role · Stage · WhatsApp**. `Role` filters by setter vs closer — keep it, it's how commission splits get checked. Same chip component as Brief 2, same URL-query behaviour.

---

## A note on colour

ZIEN uses amber → rose → orange → red → indigo → emerald across the board. Our app is deep green and much calmer, so don't paste their palette in at full strength — the `/30` and `/25` alphas above are what keep it from fighting our identity. The progression warm → cool → brand green is deliberate: it reads as heat cooling into a signed deal.

One thing I would not copy: ZIEN colours their `Closed` stage **red**. Closed is a good outcome; red reads as failure. That's why `Booked` is `sky` above.

---

## Acceptance

- [ ] All six appointment stages present, ordered, and driven by config rather than a hardcoded enum
- [ ] No mortgage or conversion stage has leaked onto the appointment board — those stay in Pipeline
- [ ] Moving a card to Booked creates the Pipeline deal, and the card then shows "View deal →"
- [ ] `No-show rate` computes a real number once a past appointment is marked no-show
- [ ] Dashboard funnel counts "Showed up **or beyond**", so booking a client doesn't drop the Showed-up figure
- [ ] Moving a card writes a system remark to the lead's thread
- [ ] Column tints and card banners render in light and dark
- [ ] Banner hue changes correctly for an overdue, a today, and a next-week appointment — test all three
- [ ] Search finds an appointment by a word that appears only in a remark
- [ ] Follow-up pill matches the figure Working Leads shows for the same leads
- [ ] Board scrolls horizontally inside its own container; the page body never scrolls sideways
- [ ] `pnpm typecheck` and `pnpm test` pass, **and the page loads in the browser after deploy**

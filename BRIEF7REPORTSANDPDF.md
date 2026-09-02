# Build brief 7 — Reports, Meta Ads report, PDF export

**For:** the Claude session in `C:\Users\weichong.liong\Desktop\Claude\Propertyagent\crm`
**Companion to:** `BUILD-BRIEF.md` (funnel component), `BRIEF-5-LEADS-CAPTURE.md`, `BRIEF-6-WHATSAPP-CAPTURE.md`, `DESIGN-SYSTEM.md`

---

## Paste this into the desktop session

> Read `BRIEF-7-REPORTS-AND-PDF.md`.
>
> Do Task 14 (report restructure) and Task 16 (PDF via print stylesheet) first — neither needs any new API access. Task 15 needs Meta Marketing API approval, so scaffold it behind a feature flag and tell me what's blocked.

---

## Where we actually stand

**Our Reports page is not thin.** It has an agent scorecard, leads by status, properties by status, pipeline by stage with RM values, and a per-project breakdown. ZIEN has no equivalent of the pipeline-value or properties sections at all.

Two things on our page are better than ZIEN's and must survive any rewrite:

1. **Pipeline by stage with RM values.** ZIEN reports lead counts; we report money. Keep it.
2. **The Outreach empty state.** *"Calls and WhatsApp messages logged in the last 90 days — not calls made. A zero means nothing was recorded, which is a reason to ask rather than a conclusion."* That is genuinely excellent — it stops a manager misreading a reporting gap as a performance problem. Do not replace it with "No data".

What we're missing is not volume of charts. It's three specific things:

| Gap | Why it matters |
|---|---|
| **No source or campaign breakdown** | We cannot answer "which channel produces deals". Every number is agent-shaped or stage-shaped, never source-shaped. |
| **No cost data** | We can't compute cost per lead, per appointment, or per conversion. Without it, ad budget is being spent blind. |
| **No date range control** | Sections use fixed windows ("last 90 days", "last 7 days") that can't be changed or aligned to each other. |

Also missing, but only once those features exist: sequence overview and collab-pool stats.

---

## Task 14 — Restructure the report

Two tabs, matching ZIEN: **`Lead`** and **`Campaign`**.

### Shared controls (top of page, apply to every section)

A single date-range control drives the whole page — no more per-section windows. Options, copied from ZIEN's Configure Report modal:

```
Last 7 days | Last 30 days | This month | Last month | Maximum | Custom
```

Plus a **Source** filter and a **Product** filter, using the chip component from Brief 2.

State lives in the URL query string so a report view is shareable and survives refresh. This matters more here than anywhere else — a report you can't send to someone is half a feature.

### Lead tab

1. **Product funnel** — the `FunnelBand` component from `BUILD-BRIEF.md`, one funnel per product, click a product to expand its status breakdown. Stage sources are in `BRIEF-3-APPOINTMENT-BOARD.md` §7 ("Effect on the dashboard funnel"), including the "Showed up **or beyond**" rule.
2. **Leads by source** — new, and the highest-value addition on this tab. A table: Source → Leads, Appts, Showed, Booked, Converted, plus conversion rate. Expandable to sub-source (Campaign → Ad Set → Ad) using the nested source model in `CRM-REVAMP-SPEC.md` §3.
3. **By agent** — keep ours as is. The subtitle already explains the credit rule (*"Appointments are credited to whoever set them; show-ups and bookings to whoever ran the presentation"*) which is exactly the kind of note these tables need.
4. **Outreach by agent** — keep, including that empty state.
5. **Leads by status** — keep.
6. **Pipeline by stage** — keep, with RM values.
7. **Follow-up rate by agent** — new. Uses `followup_count` / `last_followup_at` from Brief 2. This is the number that predicts next month's appointments, so it belongs on the report, not only on the working screens.

### Campaign tab

Task 15 below. Until the Meta connection exists, render the section with an honest empty state and a `Connect a Meta ad account` button — not a fake chart.

---

## Task 15 — Meta Ads Report

ZIEN's Campaign tab is titled **"Meta Ads Report — Analyse ad spend against Master Lead conversions"**. Their Configure Report modal, captured live:

```
DATE RANGE
[Last 7 days] [Last 30 days] [This month] [Last month] [Maximum] [Custom]

Active campaigns only                                        (●  )
Hides paused & archived campaigns. Paused ad sets & ads inside
an active campaign still show.

AD FILTERS
Filter by name at each level. Enter keywords and press Enter.
Multiple keywords = any match.
  Campaign  [ Type keyword, Enter to add                    ]
  Ad Set    [ Type keyword, Enter to add                    ]
  Ads       [ Type keyword, Enter to add                    ]

MASTER LEADS
  ○ Don't include Master Leads
  ● Fetch & match Master Leads by source
       Auto-map sources                                     (●  )
       Detects which sub-source is Campaign / Ad set / Ads from
       your lead sources. Turn off to map manually.

       Source: Meta
         Campaign → Campaign
         Ad set   → Adset
         Ads      → Ads

                                          [ ⚡ Fetch Report ]
```

Page-level controls outside the modal: `+ Add account`, an ad-account chip, the date range, `Active only`, and a `Leads by source` toggle.

### What it does

Pull spend and delivery metrics from the **Meta Marketing API** for the date range, then **join them to our leads** by matching the lead's sub-source values (campaign / ad set / ad name) against the ad structure. The join is what turns two useless halves into the one number that matters: cost per converted deal.

### Requirements

1. **Ad account connection** is separate from the page connection in Brief 5. It needs `ads_read` on the ad account, and the user must have access to it. Reuse `capture_account` with `provider = 'meta_ads'`, same encryption and same per-user isolation rules as Brief 5 §6.
2. **Fetch on demand, then cache.** The `Fetch Report` button is deliberate — Meta's insights API is slow and rate-limited. Cache results in D1 keyed on `(account, date_range, filters)` with a short TTL, and show when the data was last fetched. Never fetch on every page render.
3. **Metrics per row**: Spend, Impressions, Clicks, CTR, CPC, plus Meta's own reported leads. Then from our side: Leads, Appts, Showed, Booked, Converted, and the derived **Cost per lead**, **Cost per appointment**, **Cost per conversion**.
4. **Three levels**, expandable: Campaign → Ad Set → Ad.
5. **Auto-map sources** — infer which of our source sub-levels corresponds to campaign / adset / ad by matching names, with a manual override. Show the resulting mapping the way ZIEN does, so the user can see what it decided.
6. **Match rate must be visible.** If 40% of leads can't be matched to an ad, every cost figure is wrong. Show `142 of 180 leads matched (79%)` above the table and let the user click it to see the unmatched ones. ZIEN doesn't do this and it's the difference between a report you can trust and one you can't.
7. **Ad filters** are keyword lists per level, any-match, exactly as described in their modal.
8. **`Active campaigns only`** with their exact caveat — paused ad sets and ads inside an active campaign still show.
9. Where a lead carries a `ctwa_clid` from Brief 6, use it for an exact match rather than name matching. That's a hard join and far more reliable than string comparison.

### Blocked on

`ads_read` requires the same Meta app and Business verification as Brief 5. Build behind a feature flag with a fixture dataset so the UI is finished when access lands.

---

## Task 16 — PDF export

Two ways to do this on Cloudflare. **Build the first one now; the second only if a real need appears.**

### 16a — Print stylesheet (do this first)

A `Print / Save as PDF` button that calls `window.print()`, plus a real `@media print` stylesheet. No dependencies, no plan upgrade, works today, and the browser's own "Save as PDF" is what most people reach for anyway.

Requirements:

- Print styles hide the sidebar, the toolbar, filter chips and every button.
- Add a print-only header: our name, the report title, the **exact date range**, the filters applied, and the generation timestamp. A report without its parameters on the page is misleading the moment it's shared.
- `break-inside: avoid` on every card so sections don't split across pages.
- Charts must print. Confirm the funnel SVG renders — set `print-color-adjust: exact` on coloured elements, since browsers strip backgrounds by default and the funnel would come out blank.
- Force the light palette in print regardless of the viewer's theme.
- A4 portrait, sensible margins. Wide tables switch to a narrower column set rather than being clipped.
- Page numbers via `@page`.

This is an afternoon's work and covers most of what you want.

### 16b — Server-rendered PDF (later, only if needed)

Cloudflare **Browser Rendering / Browser Run** does this properly — a Worker binding that runs Puppeteer:

```toml
# wrangler.toml
[browser]
binding = "BROWSER"
```

```js
const browser = await puppeteer.launch(env.BROWSER);
const page = await browser.newPage();
await page.setContent(html);
const pdf = await page.pdf({ format: "A4", printBackground: true });
```

There's also a simpler `/pdf` quick-action endpoint if you don't need custom rendering control.

Worth it only when you need a PDF **without a human at a browser** — a monthly report emailed to a developer, or a scheduled export. Check the current plan requirements before committing; this is a paid feature and pricing changes.

**Do not** use jsPDF + html2canvas. It screenshots the DOM into a raster image — text isn't selectable, it's blurry when printed, and the file is large. It looks like the easy option and produces the worst result.

---

## Acceptance

- [ ] One date range drives every section on the page
- [ ] Report state is in the URL and survives a refresh
- [ ] Leads by source table expands to sub-source levels
- [ ] Pipeline RM values and the Outreach empty-state copy survived the rewrite
- [ ] Campaign tab shows an honest empty state with a connect button when no ad account is linked
- [ ] Meta report shows the lead match rate and lets you inspect unmatched leads
- [ ] Ad-account credentials follow the same isolation rules as Brief 5 §6
- [ ] Print output includes the date range and filters, keeps cards intact across pages, and renders the funnel in colour
- [ ] `pnpm typecheck` and `pnpm test` pass, **and the page loads and prints correctly in a browser after deploy**

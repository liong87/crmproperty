# What ZienCRM does that we don't — and what's worth copying

Source: two Instagram reels demoing **ZienCRM** (`ziencrm.com`), reviewed frame by
frame from the screen recording of 25 Aug 2026. Every claim about our side is
checked against the code in this repo, not against ROADMAP.md.

---

## 1. Read the difference in business model first

This matters more than any individual feature, because copying the wrong half
would be expensive.

**Zien is a new-launch / project sales CRM.** Its top-level object is a
**Product** — "Skyline Residence", "ParkCity Damansara", "Verde Heights" — a
development the agency has a marketing appointment for. Leads arrive in bulk
from Meta ads against that product, and the funnel is:

> **Lead → Appointment → Show Up → Closed**

There are no listings. There is no inventory to match a buyer against. The unit
of work is *booking a showroom appointment and getting the person to turn up*.

**Ours is a sub-sale / agency CRM.** Our top-level objects are `properties`
(individual listings with `askingPrice`, `state`, `area`, `propertyType`) and
`deals` on a configurable stage pipeline. We already have buyer↔listing matching
(`server/matching`) and a viewing scheduler (`server/viewings`) — both of which
Zien has no equivalent of, because they'd be meaningless in its model.

**Conclusion:** Zien is not "ahead of us". It is a different product solving a
different agency's problem. Roughly half of what the reel shows is genuinely
better than what we have; the other half would be a step backwards for a
sub-sale agency. The list below separates them.

---

## 2. What Zien has that is genuinely better — ranked

### 2.1 Ad-level attribution and cost-per-lead — **biggest real gap**

The reel's report screen shows, per campaign row: spend, **RM 3.48 cost per
lead**, lead count, and a funnel with conversion percentages at each step
(100% → Appt → Show Up → Closed). The presenter's point is that you can see a
campaign producing nothing and **kill it from inside the CRM**.

Our gap is narrower than it looks but real:

- `leads` stores `utmSource`, `utmMedium`, `utmCampaign` — good.
- It does **not** store ad set or ad. Zien filters on all three
  (`Campaign contains` / `Adset contains` / `Ad contains`). Meta's useful signal
  is at ad-set level; campaign alone is too coarse to act on.
- We store **no spend at all**, so cost-per-lead and cost-per-closed-deal are
  not computable.

*Fix:* add `utmContent` (ad set) and `utmTerm` (ad) to `leads` and to the intake
zod schema in `server/leads/intake.ts` — both are already standard UTM params, so
the Meta lead form and CSV import can populate them with no new plumbing. Then a
small `campaign_spend` table (campaign, month, amount) hand-entered monthly, and
`server/reports/queries.ts` can produce cost per lead and cost per closed deal.

*Effort: 2 days. This is ROADMAP 2.2, and it should move up.*

### 2.2 The appointment board — a real UX idea worth stealing

Zien's `/appointment` is a **kanban board**, not a list: columns for
`Booked → No Show → Show Up → Closed`, one card per appointment showing client,
phone, product, time, and a short outcome note ("Did not turn up for the
viewing, no reply after"). There's a calendar toggle beside it.

We have `viewings` with exactly the right data — `status`
(scheduled/completed/no-show/cancelled) and `outcome`
(interested/not-interested/offer-made/undecided) — and `app/(dashboard)/viewings`
renders it. What we don't have is the **board**. Dragging a card from Booked to
Show Up is one gesture; opening a viewing and setting two dropdowns is five.

Also worth noting: Zien tracks **show-up rate** as a first-class metric. For a
Malaysian agency that is *the* number — a booked viewing that no-one attends is
the single largest source of wasted agent hours. We capture the data and never
report on it.

*Fix:* a board view over the existing `viewings` table, plus a show-up-rate tile
on `/reports`. No schema change.

*Effort: 2–3 days.*

### 2.3 WhatsApp automation — we are one tier below

Zien has a **visual flow builder** (node graph) driving WhatsApp Business API
messages, with property image cards, a per-lead WhatsApp log, and flows that
fire on lead arrival. Ours is `lib/messaging/wa-link-provider.ts` — `wa.me`
click-to-chat links. The agent still presses send by hand.

Be careful here. The honest sequencing is:

1. **`message_templates` is in our schema and still unused.** Templates with
   `{{name}}`, `{{property}}`, `{{price}}` remove most of the typing at zero
   infrastructure cost. ROADMAP 1.3, one day's work. **Do this first.**
2. Real WhatsApp Business API is a different commitment: Meta business
   verification, a paid BSP (360dialog / Twilio / WATI ≈ USD 50–100/mo before
   per-conversation charges), template pre-approval, and a 24-hour session
   window that governs when you may message at all. Our `MessagingProvider`
   interface is already the right seam to plug it into — that was good design —
   but it is a month of work and a running cost, not a feature.
3. A visual flow builder is a product in itself. Don't build one. If automated
   sequences are wanted, hard-code two or three (instant reply on lead arrival,
   day-before viewing reminder, 3-day no-response nudge) and see if anyone
   actually wants more.

*Fix now: templates. Everything else: decide deliberately, with the monthly cost
on the table.*

### 2.4 The collaborator / pass-on model — interesting, and probably not for us

This is Zien's most distinctive mechanic and it deserves a straight assessment.

In Configuration → Sequences you set, per product and per source:

- a **sub-source filter** — only leads whose campaign/adset/ad name contains
  given words enter this sequence
- **"Pass to the next collaborator after N days"** (6 in the demo)
- **Excluded statuses** — a lead marked `Completed Apt`, `Closed`, `Converted`
  or `Appointment` is never passed on
- **"Skip the wait"** — pass immediately when progress hits certain statuses
- a **lead info template** controlling which fields the next collaborator sees
  (Product / Info / Source / Campaign / Ad Set / Ad)

So a lead the first agent doesn't convert in six days automatically moves to the
next agent in the pool. Appointments can be passed by hand too, mid-conversation.

**Why it works there:** in project sales the lead belongs to the *agency*, agents
are effectively interchangeable closers on the same product, and a dead lead
sitting on one agent's list is pure waste.

**Why it's dangerous for us:** in a sub-sale agency the client relationship *is*
the agent's asset. Auto-reassigning after six days is, in commission terms,
taking a lead off one agent and giving it to another — that is the single most
reliable way to start an internal fight. Our `ownershipFilter` model assumes the
opposite.

**What I'd take instead:** the *idea* of a stale-lead escape valve, without the
automatic transfer.

- Flag leads with no logged activity for N days on the manager's dashboard.
- Let the **manager** reassign, with a reason, recorded in `activities`.
- Optionally let an agent voluntarily release a lead back to a pool.

Same waste eliminated, no silent confiscation. If the principal specifically
wants automatic pass-on, make N configurable and long (14–21 days), exclude
anything with a logged viewing, and agree the commission rule *before* shipping
it — not after the first dispute.

Note also: ROADMAP 1.4 (duplicate client across agents) becomes much more
important the moment leads circulate. Zien's "lead info template" — showing the
next collaborator only the fields they need — is the right instinct and matches
our own PDPA posture.

### 2.5 Working Leads — a queue, not a list

Zien's main screen is `Working Leads` — "62 active leads to work on" — a dense
table with last-contact and next-follow-up dates side by side, status pills,
collaborator, source, and Call / WhatsApp buttons inline. It is a **work queue
ordered by what's overdue**, not a record browser.

Our `/leads` is a browsable list and `/reminders` is a separate page. The data to
build a proper queue exists — `activities.followUpAt` /
`followUpDoneAt` already have a partial index for exactly this query
(`activities_open_follow_up_idx`).

*Fix:* make the agent's landing page a single "what do I do today" queue —
overdue follow-ups, today's viewings, untouched new leads — with click-to-call
and click-to-WhatsApp inline. Mostly a re-arrangement of queries we already have.

*Effort: 2 days. High felt value per hour spent.*

### 2.6 Learning Hub

A library of short training videos organised into chapters — "New Agent
Onboarding", "Closing Masterclass", "Handling No Shows", "Daily Follow Up" — with
progress tracking ("Continue watching").

Genuinely smart, and cheap: it is a `documents`-style table plus embedded video
links. It also has a commercial logic we don't share — Zien sells to agencies, so
training content reduces *their* support burden. For a single agency, a Notion
page or a shared Drive folder does the same job for nothing.

*Verdict: nice-to-have. Revisit if agent onboarding actually turns out to be the
bottleneck.*

### 2.7 Per-agent funnel on team management

`My Team` shows one agent's funnel by product — 12 leads → 7 appointments →
2 show-ups → 2 closed, with conversion percentages — plus a closer breakdown
(own / no closer / passed on) and a chronological log of every status change.

Our `/reports` leaderboard shows counts and won value. A per-agent funnel with
drop-off percentages is a much better one-to-one review tool: it tells you
*where* an agent is losing people, which is coachable, rather than *how much*
they closed, which mostly isn't.

*This aligns with the ROADMAP's own conclusion on leaderboards — activity and
progression over absolute closed value. Effort: 2–3 days, mostly on top of
existing report queries.*

---

## 3. What we have that Zien doesn't

Worth keeping in view so we don't rebuild ourselves into a worse product:

| Ours | Zien |
|---|---|
| Property listings with price, area, type, photos | No inventory at all |
| Buyer ↔ listing matching (`server/matching`) | Not applicable |
| Deal pipeline with configurable stages | Fixed 4-step appointment funnel |
| Viewings tied to a specific property | Appointments tied to a project |
| PDPA export / erasure / 24-month purge | Not shown |
| Ownership enforced in the data layer | Deliberately porous (pass-on model) |

---

## 4. Recommended sequence

Decision taken 25 Aug 2026: **nothing with a recurring cost is being built yet.**
Everything below in Sprints 1–3 uses infrastructure we already pay for
(Supabase, Cloudflare, Clerk). The paid items are parked in section 4b with the
conditions that would unpark them.

Nothing here displaces Phase 0 in ROADMAP.md — backups, credential rotation and
production Clerk keys still come first. Assuming those are done:

**Sprint 1 — a week, all of it felt daily**

1. Message templates (ROADMAP 1.3) — 1 day
2. Working-leads queue as the agent landing page — 2 days
3. Add `utmContent` / `utmTerm` to lead intake — half a day
   *(do this early: attribution data can't be backfilled)*

**Sprint 2 — the manager's view**

4. Appointment/viewing board + show-up rate on reports — 3 days
5. Per-agent funnel with drop-off percentages — 2 days

**Sprint 3 — the money question**

6. `campaign_spend` table and cost-per-lead / cost-per-closed-deal — 2 days
7. Stale-lead flagging for managers (the safe half of 2.4) — 1 day

All seven items are free to run. Together they cover most of what the Zien reel
demonstrates, minus the automated sending.

---

## 4b. Parked — costs money, revisit later

### WhatsApp Business API — parked

| Line | Cost |
|---|---|
| Meta, marketing template (first contact) | ~RM 0.35–0.42 each |
| Meta, utility template (viewing reminder, confirmation) | ~RM 0.05–0.07 each |
| Meta, service (reply within 24h of client messaging first) | **free, uncapped** |
| BSP platform fee — 360dialog, zero markup | ~EUR 49/mo (~RM 240) |
| BSP alternatives | Twilio USD 0/mo + ~USD 0.005/msg · WATI ~USD 49/mo + ~20% markup |

At roughly 500 leads and 200 viewings a month that is **~RM 450/month**, against
RM 31/month hosting today. Rates are Meta's 2026 Malaysia reference figures, set
in USD, so they move with the exchange rate.

**Unpark when:** agents are living in the system daily *and* someone can point at
a specific message they are retyping dozens of times a day. Not before.

**When we do:** use a zero-markup BSP (360dialog or Twilio) behind the existing
`MessagingProvider` interface in `lib/messaging/` and hard-code three flows —
instant reply on lead arrival, day-before viewing reminder, 3-day no-response
nudge. Do **not** buy or build a visual flow builder; agencies demo them and use
two flows.

**Meanwhile, free and unchanged:** `wa-link-provider.ts` click-to-chat. The agent
presses send. Combined with templates (Sprint 1 item 1) that is most of the
benefit at no cost.

### Learning Hub — parked

Zien's training video library is cheap to build but solves a problem we don't
have yet, and a Drive folder does the same job for nothing. Revisit only if
onboarding new agents turns out to be a real bottleneck.

### Clerk Pro / MFA — parked, but note the risk

Clerk free has no MFA, and an admin account can export every client's NRIC. USD
20/mo is the fix. Carried over from TOMORROW.md — still an accepted risk, not a
solved one.

---

## 5. One caution

The reel is marketing. It shows a configuration screen, a full-looking board and
a report with clean numbers — all on demo data, with names like "Farah Idris
(Demo)" and "Gopal Menon (Demo)" visible in the collaborator picker. What it does
not show is whether agents actually live in it, whether the automation misfires,
or what it costs.

The features above are worth taking because they solve problems we can name in
our own agency — untouched leads, no-shows, unmeasurable ad spend — not because a
competitor has them.

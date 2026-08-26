# PropertyAgent CRM — roadmap

Rewritten 25 Aug 2026. Supersedes the previous version, which planned a resale and
rental agency CRM.

**The product direction has changed.** The primary business is now **new launch /
project sales of developer units**. Resale and rental stay in the system, but they
are the secondary mode. This document re-plans around that, using the existing code
where it fits and replacing it where it does not.

Effort estimates assume the current stack and one developer.

---

## Part 1 — What the pivot costs, honestly

### The good news

The harder half of what is already built carries over untouched. None of this is
resale-specific:

| Carries over as-is | Why it survives |
|---|---|
| Clerk auth, user sync, RBAC enforced in the data layer | Nothing about it assumes resale |
| Lead intake pipeline — signed webhooks, dedupe by phone/email, round-robin, UTM capture, consent, CSV import | Project sales needs exactly this, only harder |
| Contacts, activities, follow-up reminders | Unchanged |
| Documents + R2 storage, signed URLs, browser-side image resize | Booking forms and SPAs need it more than photos did |
| Messaging adapter, WhatsApp templates with placeholders | Unchanged |
| PDPA export, erasure, retention purge | Still a legal requirement, still an asset |
| Configurable deal stages, kanban pipeline | Needs grouping (below), but the engine is right |
| Rate limiting, webhook signature verification, security headers | Unchanged |

The intake pipeline in particular is worth more now than it was before. Project
sales is fed by high-volume paid social, and dedupe plus assignment plus consent
capture on every path is the part most people get wrong.

### What has to be built or replaced

| Needs work | Current state |
|---|---|
| `projects` and unit types | Does not exist. `properties` is a resale listing — owner name and phone, single unit, sale/rent |
| Appointments with a setter/closer split | `viewings` is close, but `propertyId` is `NOT NULL` and there is one `assignedTo` |
| Separate pipelines for project vs resale | `deal_stages` is one flat global list |
| Ownership across two roles | `ownershipFilter(user, ownerColumn)` takes a single column; an agent now needs to see leads they set **or** appointments they close |
| Project commission — developer-paid, staged, split | `deals.commissionPct` is a lone basis-point field |
| Meta Lead Ads intake | Webhooks cover Tally, Typeform, Google Ads, generic. No Meta |
| Funnel reporting by project, campaign and closer | Reports are point-in-time counts plus a leaderboard on won value |

Buyer ↔ listing matching stays, but demoted. Matching a lead to a **project** by
budget, area and unit type is still useful; "interested buyers for this specific
unit" mostly stops mattering when the developer owns the stock.

**Rough total for the project sales core: 3–4 weeks.** Not a rebuild.

---

## Part 2 — Design decisions

### Inventory depth — recommendation: project + unit types

You asked for a recommendation. **Track projects and their unit types, not
individual units** — with the specific unit captured on the booking record.

The reasoning:

- **The developer owns the availability list, and it moves hourly.** Mirroring their
  stock into your CRM means maintaining a copy that goes stale. A stale availability
  list is worse than no list: you tell a client A-12-03 is free, and it was taken by
  another agency an hour ago. You lose the client's trust to save them a phone call.
- **What an agent actually quotes is a unit type**, not a unit. "Type B, 1,050 sqft,
  3R2B, from RM 620k after rebate" is the conversation. Unit types give you that,
  and they give budget matching something real to match against.
- **What a booking needs is the specific unit**, and only at the moment of booking.
  So capture block, floor, unit number, type and nett price *on the booking*, where
  it is entered once and is correct.

This is roughly a third of the schema of full unit inventory, and it is **additive
later**: if you take an exclusive or a block allocation on one project, a `units`
table can be added and turned on per project, with existing bookings backfilled from
the unit details they already carry. Nothing has to be undone.

The condition that would flip this recommendation: if you regularly hold allocated
stock that only your agency can sell, you need real unit-level availability for
those projects. Tell me if that is the case and I will plan it per-project.

### Team model — setter and closer

You confirmed the split: one person books the appointment, another may close it.
This is the single biggest structural change, because it breaks the assumption
underneath the current access control.

- A **lead** has a setter — `leads.assignedTo`, unchanged.
- An **appointment** has both a setter and a closer. Often the same person.
- Commission splits between them, so both must be recorded at the time, not inferred later.
- `ownershipFilter` needs a two-column variant: an agent sees a record if they are
  the setter **or** the closer. Getting this wrong either hides an agent's own work
  from them or leaks the team's pipeline to everyone, so it is worth doing carefully
  and testing.

### Keeping resale alongside

Resale is not touched. The two modes coexist by discriminator rather than by making
everything polymorphic:

- `properties` stays exactly as it is, for resale and rental listings.
- `projects` and `project_unit_types` are new, for new launch.
- `appointments` references **either** a property or a project — two nullable FKs
  with a CHECK constraint. This is the pattern `viewings` already uses for
  `contactId` / `leadId`, so it is consistent with the existing code.
- `deals` gains a nullable `projectId` beside its existing nullable `propertyId`,
  plus a `dealType` of `project | resale | rental`.
- `deal_stages` gains a `pipeline` column so each mode has its own stage set.

The cost of keeping both is that every list, board and report needs a mode filter.
That is real but small, and it is much cheaper than migrating resale data out and
discovering in six months that you still need it.

### Scope

Single tenant — your agency only. No org key on tables, no billing, no tenant
isolation. If selling this to other agencies ever becomes the plan, say so **before**
Phase 2 starts; retrofitting tenancy across a grown schema is the one thing on this
list that genuinely hurts.

---

## Part 3 — The plan

### Phase 0 — Launch blockers (unchanged, ~4 hours)

- Rotate the credentials shared in chat during setup
- Real domain and Clerk **production** keys
- Screenshots in the user guide

Do these regardless. They are not affected by the pivot.

---

### Phase 1 — The project sales core (~2 weeks)

Nothing downstream is worth building until the funnel can represent the business.

**1.1 Projects and unit types** — *done, 25 Aug 2026*

New `projects`: name, developer, state, area, address, tenure, title type,
completion (expected VP) date, bumi quota and discount, rebate/package notes,
developer commission rate in basis points, status (`upcoming | open | closing |
closed`), gallery address, assigned lead pool.

New `project_unit_types`: project, label (Type A), built-up sqft, bedrooms,
bathrooms, car parks, list price, typical nett price after rebate, total units,
notes.

CRUD screens modelled on the existing properties pages.

Built as described, with two deliberate deviations:

- **No lead pool on the project.** It was listed here, but a pool means nothing until
  the routing in 2.2 exists, and a field nothing reads is a field that goes stale.
  It lands with 2.2.
- **Price range is derived, not stored.** `listProjectsPaginated` computes it from the
  unit types with one grouped query per page, so it cannot drift from the prices it
  summarises.

RBAC differs from properties on purpose: a listing belongs to the agent who won it, a
project belongs to the agency. Every agent views projects; only managers and admins
create, edit or delete them.

Verified: `tsc --noEmit` clean, 144 tests pass, `next build` succeeds with all four
`/projects` routes, and `0004_add_projects.sql` applies cleanly to a fresh PostgreSQL 16
followed by a live insert-and-read check of the derived price range.

**1.2 Appointments** — *done, 25 Aug 2026*

Extend `viewings` rather than replacing it, so nothing is lost:

- `propertyId` becomes nullable; add nullable `projectId`; CHECK exactly one
- Add `closerId` beside `assignedTo` (which becomes the setter)
- New status set: `scheduled | showed-up | no-show | cancelled`
- New outcome set: `booked | interested | not-interested | undecided`
- Keep `notes`, add a `remark` shown in list views

Rename to `appointments` in the same migration. `VIEWING_STATUS` and
`VIEWING_OUTCOME` in `lib/constants.ts` become the new sets.

**1.3 Pipelines** — *done, 25 Aug 2026*

`deal_stages` gains `pipeline`; `deals` gains `dealType` and `projectId`; `/pipeline`
gets a New launch / Resale tab. Existing stages and deals default to `resale`, so
nothing already in flight moves.

**The project pipeline is shorter than this document originally proposed, deliberately:**

> Booked → SPA Signed → Loan Approved → Completed (and Cancelled)

The original plan started it at Lead and repeated Appointment Set → Showed Up. But the
appointment board already owns those steps, and duplicating them as deal stages would
count the same event twice and let the funnel and the pipeline disagree about the same
week. A project deal therefore begins where the appointment board ends — at the booking
— and tracks the transaction from there, which is where the developer's money moves.

Two details worth keeping: the board filters on the stage set **and** `dealType`, so a
deal moved by hand cannot appear on a board it does not belong to; and a deal whose
stage has been deleted is counted and reported rather than silently vanishing.

**1.4 Appointment board** — *done, 25 Aug 2026*

Re-cut the viewings page as a board by outcome, mirroring the pipeline board that
already exists. Add **no-show rate** to reports, per closer and overall — the data
is being captured today and nobody is looking at it. This is the most useful
operational number in project sales.

**1.5 Ownership across setter and closer** — *done, 25 Aug 2026*

`ownershipFilterAny` and `canEditAny` in `lib/auth/rbac.ts`, applied to appointment
queries and to the funnel. Managers and admins are unaffected.

This was fixing a live bug, not closing a gap. Since 1.2 shipped closers, an agent
handed somebody else's appointment to close **could edit it but could not see it** —
`loadEditable` already allowed the closer through while every list query filtered on the
setter alone. Visibility and permission now use the same rule.

It also forced an honest change to per-agent reporting. A single row per agent mixing
both halves would credit whoever sat in `assignedTo` for work they did not do, and a
setter who books excellent appointments and hands them over would appear to have
converted nothing. So **appointments set are credited to the setter, and show-ups and
bookings to whoever ran the presentation** (`coalesce(closer_id, assigned_to)` — no
closer means the setter closed it themselves). The reports table says so under its title.

**1.6 Lead → project interest** — *done, 25 Aug 2026*

Add `projectId` to leads so an inbound lead carries the project it came from. This
is what makes 2.1 worth anything — and it is the top of the funnel, without which the
only thing countable per launch is appointments.

Set on the lead form; the picker hides itself when no projects exist, so a resale-only
workflow never sees it. Migration 0007.

---

### Phase 2 — Acquisition (~1.5 weeks)

Project sales lives or dies on paid social and speed of response.

**2.1 Meta Lead Ads intake** — *done, 25 Aug 2026*

Meta is structurally unlike every other webhook here, and that shaped the design:
**its webhook carries a receipt, not a lead.** It sends a `leadgen_id`, and the answers
have to be fetched back from the Graph API with a Page token. So this needed an adapter
(`lib/leadads/`) rather than another field mapper.

What was built:

- `POST /api/webhooks/forms/meta`, verified against `x-hub-signature-256` (HMAC-SHA256
  hex, keyed by the App Secret), plus the `GET` handshake Meta requires before it will
  send anything.
- `lib/leadads/` — interface + Meta provider, using `fetch` rather than the Facebook
  SDK so it still runs on Cloudflare Workers. Requests campaign and ad **names** in the
  same call, so cost-per-lead reporting does not need a second round trip.
- `lib/phone.ts` — E.164 normalisation. Meta returns whatever the user typed
  (`012-345 6789`), intake demands `+60123456789`. Without this, paid leads are binned
  by validation. It refuses to guess rather than storing a wrong number: an agent
  burning a call on a bad number is worse than a rejected one.
- `lead_form_sources` (migration 0008) and `/lead-sources` — an admin maps
  "form 8123… is the Skyline August launch" without a deploy. Campaigns launch weekly;
  a code change per campaign is how a CRM stops being used.
- Everything funnels through the existing `createLeadFromIntake`, so dedup, round-robin,
  consent and agent notification behave identically to every other source.

Decisions worth knowing:

- **An unmapped form still creates the lead.** Dropping a lead the agency paid for
  because nobody filled in a mapping would be far worse than filing it without a project.
- **Graph API failures return 503, not 200.** Meta retries for up to 36 hours, which is
  long enough to replace an expired token without losing a single paid lead. A lead that
  can never be valid (no usable phone) is skipped instead, so it does not block the batch.
- **Partial Meta configuration is fatal at boot.** Two of the three env vars set is the
  dangerous state: the handshake succeeds, Meta starts delivering, and every lead is
  dropped at a stage nobody is watching.
- **PDPA consent.** If the form asks a consent question, the answer is honoured — the
  only firmly defensible basis. If it does not, consent falls back to true with
  `consentSource` recording exactly what the claim rests on (`meta:form-privacy-policy:<form>`),
  mirroring the existing Google Ads decision. **Adding a consent checkbox to the Meta
  form puts this on firmer ground, and the mapper will use it automatically.**

**2.2 Project lead pools and pass-on** — *done, 25 Aug 2026*

Round-robin becomes per-project: each project has a pool of setters, and a lead
routes into that pool. If a setter logs no activity within N days, the lead passes
to the next person and both are notified. Exclude anything with an appointment, a
booking or a qualified status — a lead being actively worked is never yanked away.

N configurable per project. This is a response-time SLA in disguise, and it is the
cheapest change on this list that moves conversion.

**2.3 Speed-to-lead auto-reply** — *blocked on WhatsApp access, not on code*

**The agency currently uses the free WhatsApp Business app, which has no API.** No
software can send from it — not this CRM, not any competitor's. That is a property of
the app, not a gap in the build. The existing click-to-chat adapter is the correct
architecture for it.

**What is available today, at no cost:** the WhatsApp Business app has a built-in
*Greeting message* (fires on a first message, or after 14 days quiet) and an *Away
message* (outside set hours), under Settings → Business tools. That captures most of the
speed-to-lead value immediately. Limits worth knowing: one message for all enquiries —
it cannot vary by project — and nothing is recorded in the CRM.

**To automate from the CRM** needs the WhatsApp Cloud API:

- Meta Business verification, then template approval for business-initiated messages
- A phone number **dedicated to the API**. Once a number moves to Cloud API it can no
  longer be used in the WhatsApp Business app on a phone — so the sensible pattern is
  one agency number on Cloud API for automation, with agents keeping their own numbers
  on the app for human conversation and click-to-chat
- Per-conversation charges
- Typically one to three weeks of waiting before a single message can be sent

Once that access exists, the code is roughly 3–5 days: swap `wa-link-provider` for a
Cloud API provider behind the existing `MessagingProvider` interface, and fire an
approved template the moment a Meta lead lands — the hook point already exists, since 2.1.

**On the competitor's visual flow builder:** the value is the auto-reply, not the canvas.
A node-graph editor is weeks of frontend work for something a per-project reply template
achieves. Build the reply first and see whether the canvas is ever missed.

### 2.2 as built — and the design conflict it had to resolve

Between sessions, `server/leads/stale.ts` landed with the opposite decision recorded in
it: *"ZienCRM's answer is to reassign it automatically after N days… it is the wrong
answer here, where the client relationship IS the agent's asset… So: surface, do not
confiscate."* `assignLead` went further — *"Never automatic."*

Both positions are right, for different halves of the business. The resolution:

**Automatic pass-on applies to PROJECT leads only.** A lead attached to a project that
has opted in — by setting a pass-on window — moves to the next person in that project's
pool when its owner has logged nothing inside the window. Resale and unprojected leads
are surfaced by the stale list and never moved. The distinction holds because on a
launch the pool are interchangeable setters working the developer's campaign and passing
leads on is the working model, whereas in resale the relationship is the agent's own asset.

What was built:

- `project_pool_members` — who works a project's leads and in what order, with a
  "paused" state for somebody on leave that keeps their place in the rotation.
- Per-project round-robin. The counter is keyed per project, so adding a project never
  perturbs another's sequence. A project with no pool, and every lead with no project,
  falls back to the global rotation exactly as before.
- `lead_assignments` — append-only chain of custody: who held it, who moved it, why.
  Written on first assignment too, so "arrived and went to nobody" is visible.
- `leads.assignedAt` — when the *current* owner got it, reset on every move, so the
  clock measures this person's silence rather than the lead's age.
- The sweep (`server/leads/pass-on.ts`, `pnpm passon:leads`, weekday mornings 09:00 MYT)
  with a dry-run mode, and a pool manager on the project page.

**Nothing moves quietly.** Every transfer writes a history row, a note on the lead's
timeline naming both agents, and a message to each of them. The person who lost the lead
hears it from the system, not from a colleague.

**What it refuses to touch**, each verified against a real database: leads inside the
window; qualified or disqualified leads; leads with any activity logged since the current
owner received them; leads with an appointment booked; leads with no project; projects
that have not opted in; and pools of one, which have nobody to pass to and are counted
rather than treated as an error. Re-running the sweep the same morning moves nothing,
because the clock resets on transfer.

---

---

### Phase 3 — The money layer (~2 weeks)

Build this once real bookings exist. Designing a commission model against three test
deals means designing it twice.

**3.1 Project commission** — *4–5 days*

Genuinely different from resale commission and worth modelling properly:

- Developer commission rate, per project, sometimes per phase
- **Staged release** — typically part on SPA signing, part on loan documentation or
  completion. Each stage with its own expected and actual date, and amount.
- Split across agency, setter, closer and any co-broke party
- Override to a team leader, if the agency works that way
- Invoiced / received / outstanding, per stage

A principal's Monday morning question is "what is billed, what is collected, what is
stuck" — and with staged developer commission, "stuck" is where the money hides.

**3.2 Booking document checklist** — *2–3 days*

Attach documents to a **deal**, not just a property. A checklist per stage — booking
form, IC, income documents, SPA, loan offer — with deadline dates and reminders.
Expiring loan approval is the classic deal-killer and it is entirely preventable.

**3.3 Funnel and cost reporting** — *funnel done 25 Aug 2026; cost still open*

The funnel itself is built and live on `/reports`:

> Leads → Appointments Set → Showed Up → Booked → SPA → Completed

with conversion at each step and no-show rate, broken down by project and by agent,
over a 90-day window. It is built from leads and appointments rather than from deal
stages on purpose: a deal is created late, once something is worth calling a deal, but
the funnel has to describe what happened to every enquiry — including the many that
never became one.

Still open, and needing 2.1 first so campaign names arrive automatically:

- Monthly ad spend per campaign, for cost per lead, cost per appointment and **cost per
  booking** — the number that decides next month's budget. UTM data is already captured
  on every lead; only spend is missing.
- The same funnel cut by campaign and by closer.
- Time-to-first-contact per setter, which is what 2.2 exists to improve.

---

### Later, driven by need

- **Portal syndication / project microsites** — a formatted export per portal before paying for integrations
- **Interface density pass, part two** — the same treatment for list and board screens. Charts, dashboard and reports were done on 25 Aug (see below)
- **Teams** — `teamId` is in the schema and `canEdit` honours it, but nothing sets it
- **Bahasa Malaysia / Chinese** — `lib/constants.ts` was written for this. Decide early; retrofitting i18n gets worse monthly
- **Client portal** — shortlisted units, appointment times, booking status. Needs its own auth model; a client must never touch agent accounts
- **Learning hub** — onboarding and training videos on `documents` + R2. Genuinely good for retention when you are hiring regularly. Not at five people

---

## Charts, dashboard and reports — design pass (done, 25 Aug 2026)

The competitor's screens genuinely read faster. Their palette, though, is a brand
choice for a product being sold; the teal and amber here is distinctive and was kept.
What changed is form and rigour, not identity.

**Colour is computed, not chosen.** `lib/chart-colors.ts` is the single documented
palette, derived by stepping the existing brand tokens until they passed a validator —
never eyeballed. Recorded there with its results:

- **Funnel ramp** — one teal hue, four monotone lightness steps. Funnel stages are
  *ordered* (swapping them changes the meaning), so they take a single-hue ramp rather
  than categorical hues, and the reader sees the sequence in the colour itself.
- **Series** — teal / amber / plum for leads, appointments, bookings. Worst colour-blind
  separation ΔE 14.0 (protanopia), 20.0 for normal vision; all three clear 3:1 against
  the card. Slots are fixed: a reader who learns "bookings are plum" is never retaught.
- **Status** — reserved for numbers that *mean* good or bad, never reused as a series
  colour, and always beside a label rather than standing alone. On white, 5.3:1 to 7.1:1.

**The funnel is bars, not a tapered trapezoid.** The usual funnel shape encodes
magnitude as area, which the eye reads poorly and which flatters the top. Bar length is
read accurately, and since each stage is shorter than the one above it, the shape still
narrows and still reads as a funnel. Bars are measured against the top of the funnel,
so cumulative drop-off is visible rather than every stage looking full.

**A trend line was added, because counts cannot answer the real question.** Weekly leads,
appointments and bookings on one axis — never two, which would invent a correlation that
is not in the data. Weeks are cut in Malaysia time: a lead at 07:00 Monday in KL is
23:00 Sunday UTC and would otherwise land in the previous week, an off-by-one nobody
notices and everybody acts on.

**Values are never trapped in a hover.** Every funnel stage is direct-labelled, the trend
direct-labels each series endpoint, and the trend carries a table view for everything in
between. Sparklines on the dashboard tiles are shape only — the figure above carries the
number.

Smaller corrections along the way: hero figures moved to proportional digits and the body
sans (tabular figures make a large number look loose; a display serif reads as
decoration), bar lists stopped colouring nominal categories by their value, and gridlines
became solid hairlines rather than dashes.

---

## 3.3 Cost per booking (done, 26 Aug 2026)

A previous session had already built campaign spend entry and cost per lead / cost per
closed deal. Two numbers were missing, and they are the ones an agency can act on:

- **Cost per appointment** — the report already counted appointments and never priced them.
- **Cost per booking** — there was no concept of a booking here at all.

**Why cost per closed deal is not enough.** In project sales a booking is followed by SPA
signing, loan approval and completion: six to eighteen months. Cost per closed deal is
therefore a verdict on advertising paid for last year and cannot inform this month's
budget. The booking happens within weeks of the lead and is the earliest point at which
money is genuinely committed, so it is the fastest honest read on whether a campaign
works. Cost per closed deal stays — it is the eventual truth, and it is what resale runs on.

Two details that were easy to get wrong and are now covered by tests:

- **Counting is per LEAD, not per appointment.** A lead with two appointments counts as
  one appointment-producing lead, and a lead with two booked appointments as one booking.
  A campaign that bought one buyer who booked twice bought one booking's worth of business.
  The funnel on `/reports` counts the same event at the *appointment* grain, because it is
  describing what happened to appointments — so the two figures can legitimately differ,
  and neither should be "fixed" to match the other.
- **Attribution follows the lead and its converted contact.** A booking made against the
  contact a lead became still counts for the campaign that bought the lead.

Spend with no matching leads still appears as its own row, flagged, rather than as a cost
per booking of infinity — money out with nothing in is the most useful line on the report.
Managers and admins only; agents never see agency ad spend.

---

## On leaderboards, revisited for the setter/closer model

The existing leaderboard ranks on won value, managers and admins only. Under a
setter/closer split it needs rethinking before it is made more prominent, because
the failure modes get sharper:

- **Ranking on closings punishes setters.** A setter who books excellent
  appointments and hands them over has nothing to show on a closed-value board. That
  is precisely the person you least want to demoralise.
- **It fights the pass-on rule in 2.2.** If rank depends on closings, letting a lead
  pass to a better-placed colleague costs you personally. The board would be
  actively working against the routing.
- **Perpetual bottom placement is corrosive.** Someone is always last, and if it is
  the same person monthly it is a public notice of failure, not a motivator.
- **Earnings visibility is sensitive.** Won value is close to disclosing colleagues'
  income to each other.

**Recommendation:** rank setters and closers on their own metrics — appointments set
and show-up rate for setters, close rate for closers — never on a single combined
board. Keep it a management tool where it is today, and give each agent a private
view of their own trend: this month against last, their activity against their own
average. Most of the motivational effect, none of the side effects. Revisit after a
quarter of real use.

---

## Suggested sequence

**This week** — Phase 0, then 1.1. Projects and unit types unblock everything else.

**Weeks 2–3** — the rest of Phase 1: 1.3 (separate pipelines) and 1.5 (ownership across
setter and closer). At the end of it the system represents your actual business, and
agents can be onboarded onto it.

**Week 4–5** — Phase 2. Meta intake first, then pass-on. Hold WhatsApp Cloud API
until the Meta business verification is started, since the lead time is out of your
hands.

**Month 2–3** — Phase 3, once there are real bookings to model commission against.

**After that** — driven by what the agency is struggling with, not by this document.

## A note on sequencing

The temptation from a competitor demo is to start with the WhatsApp flow builder,
because it is the most impressive thing on screen. Resist it. It is the most
expensive item here, it carries approval risk you do not control, and it needs a
funnel underneath it to be worth anything.

The temptation from a principal is to start with commission reporting. Resist that
too, slightly. It needs real transactions to design against, and Phase 1 is what
produces them.

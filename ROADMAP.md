# PropertyAgent CRM — product roadmap

Written from the agency's point of view: what makes agents faster, what makes the
principal money, and what keeps the firm out of trouble. Every item is checked
against what the code already does, so nothing here proposes rebuilding something
that exists.

Effort estimates assume the current stack (Next.js, Drizzle, Supabase, Cloudflare
Workers) and one developer.

---

## Already built — don't rebuild

Worth stating plainly, because these come up as feature requests:

| Asked for | Status |
|---|---|
| Agent leaderboard | Exists on `/reports`. Managers and admins only; returns empty for agents |
| Agents see only their own records | Enforced in the data layer via `ownershipFilter`, not just hidden in the UI |
| Managers see the whole team | Yes — reports, reminders and lists all switch scope by role |
| Duplicate lead merging | Lead intake dedupes by phone or email, including CSV import |
| Round-robin lead assignment | Implemented, in a transaction |
| WhatsApp from a record | Click-to-chat, logged automatically as an activity |
| PDPA export and erasure | Admin-only panel on each contact |
| 24-month retention purge | `scripts/purge-stale-leads.ts`, scheduled monthly |

---

## Phase 0 — Finish the launch (before agents are onboarded)

Not features. The things standing between "deployed" and "in use".

| Item | Why | Effort |
|---|---|---|
| Restore test green | An untested backup is not a backup | 15 min |
| Rotate credentials | Several were shared in chat during setup | 45 min |
| Real domain + Clerk production keys | Dev keys are not for real users; agents need a proper URL | 2–3 h |
| Image resize on upload | 3–5 MB phone photos × 8 per listing is slow on mobile data and expensive to store | 2 h |
| Screenshots in the user guide | The guide is written; figures are placeholders | 1 h |
| Drizzle upgrade | Open SQL-injection advisory in 0.36.4 | 1–2 h |

---

## Phase 1 — The daily loop (highest value per hour spent)

These make an agent's day measurably faster. Ordered by value.

### 1.1 Buyer ↔ listing matching — **the biggest win available**

Every lead already carries `interest`, `budgetMin`, `budgetMax` and
`preferredAreas`. Every property carries `askingPrice`, `state`, `area`,
`propertyType` and `status`. Nothing joins them.

Add:

- **On a contact:** "Matching listings" — active properties inside the budget range,
  in a preferred area, of a matching type.
- **On a property:** "Interested buyers" — the reverse.
- **On a new listing:** a list of contacts to call today.

This is the work agents currently do from memory or a spreadsheet, and every input
already exists. Start crude — budget ±10%, area string match — because even a rough
match beats recall.

*Effort: 1–2 days. No schema change.*

### 1.2 Viewing scheduler

`viewing` is already an activity type, but there is no calendar. Viewings are the
unit an agent's week is built from.

- Schedule a viewing against a contact and a property together
- Day and week views, with the agent's own viewings
- Automatic WhatsApp reminder to the client the day before
- Outcome recorded afterwards: interested / not / offer made

*Effort: 3–4 days. Needs a `viewings` table, or an extension of `activities`.*

### 1.3 WhatsApp templates

The plumbing exists; every message is still typed from scratch. Saved templates with
placeholders — `{name}`, `{property}`, `{price}` — for viewing confirmations,
follow-ups and new-listing alerts.

`message_templates` **already exists in the schema and is unused.**

*Effort: 1 day.*

### 1.4 Duplicate client detection across agents

Two agents unknowingly working the same buyer is a commission dispute waiting to
happen — and the most common source of internal conflict in an agency.

Lead intake already dedupes by phone and email. Surface the same check when an agent
creates a contact: "This person is already assigned to Siew Ling." Show the owner's
name only, not their client's details.

*Effort: half a day.*

---

## Phase 2 — What the principal cares about

Phase 1 helps agents. This phase is about running the business.

### 2.1 Commission tracking and co-broke splits — **the number that matters**

Deals carry a value, but nobody is paid the transaction price. Missing:

- Gross commission (percentage or fixed)
- Agency / agent split
- Co-broke share with an outside agency, and which side you are on
- Override to a team leader, if the agency works that way
- Invoiced / received / outstanding

`/reports` currently shows "won value", which no one takes home. Commission earned,
paid and outstanding is what a principal actually wants on a Monday morning.

*Effort: 3–4 days. New `commissions` table linked to deals.*

### 2.2 Lead source ROI

Every lead already records `utmSource`, `utmMedium` and `utmCampaign`. Add monthly ad
spend per campaign and you can report:

- Cost per lead by channel
- Cost per **closed deal** by channel — the number that decides budgets
- Conversion rate by source

This answers "should we keep paying for Facebook?" with evidence. The lead-side data
is already being captured; only spend is missing.

*Effort: 2 days.*

### 2.3 Transaction document management

`documents` and R2 storage exist, used only for property photos. The paperwork that
actually stalls deals — booking form, SPA, loan approval, tenancy agreement — has
nowhere to live.

- Attach documents to a **deal**, not just a property
- A checklist per deal type, so nothing is forgotten
- Deadline dates with reminders (loan approval expiring is the classic)

*Effort: 2–3 days. Mostly reuse.*

### 2.4 Better reporting

Current reports are point-in-time counts. Add:

- Month-on-month trends, not just today's totals
- Time-to-conversion: lead → contact → closed
- Pipeline velocity: how long deals sit in each stage
- Individual agent detail views for one-to-one reviews

*Effort: 2–3 days.*

---

## Phase 3 — Scale and differentiation

Worth it once the agency is genuinely running on the system.

### 3.1 Portal syndication (PropertyGuru, iProperty, Mudah)

Agents currently enter every listing twice or more. Even a formatted export per
portal saves hours a week; a proper API integration saves more but costs
correspondingly.

Start with export. Measure the time saved before committing to integrations.

*Effort: 2 days for export; weeks for real integrations.*

### 3.2 Client portal

A link a client can open to see shortlisted properties, upcoming viewings and their
transaction status. Reduces "any update?" messages, and looks professional.

*Effort: 1–2 weeks. Needs its own authentication model — a client must never touch
agent accounts.*

### 3.3 Teams

`teamId` is already in the schema and `canEdit` already honours it, but nothing sets
it. If the agency grows past one working group, teams are closer than they look.

*Effort: 2–3 days to finish what is started.*

### 3.4 Bahasa Malaysia / Chinese

`lib/constants.ts` notes this as an intention: *"All user-facing strings live here
for future i18n (BM / 中文)."* The groundwork is partly there.

Decide early. Retrofitting i18n across a grown application is painful, and the
decision gets harder every month.

*Effort: 3–4 days if done soon; considerably more later.*

---

## On leaderboards — a considered view

You already have one. Before making it more prominent, some things worth weighing,
because leaderboards are the classic example of a feature that works right up until
it doesn't.

**What they do well.** Sales is lonely work with slow feedback. A visible scoreboard
gives it rhythm and makes effort feel recognised. Strong performers like being seen.

**What goes wrong.**

- **Ranking on closed value alone rewards luck and seniority.** One bungalow sale can
  outweigh a quarter of solid work on RM 400k condos. New agents see an unreachable
  gap and disengage — the people the board is meant to motivate are the ones it
  demoralises.
- **It encourages lead hoarding.** If rank depends on closings, sharing a lead with a
  better-suited colleague costs you. That's the opposite of what an agency wants.
- **Perpetual bottom placement is corrosive.** Someone is always last. If that is the
  same person every month, the board is not motivating them; it is a weekly public
  notice of their failure.
- **Earnings visibility is sensitive.** Won value is close to disclosing colleagues'
  income to one another.

**How to do it well, if you want it front and centre:**

1. **Rank on activity as well as outcomes.** Viewings conducted, follow-ups made on
   time, response speed to new leads. These are within an agent's control, reward the
   behaviour that produces sales, and give a newcomer a way to place well in month
   one.
2. **Show improvement, not just absolutes.** "Most improved this month" alongside
   "most closed" gives everyone a reachable target.
3. **Consider showing each agent their own rank privately**, with only aggregate
   team performance shown publicly. Most of the motivational benefit, little of the
   humiliation.
4. **Keep the current role restriction.** Managers and admins see the full board;
   agents see their own numbers. That is already how it works, and it is a reasonable
   default.
5. **Watch what it does to behaviour.** If agents start guarding leads or disputing
   assignments after it becomes prominent, that is the board talking — turn it down.

My honest recommendation: keep it as a **management tool** where it is today, and add
an agent-facing view of *their own* trend — this month against last, activity against
their own average. Same motivational effect, none of the side effects. If the
principal specifically wants public rankings, use activity metrics rather than closed
value, and revisit after a quarter.

---

## Suggested sequence

**Next 2 weeks** — Phase 0. Get it safely live and in agents' hands.

**Month 1–2** — Phase 1.1 (matching) and 1.3 (templates). Both are quick, both are
felt daily, and both use data you already hold. Let agents use the system properly
before building more.

**Month 3** — Phase 1.2 (viewings) and 1.4 (duplicate detection), once real usage has
shown how agents actually work. Some of this roadmap will look wrong by then, which
is the point of waiting.

**Month 4+** — Phase 2, starting with commission tracking. By then there is real deal
data to model against, which makes the design much easier to get right.

**Later** — Phase 3, driven by what the agency is actually struggling with rather
than by this document.

---

## A note on sequencing

The temptation is to build Phase 2 first, because commission and ROI reporting are
what the principal asks for. Resist it slightly. Those features need real data to be
worth anything — a commission report over three test deals tells you nothing, and
designing it before you have seen real transactions means designing it twice.

Phase 1 generates that data by making the system worth using daily. Get agents living
in it first.

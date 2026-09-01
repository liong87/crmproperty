# ZIEN CRM — what it does, what it costs, and what is worth copying

Source: a 38-minute ZIEN sales webinar recording (`references/2026-09-01 21-15-16.mp4`),
reviewed 1 Sep 2026 by extracting and reading frames. Everything below is from their own
slides, so read it as their pitch rather than as verified fact.

---

## What ZIEN is

A Malaysian property-agency CRM sold per seat per month, aimed squarely at new-launch
teams that recruit downlines and run their own Facebook lead ads. Their navigation:

- Dashboard
- Working Leads
- Appointment / Master Leads
- Leads Capture
- Report
- WhatsApp Bot
- Learning Hub
- Collaborator
- My Team
- Settings / Support / Admin Panel

Their slides are built as BEFORE / WITH ZIEN pairs — 02 Sequence, 05 Appointment
("Passed-out appointments went dark"), 08 WhatsApp Flow, 10 Learning Hub — which tells you
which pains they believe close the sale.

## What it costs

Per user, per month:

| Tier | Price |
|---|---|
| Newbie | Free |
| Top Sales | RM 99 |
| Ads Manager (marked "popular") | RM 159 |
| Team Leader | RM 199 |

Extra WhatsApp number RM 25 each, up to 3.

**For our five people that is roughly RM 795–995 a month, or RM 9,500–12,000 a year**,
recurring, with our data in their system.

---

## The seven gaps against what we have

### 1. Collaborator — send a lead OR an appointment out, and get status back
Their strongest idea. You pass a lead or a booked appointment to an agent outside your
team, and their outcome flows back to you. Their own slide names the pain exactly:
"Passed-out appointments went dark."

We have pass-on within the agency. We have nothing for an outside agent.

**Worth building.** This is real co-broke, it matches how the agency actually works, and
it connects to commission (a co-broke party already exists in `deal_commission_splits`).

### 2. Downline tree, five levels deep, with per-member funnels and training progress
The flagship of their RM 199 tier.

**Not worth building for us.** It is valuable to an agency whose business is recruiting
recruiters. We are five people who all know each other; building this is building the
demo, not the business.

### 3. Master lead pool that agents pull from
Ours pushes: rotation assigns a lead to the next agent. Theirs also lets an agent pull an
unclaimed lead from a shared pool.

**Worth considering, small.** It suits quiet periods and hungry agents. It is a variation
on the pool we already have, not a new subsystem.

### 4. Per-creative ads funnel with contact rows inline
Not "Facebook brought 40 leads" but "this image, this copy, this ad set brought these 12
people, and here they are, click to open". Spend and cost-per-booking sit next to the
names.

**Worth building.** We already ingest Meta lead ads and already have the funnel report.
The missing pieces are the creative/ad-set identifiers on the lead and spend per creative.
This is the feature that changes what gets spent next month.

### 5. No-code WhatsApp flow builder
Drag-and-drop message sequences with branching.

**Not now.** Large surface, and WhatsApp Business API approval is its own project. A few
hard-coded templates cover most of the value.

### 6. Learning Hub
Training videos with per-agent completion tracking.

**Not now.** Real value for a recruiting agency onboarding strangers; near zero for five
people in one room.

### 7. Conditional routing sequences
Route a lead by answer, budget, or project.

**Later.** Our rotation plus the pass-on rules already cover the common cases.

---

## Recommendation

Do not buy. RM 9.5k–12k a year for five seats is more than this agency should pay for
software it would then not own, and two thirds of what they charge for is downline and
training machinery for an organisation shaped differently from ours.

Build three things, in this order:

1. **Collaborator / outside co-broke** — pass a lead or appointment to an external agent
   and see the outcome come back. Closes the loop we already know goes dark.
2. **Per-creative ads funnel** — creative and ad-set on the lead, spend beside it,
   contacts listed inline. Directly changes ad spend decisions.
3. **Pull-from-pool** — small addition to the pool we already have.

Leave the downline tree, the WhatsApp flow builder, the Learning Hub and conditional
routing. Revisit only if the agency starts recruiting in volume.

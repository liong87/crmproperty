# PropertyAgent CRM — test script

Work top to bottom. Each case is self-contained: **Do**, then **Expect**. Mark P or F.

Where a case says *why this matters*, it is flagging something that was either a real bug
or an easy thing to get subtly wrong — those are the ones worth reading before clicking.

Anything that fails: note the case number and what you actually saw. That is enough for
me to work from.

---

## Setup

### S1 — Point at a local database
**Do:** create `crm/.env.local` containing exactly:
```
DATABASE_URL="postgresql://postgres:localdev@127.0.0.1:5433/propertyagent"
DIRECT_DATABASE_URL="postgresql://postgres:localdev@127.0.0.1:5433/propertyagent"
DB_SSL="disable"
```
**Expect:** file exists. Nothing else changes.
**Why this matters:** `.env` points at your live Supabase. Without this, every command
below runs against production.

### S2 — Make yourself the admin
**Do:** in `scripts/seed.ts`, change `aisyah@agency.my` to the email you sign in to Clerk
with.
**Expect:** one line changed.
**Why this matters:** sign-in links to a staff row **by email**. No match means you arrive
inactive and are stuck on `/pending`.

### S3 — Bring it up
**Do:** with Docker Desktop running:
```
pnpm install
pnpm db:local:up
pnpm db:migrate
pnpm seed
pnpm dev
```
**Expect:** migrate reports 13 migrations. Seed prints what it loaded. Dev serves
http://localhost:3000.
**If seed refuses:** it is telling you `DATABASE_URL` is not local. Fix `.env.local` —
do not override the guard.

### S4 — Sign in
**Do:** open http://localhost:3000 and sign in.
**Expect:** you land on the dashboard, not on `/pending`. Nav shows Projects, Leads,
Contacts, Properties, Pipeline, Appointments, Reminders, Reports, plus Lead sources,
Templates and Users.

---

## A — Projects and unit types

### A1 — Create a project
**Do:** Projects → New Project. Name, developer, state, area. Set **Developer commission
2.5** and **Pass leads on after 3** days. Save.
**Expect:** the project page opens. Commission reads **2.5%**, not 250 or 0.025.

### A2 — Add unit types
**Do:** on the project, add two unit types. Give the second a **nett price lower than its
list price**.
**Expect:** each row shows the nett price as the headline with the list price struck
through, and a price per sqft.

### A3 — Derived price range
**Do:** go back to Projects.
**Expect:** the card shows a **range** spanning your two unit types, and it uses the
**nett** price where you set one.
**Why this matters:** that range is computed from the unit types, never stored. If it
shows a figure you typed somewhere, something is wrong.

### A4 — Agents cannot edit projects
**Do:** (after G1 gives you a second account) sign in as the agent and open Projects.
**Expect:** no **New Project** button, no Edit or Delete on a project, and the lead pool
is read-only. Projects are agency inventory, not an agent's listing.

---

## B — Lead pool and routing

### B1 — Pool of one warns
**Do:** on the project → Lead pool → add **one** person.
**Expect:** the note says a pool of one has nobody to pass to and the setting does
nothing.

### B2 — Pool of three
**Do:** add two more people.
**Expect:** the note changes to say leads with nothing logged for 3 days pass to the next
person, and that both agents are told.

### B3 — Project leads rotate through the pool
**Do:** Leads → New Lead, three times, each with **Project** set to your project.
**Expect:** assigned to pool member 1, then 2, then 3 — in the order shown in the pool.
Never to somebody outside it.

### B4 — Leads without a project fall back
**Do:** create one lead with **no** project.
**Expect:** still assigned to somebody, but from the agency-wide rotation.
**Why this matters:** this is the pre-existing behaviour and it must keep working.

---

## C — Appointments

### C1 — Book one
**Do:** open a lead → Schedule appointment. Pick the project from the **New launch**
group. Set a date and time. Leave the closer as "I am closing this myself".
**Expect:** saved without error.

### C2 — Board is the default view
**Do:** go to Appointments.
**Expect:** a **board**, not a list. Columns: Scheduled, Showed up, Booked, No show,
Cancelled. A **Schedule** tab switches to the diary.

### C3 — Record a booking
**Do:** on the appointment, Record outcome → **Showed up**, outcome **Booked**. Add a
one-line remark.
**Expect:** the card moves to **Booked**. The remark shows on the card. The lead's
timeline gains a note.

### C4 — Record a no-show
**Do:** book a second appointment, then mark it **No show**.
**Expect:** it moves to the No show column, and the **no-show rate** above the board
becomes 50%.
**Why this matters:** the rate counts only appointments that were kept or missed. A
still-scheduled appointment must not dilute it.

### C5 — Filter by project
**Do:** use the project chips above the board.
**Expect:** the board narrows to that project; "All" restores everything.

---

## D — Funnel and reports

### D1 — The funnel
**Do:** open Reports.
**Expect:** Leads → Appointments set → Showed up → Booked, each bar shorter than the one
above, with a conversion percentage under each. Bars, not a tapered cone.

### D2 — By project
**Expect:** your project listed with its counts. A project with leads but **no**
appointments still appears — that is deliberate; it is the interesting case.

### D3 — The trend
**Expect:** a line chart with three series and a legend. Hovering shows that week's
figures. **View as table** reveals every value.
**Why this matters:** no value should be reachable only by hovering.

### D4 — Per-agent credit
**Expect:** the **By agent** table has a note under the title saying appointments are
credited to whoever set them and bookings to whoever ran the presentation. Verified
properly in G3.

---

## E — Pipeline and deals

### E1 — Two pipelines
**Do:** open Pipeline.
**Expect:** opens on **New launch**, columns **Booked → SPA Signed → Loan Approved →
Completed → Cancelled**. The **Resale** tab shows the old set (New, Contacted, Viewing
Scheduled, Negotiation, Closed Won, Closed Lost).

### E2 — A project deal starts at Booked ← **most important case**
**Do:** open a contact with a project attached and create a deal.
**Expect:** it appears on the **New launch** board in **Booked** — not in the resale
"New", and not on the Resale board.
**Why this matters:** this is the one path I could not test automatically, because it
needs a real signed-in session. If anything in this script is broken, I would bet on this.

### E3 — Boards do not leak
**Do:** create a resale deal too (a contact with a property, no project).
**Expect:** each deal appears on exactly one board.

---

## F — Paperwork

### F1 — The checklist is created automatically
**Do:** on the New launch board, click **Paperwork** on your project deal.
**Expect:** eight items already there — Booking form, Booking fee receipt, IC or passport,
Income documents, Loan application, **Loan approval letter**, SPA signed, Stamping — each
with a suggested due date.

### F2 — Date arithmetic ← **worth checking carefully**
**Expect:** the Booking form (+3 days) reads **"Due in 3 days"**, not 2.
**Why this matters:** counting elapsed time instead of calendar days made every deadline
off by one in both directions. This is the fix; confirm it in a browser.

### F3 — Overdue is loud
**Do:** set the **Loan approval letter** due date to a date in the past.
**Expect:** it turns red and reads "N days overdue", with N matching the calendar days.

### F4 — Ticking and attaching are independent
**Do:** tick any item. Then attach a PDF or image to a **different** item.
**Expect:** the ticked item greys out and strikes through, and the counter moves. The
attached file appears as a link — and **does not tick its item**.
**Why this matters:** somebody still has to confirm the document is the right one. That
is the whole point of a checklist.

### F5 — Open the attachment
**Do:** click the filename.
**Expect:** it opens. (If storage is not configured locally this may fail — note it and
re-check after deploying; see J3.)

### F6 — Add an item by hand
**Do:** add "Developer's confirmation letter".
**Expect:** it appears at the bottom, not marked required.

### F7 — Paperwork on Reminders
**Do:** open Reminders.
**Expect:** a **Paperwork due** card **above** the follow-ups, soonest first, with the
overdue loan approval at the top in red, naming the client and project.

### F8 — Dashboard banner
**Do:** open the Dashboard.
**Expect:** a red banner naming the overdue count. Tick every overdue item and it
**disappears** — it only shows when it applies.

---

## G — Setter and closer (needs a second login)

### G1 — Create a second account
**Do:** sign out. Sign up with a different email (incognito is easiest).
**Expect:** you land on `/pending`. That is correct — new accounts arrive inactive.

### G2 — Activate it
**Do:** sign back in as yourself → Users → activate the new account, leave it as *agent*.
**Expect:** it becomes active.

### G3 — A closer can see what they must close ← **this was a real bug**
**Do:** as admin, book an appointment on one of **your** leads and set the **second
account as closer**. Then sign in as that second account.
**Expect:** they **see** that appointment on their board **and** can record its outcome.
They see nothing else of yours — no other leads, no other appointments.
**Why this matters:** before this fix a closer could record an outcome on an appointment
that was invisible to them.

---

## H — The pass-on sweep (command line)

### H1 — Make a lead look stale
**Do:** pick one project lead you have logged nothing against, and run:
```
docker exec -it propertyagent-db psql -U postgres -d propertyagent -c "UPDATE leads SET assigned_at = now() - interval '30 days' WHERE name = 'YOUR LEAD NAME';"
```
**Expect:** `UPDATE 1`.

### H2 — Dry run changes nothing
**Do:** PowerShell: `$env:PASS_ON_DRY_RUN=1; pnpm passon:leads`
**Expect:** it lists the lead and what would happen. The lead's owner in the UI is
**unchanged**.

### H3 — Real run
**Do:** PowerShell: `Remove-Item Env:PASS_ON_DRY_RUN; pnpm passon:leads`
**Expect:** the lead moves to the **next person in the pool**. Its timeline gains a note
naming both agents.

### H4 — It does not run away
**Do:** run `pnpm passon:leads` again immediately.
**Expect:** moves nothing. The clock resets on transfer.

### H5 — What it must refuse to touch
**Do:** set `assigned_at` back 30 days on: (a) a lead you have logged a call on since,
(b) a lead with an appointment booked, (c) a lead marked qualified, (d) the no-project
lead from B4. Run the sweep.
**Expect:** **none of them move.**
**Why this matters:** this is the part that protects agents. Over-eager pass-on is worse
than none.

---

## I — Cost per booking

### I1 — Agents are refused
**Do:** as the second (agent) account, go to `/reports/spend`.
**Expect:** redirected to Reports. Agency ad spend is not theirs to see.

### I2 — Record spend
**Do:** as admin, Reports → Advertising spend. Record an amount against a campaign name
that some of your leads carry. (Import `samples/leads-with-campaign.csv` or set
`utm_campaign` on a lead if none do.)
**Expect:** the row appears.

### I3 — The four ratios
**Expect:** cost per lead, **cost per appointment**, **cost per booking**, cost per closed
deal. Cost per closed deal reads "—" until something completes, not RM 0.00.
**Why this matters:** "—" means unknown, RM 0 would mean free.

### I4 — Money with nothing to show for it
**Do:** record spend against a campaign name **no lead carries**.
**Expect:** its own row, flagged, with no cost per booking — not an infinite or zero cost.

---

## J — After deploying (Cloudflare only)

Do these only once the local pass is clean. **Run the backup workflow first.**

### J1 — Migrations against Supabase
**Do:** remove `.env.local`, then `pnpm db:migrate`.
**Expect:** applies cleanly. Existing deals stay where they were and default to resale.

### J2 — The app runs on Workers
**Do:** deploy, then walk A1, C1, E2 and F1 on the deployed site.
**Expect:** identical behaviour. Workers is not Node, so this is the real check.

### J3 — File storage
**Do:** attach a PDF to a checklist item and open it.
**Expect:** it uploads and opens via a signed URL.

### J4 — Meta Lead Ads
**Do:** point Meta's webhook at `https://your-domain/api/webhooks/forms/meta`, subscribe
the Page to `leadgen`, and submit a test lead.
**Expect:** the lead appears, assigned, with the campaign name on it, and routed to the
project you mapped in `/lead-sources`.

### J5 — Scheduled jobs
**Do:** GitHub → Actions → **Project lead pass-on** → Run workflow with dry run **on**.
**Expect:** it completes and reports what it would move.

---

## Reporting back

For anything that failed, tell me:

- the case number (e.g. **F2**)
- what you saw instead
- anything in the terminal running `pnpm dev`, if it looked like an error

Cases E2, F2, G3 and H5 are the ones I would most want to hear about — they are either
untested-by-me or were real bugs whose fixes deserve confirming.

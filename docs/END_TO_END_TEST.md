# End-to-end test — step by step

Everything below runs against a **local database on your own machine**. Nothing here
touches Supabase.

---

## Local first, then Cloudflare — not one or the other

Both, in that order, and for different reasons.

**Do the functional pass locally.** It is fast, `pnpm seed` gives you test data safely
(it refuses to run against a remote database), and you can break things without
consequence. If something is wrong, it gets fixed and re-tested in seconds rather than
through a deploy cycle. Steps 1 to 6 below are all local.

**Then deploy and re-check the short list that can only fail there.** Nothing below
substitutes for it:

| Only testable on Cloudflare | Why |
|---|---|
| **Meta Lead Ads** | Meta needs a public HTTPS URL to call. A tunnel (ngrok, Cloudflare Tunnel) works too |
| **The Workers runtime** | OpenNext runs on Workers, not Node. Anything relying on a Node API fails only there |
| **R2 file storage** | Local runs against whatever `.env` points at; signed URLs and uploads are worth one real check — attach a PDF to a checklist item and open it |
| **Scheduled jobs** | The pass-on sweep and the PDPA purge run in GitHub Actions. Both have a "Run workflow" button with a dry-run option |

**Before you deploy**, note that deploying means running migrations against Supabase.
Migrations 0004–0013 are additive — they were tested against a database with existing
rows and nothing already in flight moves — but run the backup workflow first anyway.
It costs nothing and this is the one irreversible step in the whole exercise.

---

## Read this first

Two things about your current setup:

1. **`.env` points at your live Supabase.** There is no `.env.local` yet, so right now
   `pnpm db:migrate` and `pnpm dev` would run against production. Step 1 fixes that.
2. **`pnpm seed` deletes every row** in users, leads, contacts, properties, deals,
   activities and templates before inserting test data. It refuses to run against a
   remote database — that guard is already in the code — but only create `.env.local`
   first and you never have to rely on it.

---

## Step 1 — Point everything at a local database

In the `crm` folder, create a file called **`.env.local`** with exactly this:

```
DATABASE_URL="postgresql://postgres:localdev@127.0.0.1:5433/propertyagent"
DIRECT_DATABASE_URL="postgresql://postgres:localdev@127.0.0.1:5433/propertyagent"
DB_SSL="disable"
```

`.env.local` overrides `.env` for both `pnpm dev` and the scripts, and it is gitignored.
Your Clerk keys stay in `.env` and are picked up automatically — there is no local Clerk,
so sign-in still goes to Clerk's servers, which is fine.

---

## Step 2 — Make yourself the admin

The app links your Clerk login to a staff row **by email**. If your email matches nobody,
you arrive as a brand-new inactive agent and land on `/pending` with no way in.

Open `scripts/seed.ts`, find this line near the top of the users block:

```ts
{ externalAuthId: "seed_admin", name: "Aisyah Rahman", email: "aisyah@agency.my", ... }
```

Change `aisyah@agency.my` to **the email address you sign in to Clerk with**. Leave
everything else alone.

---

## Step 3 — Start the database and load it

Needs Docker Desktop running.

```bash
pnpm install
pnpm db:local:up        # starts PostgreSQL 17 on port 5433
pnpm db:migrate         # applies all 13 migrations
pnpm seed               # loads the 5-person agency + test data
pnpm dev                # http://localhost:3000
```

If `pnpm db:migrate` says something about a pooler, check `.env.local` exists and has
both URLs. If `pnpm seed` refuses to run, it is telling you `DATABASE_URL` is not local —
that is the guard doing its job, so fix `.env.local` rather than overriding it.

`pnpm db:check` prints connection and query timings if anything feels slow.

---

## Step 4 — The walkthrough

Sign in at http://localhost:3000. You should land on the dashboard as an admin.

### 4.1 Create a project

**Projects → New Project.** Fill in name, developer, state, area. Set:

- **Developer commission** — e.g. `2.5`
- **Pass leads on after (days)** — set it to `3`

Save. On the project page, add two or three **unit types** (label, built-up, list price,
and a nett price lower than list).

**Expect:** the project list card shows a price range derived from the unit types — not a
figure you typed anywhere. If you set a nett price it uses that, not the list price.

### 4.2 Build the lead pool

Still on the project page → **Lead pool** → add **two or more** people.

**Expect:** the note under the list changes. With one person it warns that a pool of one
has nobody to pass to; with two or more it tells you the pass-on window is live.

### 4.3 Create leads and watch them route

**Leads → New Lead.** Create three, each with the **Project** field set to your project.

**Expect:** they are assigned to pool members in rotation — first, second, third, then
back to the first. Not all to one person, and never to somebody outside the pool.

Now create one lead with **no project**. **Expect:** it still gets assigned, but from the
agency-wide rotation, so it may go to anyone.

### 4.4 Book an appointment

Open one of those leads → **Schedule appointment**. Pick the project from the
**New launch** group, set a date and time, and leave the closer as "I am closing this
myself".

**Expect:** it appears on `/appointments`, which opens on the **board** by default.

### 4.5 Record outcomes

On the board, use **Record outcome** on the appointment.

- Mark one **Showed up** with outcome **Booked**
- Create and mark a second as **No show**

**Expect:** cards move between the Scheduled / Showed up / Booked / No show columns, the
**no-show rate** above the board updates, and the lead's timeline gains a note for each.

### 4.6 Check the funnel

**Reports.**

**Expect:** the funnel shows Leads → Appointments set → Showed up → Booked with a
conversion percentage on each step; **By project** lists your project with its counts; the
trend chart plots the weeks. A project with leads but no appointments still appears — that
is deliberate, it is the interesting case.

### 4.7 Check the pipeline

**Pipeline** opens on the **New launch** tab.

**Expect:** columns are **Booked → SPA Signed → Loan Approved → Completed → Cancelled**.
Switch to **Resale** and the columns are the old set (New, Contacted, Viewing Scheduled,
Negotiation, Closed Won/Lost). Deals never appear on both.

Create a deal from a contact with a project attached. **Expect:** it starts in **Booked**,
not in the resale "New". *(This is the one path I could not test automatically — it needs a
real signed-in session — so it is worth your attention.)*

---

### 4.8 The paperwork checklist

Open the deal you just created — from the pipeline card, click **Paperwork**.

**Expect:** a checklist already there, created from the project template: Booking form,
Booking fee receipt, IC or passport, Income documents, Loan application, **Loan approval
letter**, SPA signed, Stamping. Each has a suggested due date counted from today.

Then:

- **Tick one item.** It should grey out and strike through, and the counter at the top
  should move.
- **Change a due date** — set the Loan approval letter to a date in the past. Expect it
  to turn red and read "N days overdue".
- **Attach a file** to any item (a PDF or an image). Expect the filename to appear as a
  link. **Note it does not tick the item** — that is deliberate: somebody still has to
  confirm the document is the right one.
- **Add an item by hand** at the bottom, e.g. "Developer's confirmation letter".

*Worth checking the arithmetic while you are here:* an item due in 3 days should say
"Due in 3 days", not 2. That off-by-one was a real bug and the fix is worth confirming
in a browser.

### 4.9 Paperwork shows up where the work happens

Go to **Reminders**.

**Expect:** a **Paperwork due** card above the follow-ups, listing anything due in the
next 14 days plus anything already overdue, soonest first, with the client and project
named. The overdue loan approval from 4.8 should be at the top in red.

Go to the **Dashboard**.

**Expect:** a red banner saying how many documents are overdue. It only appears when
there is something overdue — a permanent "0 overdue" row is furniture people learn to
skip.

### 4.10 Cost per booking

**Reports → Advertising spend** (managers and admins only — an agent is redirected).

Record a spend figure against a campaign. To see the numbers work you need a lead
carrying that campaign name, which means either importing `samples/leads-with-campaign.csv`
or setting `utm_campaign` on a lead directly.

**Expect:** cost per lead, **cost per appointment**, **cost per booking** and cost per
closed deal. Cost per booking is the one to judge a live campaign on — a completed sale
is months behind it.

**Also expect:** a campaign with money recorded but no matching leads appears as its own
row, flagged, rather than showing an infinite cost. That row — money out, nothing in — is
the most useful line on the page.

## Step 5 — The setter/closer split (needs a second login)

This is the change most worth testing, and it needs two accounts.

1. Sign out. Sign up with a **second email** (an incognito window is easiest).
2. You will land on `/pending` — that is correct, new accounts arrive inactive.
3. Sign back in as yourself → **Users** → activate the new account and leave it as *agent*.
4. As admin, book an appointment on one of **your** leads and assign the **second account
   as closer**.
5. Sign in as the second account.

**Expect:** the closer sees that appointment on their board **and** can record its outcome.
Before this change they could record the outcome but the appointment was invisible to them.

**Also expect:** they see nothing else of yours — no other leads, no other appointments.

---

## Step 6 — The pass-on sweep

This normally runs on a schedule. To test it now, you need a lead that looks stale.

With the database running, make one project lead look old:

```bash
docker exec -it propertyagent-db psql -U postgres -d propertyagent -c "UPDATE leads SET assigned_at = now() - interval '30 days' WHERE name = 'PUT THE LEAD NAME HERE';"
```

Then, safely first:

```bash
# Windows PowerShell
$env:PASS_ON_DRY_RUN=1; pnpm passon:leads

# macOS / Linux / git-bash
PASS_ON_DRY_RUN=1 pnpm passon:leads
```

**Expect:** it lists the lead and says what would happen, and changes nothing. Then run
`pnpm passon:leads` without the dry-run flag.

**Expect:** the lead moves to the **next person in the pool**, its timeline gains a note
naming both agents, and running the command a second time moves nothing — the clock resets
on transfer.

**Also worth confirming it does NOT move:** a lead you have logged a call on since it was
assigned; a lead with an appointment booked; a lead marked qualified; a resale lead with no
project. All of those should be left alone.

---

## What you cannot test locally

- **Meta Lead Ads** — needs a public HTTPS URL for Meta to call. Test it after deploying,
  or with a tunnel (ngrok or Cloudflare Tunnel) pointed at `localhost:3000`.
- **WhatsApp sending** — the app only produces click-to-chat links today. See the WhatsApp
  note in the project docs.
- **The scheduled jobs firing on their own** — they run in GitHub Actions. Both have a
  "Run workflow" button in the Actions tab with a dry-run option.

---

## When you are done

Delete `.env.local` (or rename it) to point back at Supabase, then apply the migrations to
production **once you are happy**:

```bash
pnpm db:migrate
```

**Never run `pnpm seed` against Supabase.** It wipes the database. The guard will stop you
unless you deliberately override it — do not override it.

Housekeeping while you are in there:

- Delete the `_to_delete/` folder — scratch files from moving work between machines.
- `git gc --prune=now` — committing through the folder bridge left orphaned `tmp_obj_*`
  files in `.git/objects`. Harmless; `git fsck` is clean.
- `main` is ahead of `origin/main`. Push when you are happy.

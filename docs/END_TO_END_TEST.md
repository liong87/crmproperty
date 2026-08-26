# End-to-end test — step by step

Everything below runs against a **local database on your own machine**. Nothing here
touches Supabase.

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
pnpm db:migrate         # applies all 12 migrations
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

Two housekeeping items while you are in there: delete the `_to_delete/` folder, and decide
whether to commit. The work is on disk and uncommitted.

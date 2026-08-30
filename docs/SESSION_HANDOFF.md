# Handoff — 2026-08-30

Where the work stands. Read `docs/APP_OVERVIEW.md` first if you are new to this
codebase — it is the map, and it lists the decisions that look like omissions but
are not. This file is only "what just happened and what is next".

Everything below is **committed and pushed**. `main` is at `d069938`, working tree
clean.

---

## The state in one paragraph

The CRM is live on Cloudflare Workers against the agency's own Supabase project
(`dgiwxuwjvyfkpxhsicrs`). The Meta Lead Ads path is proven end to end. The commission
engine and the notification layer were built on 30 Aug and are committed but **not yet
deployed** — the live Worker is still running the code from before them.

---

## Built on 30 Aug

### Commission engine — migration 0014, `472d705`

The largest remaining roadmap item, now done. Developer-paid commission, released in
stages, split across agency / setter / closer / co-broke, with every rate configurable
at `/settings/commission` rather than compiled in.

Three design decisions that must not be casually reversed:

- **A deal SNAPSHOTS the scheme when its commission is built.** Editing a scheme later
  changes nothing already agreed. An agent told what a booking would earn them should
  never find it quietly restated. `baseAmount` is stored for the same reason rather
  than read from the deal, whose value can be corrected later.
- **The figures are read-only in the UI.** Correcting one means removing and
  rebuilding. Deliberate friction: silently editable numbers on a commission statement
  are how disputes start.
- **Stages are records with three dates** — expected, invoiced, received — not a status
  field. The paperwork and the money do not move together, and "what is billed, what is
  collected, what is stuck" is the question a principal actually asks.

`server/commission/calc.ts` is pure and tested hard. `allocate()` uses largest-remainder
so parts always sum to exactly the total; three equal shares of 100 cents would
otherwise round to 33 each and lose one. Verified over 8000 allocations.

Verified against PostgreSQL 16: all 15 migrations apply in order and 11 constraint
checks pass, including that soft-deleting a commission frees the deal for a rebuild.

The seeded default (agency 50 / setter 25 / closer 25, released 20/30/30/20) is
deliberately blunt. It is meant to be changed, and an obviously arbitrary default
invites that more than a plausible-looking one.

### Notification layer — migration 0015, `6e467cd`

Built because of a real defect: pass-on wrote a timeline note and called
`messaging.sendFollowUp` to tell both agents — and that is the click-to-chat provider,
which returns a `wa.me` URL and sends nothing. **The code read as though agents were
being notified. They were not.**

`lib/notify` is now the single entry point. In-app row first and always; email
attempted afterwards and allowed to fail.

- **Notifying can never break what triggered it.** A pass-on that throws because an
  email bounced has lost a lead to protect a message about a lead.
- **Email is optional.** With no `RESEND_API_KEY` the row is still written and marked
  `skipped`. The inbox works now; email starts working the day the key is added, with
  no code change. The Resend client was made lazy — constructing it at module scope
  with no key throws.
- **`dedupe_key` names the FACT, not the moment.** `doc-due:<id>:<dueDate>` changes when
  a deadline moves and not otherwise. Without this a nightly job sends one message per
  night per document until somebody turns it off. Enforced by a unique partial index;
  `onConflictDoNothing` turns a repeat into no row.

`/inbox` lists them, scoped to the caller's own rows — the user id comes from the
session, never the request.

### Scheduled notification jobs — `d069938`

`server/notifications/jobs.ts`, run by `pnpm notify:run [daily|digest]`, scheduled by
`.github/workflows/notifications.yml` (daily 08:30 MYT, digest Monday 09:00 MYT).

- **Paperwork chasing.** Once per deadline, and again only if the deadline moves.
  Overdue items are NOT re-chased nightly — a daily nag about something already late
  trains people to ignore the inbox, and it is already red on `/reminders` and the
  dashboard.
- **Appointment reminders**, day before. Setter and closer both told when they differ;
  a Set stops the usual case (one person doing both) being told twice.
- **Weekly digest** to managers and admins, agency-wide — it ignores the ownership
  filters the rest of the app applies, because it is a management summary.
- **Closer assignment** notifies immediately, from `scheduleAppointment` and
  `assignCloser`.

The Malaysian date arithmetic was verified separately, because this is the third time
it has been load-bearing here: "tomorrow" is one exact MYT day as a UTC range, checked
from four awkward moments including 16:30 UTC (already tomorrow in KL) and a year
boundary; the week key lands on the MYT Monday from all seven days of two weeks.

### Earlier the same day

- `472d705`… preceded by the user guide rewrite (`a976fe3`): `/help` in the app,
  role-filtered server-side, plus a rebuilt PDF. The old guide predated the pivot and
  was missing half the product.
- `e2212b4` — `docs/APP_OVERVIEW.md`, written for a reviewer arriving cold.
- `00ded12` — `pnpm bootstrap:admin`, because there was no way to create the first
  admin on an empty database. Used during the Supabase move.

---

## The immediate next action

**Deploy.** `main` is pushed but the live Worker is running pre-30-Aug code, so none of
the above exists in production yet.

1. GitHub → Actions → **Deploy to Cloudflare Workers** → run with **dry_run ticked**.
   That runs `pnpm typecheck` and `pnpm test` and a full OpenNext build on Linux, and
   stops before deploying. (OpenNext does not build on Windows.)
2. Run it again with dry_run unticked.
3. `pnpm db:migrate` for **0014 and 0015** — check whether this has already been run
   locally before assuming.

Also add the GitHub secret **`APP_URL`** =
`https://propertyagent-crm.lanthornrealty.workers.dev`. Without it, notification emails
say "open the CRM" instead of linking to the record. Harmless until email exists.

---

## What is left, in the order I would do it

From Rodney's build brief, with the two Phase 4 items now done:

1. **Configure R2.** Every `S3_*` value is empty, so **no file upload works anywhere** —
   which guts the paperwork checklist's attachment feature. Config only; the adapter and
   the upload code exist. Highest value for the least work.
2. **Fix the email-only lead drop.** `intakeSchema` requires a phone, so a lead form
   without a phone field silently loses every lead it produces — logged at `info`, no
   error, no retry. A live risk on a paid channel.
3. **Clerk production keys.** `SECURITY_REVIEW_2026-08-29.md` item 1, High. Production
   is on `pk_test_`/`sk_test_`. Recreates accounts, so do it deliberately —
   `bootstrap:admin` exists for exactly this.
4. **Resend account** + `RESEND_API_KEY` / `EMAIL_FROM`. Nothing is blocked on it now,
   but it doubles every notification's reach for ten minutes of work.
5. **Ad-spend sync.** Scheduled pull from Meta's Marketing API into `campaign_spend`,
   handling the ~2-day revision window. `ads_management` is already granted and the
   Graph adapter exists. This is the competitor feature from the IQI reel.
6. **Leaderboard rework.** Ranking on closings punishes setters and fights the pass-on
   rule. Shares crediting logic with the commission engine, so it is cheaper now than it
   was.

Deferred deliberately: **WhatsApp Cloud API**. Costed at roughly RM 25/month for the
useful cases plus 3–5 days of build, gated on Meta business verification. The cheaper
first move is Click-to-WhatsApp ads, where the buyer messages first and the free
WhatsApp Business app's own greeting message answers instantly.

---

## Traps this session added to the list

- **The bridge cannot delete files**, so every git command leaves a `.git/index.lock`
  and the next one fails. `device_request_delete_permission` on the repo root fixes it
  for the session, and the grant lapses if the connection drops.
- **`tsc` and `vitest` cannot run through the folder bridge** — the pnpm store's
  symlinks do not resolve. Everything written in a session is unverified until Rodney
  runs `pnpm typecheck && pnpm test`, or CI does. The deploy workflow runs both, which
  is the reliable path.
- **PowerShell, not bash.** `NOTIFY_DRY_RUN=1 pnpm notify:run` fails; it is
  `$env:NOTIFY_DRY_RUN=1; pnpm notify:run`, and clear it afterwards or every later run
  in that window stays a dry run.
- **`.env` points at the PRODUCTION database.** Anything run locally writes to the same
  Supabase the live site uses. There is no separate local database since the migration.

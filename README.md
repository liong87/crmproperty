# PropertyAgent CRM

Lightweight CRM for a 5-person property agency in Malaysia. Lean/free-tier now, architected for painless migration later. Mobile-first (390px baseline). Full spec: `../prompt_crm_v2.md`.

## Status
**Feature-complete for launch; not yet live.** Auth, RBAC, leads, contacts, projects,
properties, appointments, deals, reporting, PDPA export/erasure and the Meta lead-ads
pipeline are all built and tested. What stands between here and agents using it is
operational, not code — see `TOMORROW.md` and `HARDENING_PLAN.md`:

- Clerk is still on **development** keys, which do not work on a real domain
- ~~The backup **restore test** has not been verified~~ — verified 1 Sep 2026 (Restore test #6, green: newest dump fetched from R2, decrypted, restored into a clean PostgreSQL 17, asserted usable). Note it ran against a near-empty database, so re-run it once real client data has accumulated.
- Credentials shared during setup need rotating

Roadmap and the reasoning behind what was built (and deliberately not built) live in
`ROADMAP.md` and `ZIEN_COMPARISON.md`.

## Stack
Next.js 15 (App Router, TS) · Tailwind + shadcn/ui · **Supabase Postgres** (ap-southeast-1) · Drizzle ORM · Clerk auth · Cloudflare R2 storage · Resend email · structured logging · deploy via `@opennextjs/cloudflare`. Package manager: **pnpm**.

## Architecture rule (non-negotiable)
No app code imports an external SDK directly. Everything goes through an adapter in `/lib/*` (`interface.ts` + `[provider]-provider.ts` + `index.ts`). Database-provider specifics live ONLY in `lib/db/client.ts`. This is what makes provider migration a one-file change — it is how the move from Neon to Supabase stayed a one-file change.

## Setup
```bash
pnpm install
cp .env.example .env            # fill in real credentials
pnpm db:generate                # generate migration from schema (already run: 0000_init)
pnpm db:migrate                 # apply to your Supabase database
pnpm seed                       # load Malaysian dev/UAT data — DESTRUCTIVE, see below
pnpm dev                        # http://localhost:3000
```

> `pnpm seed` **deletes every row first**. Never run it against a database holding real
> client records.

## Commands
| Command | Purpose |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js lifecycle |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:generate` / `db:migrate` / `db:push` / `db:studio` | Drizzle |
| `pnpm seed` | Seed dev data |
| `pnpm test` | Vitest |
| `pnpm cf:preview` / `cf:deploy` | Build + deploy to Cloudflare Workers (OpenNext) |

## Layout
```
app/                 Next.js routes (+ globals.css, layout, page)
components/ui/        shadcn primitives
lib/db/               schema.ts · client.ts (DB provider only) · migrations/
lib/auth|storage|email|messaging|monitoring/   adapters (interface + provider + index)
lib/constants.ts      all user-facing strings (i18n-ready)
server/leads/intake.ts   shared createLeadFromIntake pipeline (ALL sources)
server/leads/stale.ts    leads nobody has touched — surfaced, never auto-reassigned
server/reports/          funnel, per-agent breakdown, campaign spend and cost per lead
lib/leadads/             Meta lead-ads adapter (webhook carries a receipt, not the lead)
scripts/seed.ts       Malaysian seed data
types/                shared types (ActionResult, Paginated)
```

## Conventions
TS strict, no `any`. Server actions return `{ success, data? , error? }`. Validate all input with Zod. Server components by default. All PKs UUID, all timestamps `timestamptz` UTC, soft delete via `deleted_at`. Money stored as MYR integer cents. Phones E.164.

## Deployment note
`@opennextjs/cloudflare` + `wrangler` are dev/deploy-only and are not imported by app
code. The app is deployed to Cloudflare Workers (free plan) — see `TOMORROW.md`.

## PDPA
Consent is captured on intake (`consent_given_at` + `consent_source`) and never
manufactured: a CSV row with no consent column imports, but is counted and reported
rather than stamped as consented. Per-contact export and hard erasure are built
(admin only), and `scripts/purge-stale-leads.ts` hard-deletes unconverted leads after
24 months on a monthly schedule.

Two PDPA questions remain open: whether client data may sit in Singapore, and whether
a read audit trail is required. Both are in `HARDENING_PLAN.md`.

## Next
`ROADMAP.md` — sequenced, with effort estimates and what is deliberately parked.

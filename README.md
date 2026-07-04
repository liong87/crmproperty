# PropertyAgent CRM

Lightweight CRM for a 5-person property agency in Malaysia. Lean/free-tier now, architected for painless migration later. Mobile-first (390px baseline). Full spec: `../prompt_crm_v2.md`.

## Status
**Phase 0 complete** — scaffold, adapters, full schema, seed script, first migration. No auth/UI yet (Phase 1+).

## Stack
Next.js 15 (App Router, TS) · Tailwind + shadcn/ui · Neon Postgres · Drizzle ORM · Clerk auth · Cloudflare R2 storage · Resend email · Sentry · deploy via `@opennextjs/cloudflare`. Package manager: **pnpm**.

## Architecture rule (non-negotiable)
No app code imports an external SDK directly. Everything goes through an adapter in `/lib/*` (`interface.ts` + `[provider]-provider.ts` + `index.ts`). Neon-specific code lives ONLY in `lib/db/client.ts`. This is what makes provider migration a one-file change.

## Setup
```bash
pnpm install
cp .env.example .env            # fill in real credentials
pnpm db:generate                # generate migration from schema (already run: 0000_init)
pnpm db:migrate                 # apply to your Neon database
pnpm seed                       # load Malaysian dev/UAT data
pnpm dev                        # http://localhost:3000
```

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
lib/db/               schema.ts · client.ts (Neon only) · migrations/
lib/auth|storage|email|messaging|monitoring/   adapters (interface + provider + index)
lib/constants.ts      all user-facing strings (i18n-ready)
server/leads/intake.ts   shared createLeadFromIntake pipeline
scripts/seed.ts       Malaysian seed data
types/                shared types (ActionResult, Paginated)
```

## Conventions
TS strict, no `any`. Server actions return `{ success, data? , error? }`. Validate all input with Zod. Server components by default. All PKs UUID, all timestamps `timestamptz` UTC, soft delete via `deleted_at`. Money stored as MYR integer cents. Phones E.164.

## Deployment note
`@opennextjs/cloudflare` + `wrangler` are dev/deploy-only and are not imported by app code. They were omitted from the sandbox verification install due to a blocked pre-release transitive dependency; add them back with `pnpm add -D @opennextjs/cloudflare wrangler` when deploying (pin to a published stable version).

## PDPA
Consent captured on intake (`consent_given_at` + `consent_source`). Export/hard-delete endpoints and 24-month unconverted-lead purge land in Phase 5.

## Next (Phase 1)
Clerk middleware + `/sign-in`, user sync to `users` table on first login, RBAC enforced in server actions. See phase plan in the master spec.

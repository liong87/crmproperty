# Setup & Deployment Guide

Two phases: **(A) run it locally** to prove it works, then **(B) deploy to Cloudflare**.
Do A completely before B. Everything maps to variables in `.env.example`.

---

## Accounts you'll create (all have free tiers)
| Service | Used for | Needed for local? |
|---|---|---|
| **Neon** | PostgreSQL database | ✅ yes (required) |
| **Clerk** | Login / auth | ✅ yes (required) |
| **Cloudflare** | R2 file storage + Workers hosting | R2 only if testing property image uploads; Workers for deploy |
| **Resend** | Sending email | optional (only if you use email) |
| **Sentry** | Error monitoring | optional |

You do NOT need paid plans to start.

---

## A. Run locally

### 1. Install tools
- Node.js 20+ and pnpm (`npm install -g pnpm`).
- In a terminal: `cd crm` then `pnpm install`.

### 2. Neon (database) — required
1. Sign up at neon.tech, create a project (pick Singapore region — closest to Malaysia).
2. Copy the connection string (starts `postgresql://...`).
3. Put it in `.env` as `DATABASE_URL`.

### 3. Clerk (login) — required
1. Sign up at clerk.com, create an application.
2. From API Keys, copy the **Publishable key** and **Secret key**.
3. In `.env` set:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - leave the sign-in/up URL vars as-is.

### 4. Create `.env` and load data
1. `cp .env.example .env` and fill in the values above. (R2/Resend/Sentry can stay as placeholders for now — property image upload just won't work until R2 is set.)
2. `pnpm db:migrate`  → creates all tables.
3. `pnpm seed`        → loads sample Malaysian data (5 staff, properties, leads).
4. `pnpm dev`         → open http://localhost:3000

### 5. Make yourself an admin (important)
New sign-ups default to the **agent** role. Two options:
- **Easiest:** when you sign up in the app, use the email **aisyah@agency.my** (a seeded admin). On first login the app links your account to that admin row automatically.
- **Or:** sign up with any email, then in Neon's SQL editor run:
  `UPDATE users SET role = 'admin' WHERE email = 'you@example.com';`

That's a working CRM on your laptop. Test leads → qualify → deals → reports.

---

## B. Deploy to Cloudflare (when local works)

### 6. R2 storage (for property photos)
1. In the Cloudflare dashboard → R2 → create a bucket (e.g. `propertyagent-docs`).
2. Create an R2 API token (S3 credentials). Copy Access Key ID + Secret.
3. Fill `.env`: `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`.
   (`S3_REGION=auto`.)

### 7. (Optional) Resend email + Sentry
- Resend: sign up, add/verify a sending domain, copy API key → `RESEND_API_KEY`, set `EMAIL_FROM`.
- Sentry: create a project, copy the DSN → `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`.

### 8. Add the deploy tooling
These were left out of the build to keep the sandbox install clean:
```
pnpm add -D @opennextjs/cloudflare wrangler
```
Then `npx wrangler login` (opens browser to authorise your Cloudflare account).

### 9. Set production secrets
Put every `.env` value into Cloudflare as Worker secrets/vars (via `wrangler secret put NAME` or the dashboard). Never commit `.env`.

### 10. Migrate the production database & deploy
1. Point `DATABASE_URL` at your Neon prod branch and run `pnpm db:migrate`.
2. `pnpm cf:deploy` (runs the OpenNext build + deploy).
3. In Clerk, add your deployed domain to the allowed origins.

### 11. Recurring jobs
- Set up a monthly cron (e.g. GitHub Actions) to run `pnpm purge:leads` (PDPA 24-month retention).
- Weekly `pg_dump` backup to R2 (see master spec Backup Strategy).

---

## Not built yet (see SESSION_LOG)
Public lead-capture endpoints (`POST /api/public/leads`, form webhooks, CSV import). The shared
intake pipeline exists (`server/leads/intake.ts`); only the HTTP entry points remain. Ask to build these next.

## Quick reference — order of operations
Neon → Clerk → `.env` → `db:migrate` → `seed` → `dev` → (make admin) → R2 → deploy tooling → secrets → `cf:deploy`.

---

## Option: Vercel first (testing), Cloudflare later (production)

The app is standard Next.js, so it runs on Vercel with **no code changes** and no OpenNext/wrangler.
Good for a free test/UAT URL now; move to Cloudflare when it becomes a live commercial tool.

> Note: Vercel's free **Hobby** plan is **non-commercial only**. Fine for genuine testing with no
> revenue; once it's a production business tool, use Cloudflare (Workers Paid ~$5/mo) or Vercel Pro ($20/mo).

### Deploy to Vercel (testing)
1. Push the `crm/` folder to a GitHub repo (do NOT commit `.env` — it's gitignored).
2. vercel.com → New Project → import the repo. It auto-detects Next.js (root = `crm`).
3. Project → Settings → Environment Variables: add every key from your `.env`
   (DATABASE_URL, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, the S3_* R2 keys,
   RESEND_API_KEY, PUBLIC_LEAD_API_KEYS, etc.).
4. Apply DB migrations to Neon (same cloud DB): locally run `pnpm db:migrate` with the prod DATABASE_URL.
5. Deploy. Then in the Clerk dashboard add your `*.vercel.app` domain to allowed origins.
6. Update the sample lead form's ENDPOINT to your Vercel URL to test capture in production.

### Move to Cloudflare (production, when ready)
- Follow section B above: `pnpm add -D @opennextjs/cloudflare wrangler`, set secrets, `pnpm cf:deploy`.
- Same Neon DB and Clerk app carry over — just point the new domain in Clerk and update form ENDPOINTs.
- Check bundle size vs the 3 MB free-Worker limit; upgrade to Workers Paid ($5/mo) only if needed.

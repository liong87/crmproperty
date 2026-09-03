# Moving the CRM to crm.lanthornproperties.com

Order matters. Each step below leaves the app **working** — the `workers.dev` URL keeps
serving throughout, so there is no window where leads stop arriving.

The rule that governs the whole thing: **`APP_URL` and the Meta redirect URI must always
agree.** The code builds the redirect from `APP_URL`, and Meta compares it character for
character with Strict Mode on. Change one without the other and every Facebook connect
dies with "URL blocked".

---

## 0. Today — verify the ICANN email

Check `lanthornrealty@gmail.com` for a verification email from Cloudflare/ICANN and
click it. **If it is not clicked within 15 days the domain is suspended** — and that
would take down the CRM, the login and the Meta webhook at once. This is the only step
with a deadline.

## 1. Point the domain at the Worker

Workers & Pages → **propertyagent-crm** → Settings → **Domains & Routes** → Add →
**Custom Domain** → `crm.lanthornproperties.com`.

Cloudflare creates the DNS record and the TLS certificate itself. Give it a few minutes,
then open `https://crm.lanthornproperties.com` — you should get the sign-in page.

Nothing has broken at this point: both hostnames now serve the same Worker, and Meta is
still pointing at the old one.

## 2. Meta: ADD the new redirect URI, do not replace it yet

Meta console → Facebook Login for Business → Settings → **Valid OAuth Redirect URIs**.

Add, keeping the existing one:

```
https://crm.lanthornproperties.com/api/auth/facebook/callback
```

Two entries is fine and is what makes the switch safe — either hostname works while you
cut over.

## 3. Switch APP_URL and deploy

```powershell
npx wrangler secret put APP_URL
```

Value:

```
https://crm.lanthornproperties.com
```

No trailing slash. Then deploy.

**Test immediately:** Leads capture → Disconnect → Add → tick Comfy Living. If it
connects, the pair is correct. If you get "URL blocked", the two strings do not match —
compare them character by character before changing anything else.

## 4. The rest of the Meta URLs

Only once step 3 is confirmed working.

| Where | New value |
|---|---|
| Settings → Basic → **Deauthorize Callback URL** | `https://crm.lanthornproperties.com/api/auth/facebook/deauthorize` |
| Settings → Basic → **Data Deletion Request URL** | `https://crm.lanthornproperties.com/api/auth/facebook/data-deletion` |
| Webhooks → Page → **leadgen** callback URL | `https://crm.lanthornproperties.com/api/webhooks/forms/meta` |

The webhook also needs a **verify token**, which is still not set:

```powershell
npx wrangler secret put META_VERIFY_TOKEN
```

Invent any random string, paste the same one into Meta's webhook form, deploy, then
click Verify and Save there. The handshake fails without it, and Meta will not save the
subscription.

Then remove the old `workers.dev` redirect URI from step 2 — leaving a dead hostname
authorised is a small, free thing to tidy.

## 5. Privacy and Terms pages

App Review needs both, reachable without logging in:

```
https://lanthornproperties.com/privacy
https://lanthornproperties.com/terms
```

Put them on the marketing site rather than the CRM — a reviewer should not have to reach
past a login. They also satisfy PDPA, which wants the same things: what you collect
(name, phone, email from lead forms), why, how long you keep it, and how someone asks
for deletion.

## 6. Clerk production — the real upgrade

This is the one that takes you off development keys, and it needs the domain, which is
why it comes last.

1. Clerk dashboard → create a **production instance** for `lanthornproperties.com`
2. Clerk gives you DNS records — a `clerk.` CNAME, an `accounts.` CNAME, and mail
   records. Add them in Cloudflare DNS (same dashboard, one paste each)
3. Wait for Clerk to verify them
4. Swap the Worker secrets to the production keys and deploy

**Do this in one sitting.** Between swapping the keys and deploying, existing sessions
are invalid and everyone has to sign in again — fine at 9pm, disruptive at 11am.

While you are there: Clerk → **Restrictions** → allowlist your five agents' email
addresses, or `@lanthornproperties.com` once you have mailboxes. Right now anyone can
create an account; they land on `/pending` and see nothing, but allowlisting stops the
account existing at all and saves you policing it.

## 7. Email, when you want it

Cloudflare **Email Routing** is free: `rodney@lanthornproperties.com` forwarding to your
Gmail, no mailbox to pay for. Worth doing before Resend, because notification email sent
from a verified `lanthornproperties.com` reaches inboxes and `workers.dev` never would.

---

## What NOT to do

**Do not put Cloudflare Access in front of `crm.lanthornproperties.com`.** It is the
obvious "make it internal only" move and it silently breaks four things that must stay
reachable by machines that will never log in:

- `/api/webhooks/forms/meta` — Meta posts leads here
- `/api/auth/facebook/callback` — where Facebook returns
- `/api/auth/facebook/deauthorize` and `/data-deletion` — App Review checks these
- `/api/public/leads` — your landing pages

Leads would simply stop arriving, with nothing in the CRM to explain it. Clerk already
makes the app internal-only, at the layer that can tell a person from a webhook.

Also leave **Bot Fight Mode off** for this hostname — it can challenge Meta's webhook,
which produces the same silent failure.

## Rollback

If anything goes wrong: set `APP_URL` back to
`https://propertyagent-crm.lanthornrealty.workers.dev`, deploy, and everything works as
it does today. The old redirect URI is still registered in step 2, which is exactly why
it is worth leaving there until the end.

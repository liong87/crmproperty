# Connecting a Facebook Page with the button

What has to be true before "Connect Facebook" on Leads capture works. Roughly twenty
minutes, once.

## 1. Generate an encryption key

```
openssl rand -base64 32
```

This encrypts the Page token before it is stored. **Without it, connecting is refused
rather than storing a token in the clear** — that is deliberate.

## 2. In the Meta App dashboard

Same app that already serves the lead webhook.

- Add the **Facebook Login** product.
- Under Facebook Login → Settings, set **Valid OAuth Redirect URIs** to exactly:

  ```
  https://<your-domain>/api/auth/facebook/callback
  ```

  It must match `APP_URL` character for character — a trailing slash is a mismatch and
  Facebook's error says only "URL blocked", which is not a helpful sentence.
- Note the **App ID** (Settings → Basic). The App Secret is the one already in
  `WEBHOOK_SECRET_META`; the code reuses it unless `META_APP_SECRET` is set separately.

### Permissions

The flow requests `pages_show_list`, `leads_retrieval`, `pages_manage_ads` and
`business_management`.

While the app is in **Development** mode these work for anyone with a role on the app —
which includes you. **You do not need App Review to connect your own Page.** App Review
is only required for the app to work for people outside it, which for a single agency is
never.

## 3. Set the runtime secrets on the Worker

Not in GitHub — these are read at request time:

```
npx wrangler secret put META_APP_ID
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put APP_URL          # e.g. https://crm.example.com
```

`WEBHOOK_SECRET_META` is presumably already set. If not, it is the App Secret.

## 4. Connect

Leads capture → **Connect Facebook** → log in → approve the Pages. You come back to the
CRM with the Page connected and its token encrypted in `connected_pages`.

Then **Import forms from Facebook** to pull in the lead forms that already exist.

---

## What happens under the hood, and why it is three exchanges

1. Facebook returns a `code`.
2. That is exchanged for a **short-lived user token** — about an hour.
3. That is exchanged for a **long-lived user token** — about sixty days.
4. `/me/accounts` is called with the long-lived token, and the **Page tokens it returns
   do not expire**.

Step 3 is the one nobody expects and the one that matters. A Page token derived from a
short-lived user token dies within the hour, so everything works during setup and lead
delivery stops that afternoon for no visible reason. The code treats a failure to extend
the token as fatal rather than carrying on with the short one.

## If several Pages come back

The first is connected and the others are named in the message. Choosing between them
would need a screen that holds the tokens somewhere while you decide — and a token parked
in a session is exactly what the encryption is there to avoid. Reconnect from the account
that administers the Page you want, or say so and a picker can be built properly.

## Rotating or revoking

**Disconnect** on Leads capture soft-deletes the row and blanks the stored ciphertext, so
no usable token is left behind. Reconnecting immediately is fine — the unique index is
scoped to live rows.

If `ENCRYPTION_KEY` is ever lost, the stored token cannot be decrypted. The system falls
back to `META_PAGE_ID` / `META_PAGE_ACCESS_TOKEN` from the environment and reports the
decryption failure, so leads keep arriving while you reconnect.

# Build brief 5 — Leads Capture (Facebook lead forms)

**For:** the Claude session in `C:\Users\weichong.liong\Desktop\Claude\Propertyagent\crm`
**Companion to:** `BRIEF-2-NAV-FILTERS-REMARKS.md`, `BRIEF-4-LEADS-TABLE.md`, `CRM-REVAMP-SPEC.md`

Two goals:

1. An agent connects **their own** Facebook account from inside the CRM, picks their pages, and their lead forms start flowing into Leads automatically.
2. **Each user sees only their own connections.** Rodney's Facebook credentials must be invisible to every other user in the workspace.

ZIEN's version was inspected live and is documented below. Meta's requirements were checked against their current developer docs — but verify them again before you start, because Meta changes this surface often.

---

## Paste this into the desktop session

> Read `BRIEF-5-LEADS-CAPTURE.md` in the repo root.
>
> Start with §1 — tell me exactly what I need to do in the Meta developer console before any code is useful, as a checklist I can work through. Then build §3 (schema) and §4 (OAuth), and stop before the webhook so I can confirm the app is approved.

---

## 1. Prerequisites — read this first

**This is the long pole, and it is not a coding task.** The API needs a Meta app that has passed review, and that takes days to weeks. Nothing below works without it.

Required before a single real lead arrives:

- [ ] A Meta app (Business type) in the Meta developer console
- [ ] **Business Verification** of Lanthorn Realty — legal documents, takes days
- [ ] **App Review** for the `leads_retrieval` permission, which needs a screencast of the actual working flow. Chicken-and-egg: build against test data first, submit the recording, then go live.
- [ ] A public **Privacy Policy URL** and **Terms of Service URL** on our domain
- [ ] A **Data Deletion Request callback** endpoint — Meta requires this, apps get rejected without it
- [ ] A **Deauthorize callback** endpoint — fires when a user removes our app
- [ ] The connecting person must have **ADVERTISE** permission on the Facebook page they're connecting

Permissions to request (confirmed against Meta's current lead-ads docs):

```
leads_retrieval          fetch the lead's field data
pages_show_list          list the pages the user administers
pages_read_engagement    read page content
pages_manage_metadata    subscribe the page to our webhook
ads_management           read the lead forms behind ad campaigns
```

Use **Facebook Login for Business** rather than plain Facebook Login — it's what Meta now expects for this kind of integration and it gives a cleaner business-asset selection screen.

Build and test against Meta's **Lead Ads Testing Tool**, which fires real webhook payloads without spending ad budget.

Do not let this block the rest of the work. Everything in §3–§9 can be built and tested with a manual "simulate a lead" button before approval lands.

---

## 2. What ZIEN's page does

Three columns: **Facebook Form** · **WhatsApp** · **Accounts sidebar**.

The Facebook column lists captures. Each capture is one lead form, with an on/off toggle and an edit pencil. Above them sits **Product Routing**, which is disabled until a capture has a Source assigned — the modal literally says *"No sources linked to captures yet. Go to Lead Captures, edit a capture, and assign it a Source. Then come back here."* That dependency order is worth copying: capture → source → routing rules.

The sidebar shows **Facebook Accounts** — `Rodney Liong · 1 page connected`, then the page (`Comfy Living · 1 form`) with a resync icon — and **WhatsApp Accounts** (`0 of 3`, plan-limited). Under a page with no leads yet: *"Waiting for first lead to confirm delivery."*

### The Edit Capture modal — the important part

```
Edit Capture
KL Property · Comfy Living

ⓘ No previous leads found, so field names are shown without sample values.

FIELD MAPPING
Name *          Full name                              ▾
  Full name
Contact *       Phone number                           ▾
  Phone number
Email           email                                  ▾
  Email

Info fields  extra form fields to capture
[ None yet, click a field below to add                  ]
[ + campaign_name ] [ + adset_name ] [ + ad_name ]

Source
  Lead source   None                                   ▾

┌─ PREVIEW (MASTER LEADS) ─────────────────────────────┐
│  LEAD              │ SOURCE      │ INFO              │
│  John Smith        │ No source   │ —                 │
│  0123456789        │             │                   │
└──────────────────────────────────────────────────────┘

Run Leads Sequence                                  ( ●)
Leads Sequence auto-distributes new leads to your collaborators
using your sequence rules in Master Leads. When off, leads from
this capture stay in Master Leads until you assign them yourself.

[ Cancel ]                            [ Save Changes ]
```

Four things to copy exactly:

1. **Field mapping is per-capture, not global.** Every Facebook form has different field names — the dropdowns are populated from that form's actual schema, pulled from the API.
2. **Sample values from the last lead.** When leads exist, the dropdown shows real values so you can see you've mapped the right field. When none exist it says so, rather than showing blanks with no explanation.
3. **`Info fields` are opt-in tokens** — extra form fields swept into the lead's Info blob. Suggested chips include `campaign_name`, `adset_name`, `ad_name`.
4. **The preview shows the resulting Leads row** before you save. Same pattern as their Assign Lead modal.

And the **Run Leads Sequence** toggle decides whether captured leads auto-distribute to collaborators or sit unassigned. Good default: on.

---

## 3. Schema

```sql
-- One row per connected Facebook (later WhatsApp) account. PRIVATE TO THE USER.
CREATE TABLE capture_account (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL,
  owner_user_id   TEXT NOT NULL,        -- who connected it; the isolation key
  provider        TEXT NOT NULL,        -- 'facebook' | 'whatsapp'
  provider_user_id TEXT NOT NULL,       -- Facebook user id
  display_name    TEXT NOT NULL,        -- 'Rodney Liong'
  token_cipher    BLOB NOT NULL,        -- AES-GCM encrypted long-lived user token
  token_iv        BLOB NOT NULL,
  token_expires_at INTEGER,
  scopes          TEXT,
  status          TEXT NOT NULL,        -- 'active' | 'expired' | 'revoked'
  connected_at    INTEGER NOT NULL,
  last_checked_at INTEGER
);

CREATE TABLE capture_page (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL,
  page_id         TEXT NOT NULL,
  page_name       TEXT NOT NULL,
  page_token_cipher BLOB NOT NULL,      -- encrypted page access token
  page_token_iv   BLOB NOT NULL,
  subscribed      INTEGER DEFAULT 0,    -- webhook subscription confirmed
  last_synced_at  INTEGER
);

CREATE TABLE capture (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL,
  page_id         TEXT NOT NULL,
  form_id         TEXT NOT NULL,
  name            TEXT NOT NULL,        -- 'KL Property'
  form_name       TEXT,                 -- 'Comfy Living'
  field_map       TEXT NOT NULL,        -- {"name":"full_name","contact":"phone_number","email":"email"}
  info_fields     TEXT,                 -- ["campaign_name","adset_name"]
  source_id       TEXT,
  run_sequence    INTEGER DEFAULT 1,
  enabled         INTEGER DEFAULT 1,
  last_lead_at    INTEGER,
  created_at      INTEGER NOT NULL
);

CREATE TABLE capture_route (
  id           TEXT PRIMARY KEY,
  capture_id   TEXT NOT NULL,
  priority     INTEGER NOT NULL,
  match_json   TEXT NOT NULL,   -- {"field":"campaign_name","op":"contains","value":"KLCC"}
  product_id   TEXT,
  assign_to    TEXT,
  enabled      INTEGER DEFAULT 1
);

-- Every inbound webhook, for debugging and replay
CREATE TABLE capture_event (
  id           TEXT PRIMARY KEY,
  page_id      TEXT,
  leadgen_id   TEXT,
  form_id      TEXT,
  raw_payload  TEXT,
  status       TEXT,            -- 'received' | 'fetched' | 'created' | 'duplicate' | 'failed'
  error        TEXT,
  lead_id      TEXT,
  created_at   INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_event_leadgen ON capture_event(leadgen_id);
CREATE INDEX idx_account_owner ON capture_account(workspace_id, owner_user_id);
```

---

## 4. OAuth flow

1. **`GET /leads-capture` → "Add" button** → redirect to Facebook's dialog with our app id, redirect URI, the scope list from §1, and a `state` value that is a signed, single-use, 10-minute CSRF token bound to the session.
2. **Callback `GET /api/capture/facebook/callback`** — verify `state`, exchange `code` for a short-lived user token, then immediately exchange that for a **long-lived** one (`grant_type=fb_exchange_token`).
3. **`GET /me/accounts`** with the long-lived user token → the pages they administer, each with its own page access token.
4. Show a **page picker** — checkboxes, not automatic. The user chooses which pages to connect; we never subscribe to everything they happen to administer.
5. For each chosen page: `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` and store `subscribed = 1` only on a confirmed success.
6. **`GET /{page-id}/leadgen_forms`** → create a `capture` row per form, disabled by default, with a best-guess field map the user then confirms in the Edit Capture modal.

### Token handling — non-negotiable

- Tokens are encrypted at rest with AES-GCM via Web Crypto, key from a Worker **secret** (`TOKEN_ENCRYPTION_KEY`). Never a plaintext column, never in KV without encryption.
- Tokens are **never** sent to the browser. No API response may contain a token, not even truncated.
- All Graph API calls happen server-side in the Worker.
- A daily cron checks token validity via `GET /me?fields=id`; on failure set `status = 'expired'` and surface a **Reconnect** button on the page. Do not fail silently — a dead connection means leads are being lost, and that's the worst possible failure for this feature.
- Disconnect calls `DELETE /{page-id}/subscribed_apps`, then deletes our rows.
- Implement the **deauthorize callback** so removal on Facebook's side marks the account revoked here.

---

## 5. Webhook

`GET /api/webhooks/facebook` — verification handshake. Compare `hub.verify_token` against a Worker secret, echo `hub.challenge`.

`POST /api/webhooks/facebook`:

1. **Verify `X-Hub-Signature-256`** — HMAC-SHA256 of the *raw* body with the app secret, compared in constant time. Read the raw bytes before any JSON parsing; re-serialising the body breaks the signature.
2. Return **200 immediately**, then process. Meta retries and eventually disables endpoints that are slow.
3. Payload: `entry[].changes[].value` = `{ leadgen_id, page_id, form_id, adgroup_id, ad_id, created_time }`. Note the payload carries **no lead data** — you must fetch it.
4. Insert a `capture_event` row keyed on `leadgen_id`. The unique index is the idempotency guard — Meta will deliver duplicates.
5. Fetch: `GET /{leadgen_id}?access_token={page_token}` → `field_data: [{ name, values: [] }]`.
6. Map fields per the capture's `field_map`, normalise the phone (strip spaces and dashes, drop a leading `0`, prefix `60`), dedupe on that against existing leads.
7. Apply `capture_route` rules in priority order, first match wins, to set product and assignee.
8. Create the lead with `source_id` from the capture. Write a `kind='system'` remark: *"Captured from {form_name}"*.
9. If `run_sequence`, hand to the sequence rules; otherwise leave unassigned in Leads.
10. On any failure, record the error on `capture_event` and leave it replayable. Add a **Retry** action in the UI for failed events.

---

## 6. Per-user isolation

This is the second half of the request and it needs to be enforced at the query layer, not the UI.

**Rule: a `capture_account` and its pages belong to `owner_user_id`. No other user can read, use, or even enumerate its credentials.**

Implementation:

1. Every query touching `capture_account` or `capture_page` filters on `owner_user_id = session.user_id`. Put this in a helper the routes must call — not an `AND` clause hand-written per query, which is how these leak.
2. No API route accepts an `account_id` from the client without re-checking ownership server-side. Assume the id will be tampered with.
3. Token decryption happens only inside a function that has already checked ownership.
4. **Admins are not exempt for credentials.** An owner/admin may see that a connection exists — display name, page name, status, last lead time — for oversight, but never the token, and they cannot trigger actions using it.
5. **Leads captured through a connection are workspace data, not private data.** They flow into Leads and get assigned normally. Only the *connection* is private. Be careful not to over-scope this and accidentally hide leads from the team.
6. Disconnecting a user (offboarding) must offer a clear choice: revoke and stop the flow, or hand the connection to another user, which requires that user to re-authorise with their own Facebook account. Never transfer a token between users.

Write tests that assert user B gets a 404 — not a 403, which confirms existence — for user A's `account_id` on every capture route.

---

## 7. UI

Match ZIEN's three-column layout, in our design system (`DESIGN-SYSTEM.md`), replacing their blue with our green.

- **Captures column** — search by form name, `Page` and `Connection` filter chips, `+ New`, then the Product Routing entry and the capture list with per-capture toggle and edit pencil.
- **WhatsApp column** — build the shell now, leave it empty with the same "coming soon" honesty ZIEN uses. Don't fake it.
- **Accounts sidebar** — connected account, page count, per-page form count, resync icon, `Add` button. Status dot: green active, amber expired with a **Reconnect** button, grey revoked.
- Empty state before any lead arrives: *"Waiting for first lead to confirm delivery."* Keep that wording — it tells the user the connection is live but unproven, which is exactly the state they're in.
- Add something ZIEN lacks: a **Recent captures** log — last 20 `capture_event` rows with status and a retry action. When leads stop arriving, this is the only page that tells you why.

---

## 8. Product Routing

Only enabled once a capture has a Source. Keep that dependency and keep the explanatory empty state.

Rule shape: `when {field} {contains|equals} {value} → set product {X}, assign to {Y}`. Fields available are the capture's mapped fields plus `campaign_name`, `adset_name`, `ad_name`. Rules fire in order, first match wins, same semantics as the sequence rules in `CRM-REVAMP-SPEC.md` §12.

---

## 9. Acceptance

- [ ] A user can connect their own Facebook account and pick specific pages
- [ ] Tokens are encrypted at rest and never appear in any API response — grep the responses to confirm
- [ ] User B cannot read or use user A's connection; the route returns 404
- [ ] Webhook rejects a request with a bad `X-Hub-Signature-256`
- [ ] A duplicate `leadgen_id` does not create a second lead
- [ ] A lead fired from Meta's Lead Ads Testing Tool lands in Leads with the right product, source and assignee
- [ ] An expired token surfaces a Reconnect button rather than failing silently
- [ ] Failed capture events are visible and retryable
- [ ] `pnpm typecheck` and `pnpm test` pass, **and the page loads in the browser after deploy**

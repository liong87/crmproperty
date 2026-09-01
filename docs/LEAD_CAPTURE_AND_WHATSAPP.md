# How Facebook lead forms and a WhatsApp bot actually work

Written after reviewing ZIEN's "Leads Capture" and "WhatsApp Bot" features. The short
version: **neither is magic, and we already own most of the first one.** What ZIEN sells
is not capability we lack — it is the setup being three clicks instead of an afternoon in
the Meta console.

---

## Part 1 — Facebook lead forms

### The mechanism, whoever builds it

A Facebook or Instagram lead ad opens an **Instant Form** inside the app. The person taps,
their name/phone/email are pre-filled from their profile, they submit. Meta does **not**
send you the answers. What happens is:

1. Meta POSTs a **webhook** to your server. The payload contains a `leadgen_id`, the
   `page_id`, the `form_id` and a timestamp — **no personal data at all**.
2. Your server verifies the payload came from Meta by checking the
   `X-Hub-Signature-256` header against your **App Secret** (HMAC-SHA256 of the raw body).
3. Your server then calls the Graph API — `GET /{leadgen_id}?access_token=…` — with a
   **Page access token**, and *that* returns `field_data`: the actual answers.
4. You map those answers onto a lead and assign it.

The two-step design is deliberate on Meta's part: the webhook is a notification, the Graph
call is the authorised read. It means the token, not the webhook URL, is what protects the
data.

Three things bite everyone:

- The Page token must be **long-lived** and held by a System User, or it expires and leads
  silently stop arriving. This is the single most common failure.
- Your app needs `leads_retrieval` permission and the Page subscribed to the `leadgen`
  field. App Review is required before it works for a Page you do not own.
- Meta requires the webhook to answer **200 within a few seconds**. Fetch-and-process has
  to happen after the response, not before it.

### What we already have

`app/api/webhooks/forms/[provider]/route.ts` — signature verification against
`WEBHOOK_SECRET_META`, the `META_VERIFY_TOKEN` handshake, and the Graph fetch using
`META_PAGE_ACCESS_TOKEN`. **This works.** It was tested end to end with a real test lead.

### What ZIEN has that we do not

Not the pipe — the **onboarding**. In their product you click "Connect Facebook", log in
with Facebook, and pick your Page and form from a dropdown. Behind that button is exactly
the flow above; the difference is that Facebook Login returns the token, so the user never
opens the Meta console, never copies an App Secret, and never pastes a verify token.

Building the same for ourselves means a Facebook Login flow, an app in Live mode with
`leads_retrieval` approved, and a table of connected pages with their tokens. **For a
single agency that connects one Page once, this is not worth building** — Rodney has
already done the console setup, and it does not need doing again.

### What IS worth taking

The part of their Leads Capture worth copying is downstream of the pipe: **which creative
produced the lead**. We are already most of the way there and it is worth being precise
about where the gap actually is. `server/leads/meta-map.ts` stores, on every Meta lead:

    utmCampaign = campaign name (id as fallback)
    utmContent  = ad set name
    utmTerm     = ad name (ad id as fallback)

So the attribution is captured. What is missing is the **spend** side: `campaign_spend`
records what a campaign cost per month, keyed on campaign NAME, which means cost can be
divided per campaign but not per ad set or per creative. Turning "Facebook sent 40 leads"
into "this image cost RM 68 per booking and that one cost RM 310" needs spend pulled per ad
from the Marketing API, not a change to the webhook. That is the real remaining work behind
the ads funnel in `COMPETITOR_ZIEN_2026-09-01.md`.

---

## Part 2 — the WhatsApp bot

### The mechanism

A "WhatsApp bot" is the **WhatsApp Cloud API**. Structurally:

- A **WhatsApp Business Account (WABA)** under a verified Meta Business.
- One or more **phone numbers** registered to it. A number registered to the API can no
  longer be used in the normal WhatsApp app — this surprises people, and it is why ZIEN
  charges RM 25 for each extra number: it is a real per-number cost and commitment.
- Outbound and inbound both go through Meta's servers. Inbound messages arrive as a
  **webhook**, signed the same way the lead webhook is.

The rule that shapes every WhatsApp product:

> You may send free-form messages only within **24 hours** of the customer's last message.
> Outside that window you may send only a **pre-approved template**.

Templates are submitted to Meta and reviewed, typically within a day. Marketing templates
are charged per conversation; service replies inside the 24-hour window are not. So "just
blast our leads on WhatsApp" is not available at any price — the first touch is always a
template, and Meta polices it.

### What a "flow builder" really is

Their drag-and-drop builder is a decision tree over inbound messages: an inbound webhook
fires, the bot looks at where that contact is in the tree, matches the reply against the
current node's options, sends the next message, records the answer. The visual editor is
the product; the engine underneath is a state machine with a `contact → current node` row.

Most of the value comes from about three flows — qualify a new lead, confirm an
appointment, chase a no-show — and those are worth hard-coding long before a builder is.

### What we already have

`lib/messaging/` is an adapter with the interface already defined, and
`wa-link-provider.ts` behind it: today "send WhatsApp" opens a **wa.me deep link** with the
message pre-filled, and the agent presses send from their own phone. That is not a bot, but
it is honest, it costs nothing, it needs no approval, and it keeps the conversation on the
agent's own number where their client expects it.

`.env.example` already reserves `WHATSAPP_CLOUD_API_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`.
The slot for a real provider exists; nothing fills it.

### What it would take

1. Meta Business verification (documents; days to weeks).
2. A WABA and a **dedicated phone number** that leaves normal WhatsApp for good.
3. Templates written and submitted for approval.
4. A `cloud-api-provider.ts` behind the existing messaging interface — send is the easy half.
5. An inbound webhook, plus somewhere to store conversations and each contact's position
   in a flow.
6. A per-conversation cost, forever.

Steps 1–3 are gating and mostly not code. **Recommendation: not yet.** The deep-link
provider covers the daily job for five agents. Revisit when someone is genuinely losing
leads because nobody replied at 11pm — that is the pain the Cloud API is worth paying for,
and until it bites, this is a lot of approval paperwork for a nicer version of a thing that
already works.

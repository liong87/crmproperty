# WhatsApp lead capture — per agent, self-serve

The model: each agent connects **their own** WhatsApp Business account from inside the
CRM, exactly like Facebook. Nobody depends on the agency arranging a number, and an
agent who does not want the feature simply never clicks Add.

The mechanism that makes this possible is **WhatsApp Embedded Signup** — Meta's own
flow, designed for precisely this. The agent clicks Add, a Facebook popup walks them
through creating a WhatsApp Business account and registering a number, and the CRM
receives the credentials at the end. They never visit business.facebook.com, never fill
in a form on another site, and never hand you a token.

---

## What you (Rodney) have to do — once, for the whole agency

Everything here is on the **Property Agent CRM** app you already have. There is no
second app and no second verification.

| # | Step | Where | Wait |
|---|---|---|---|
| 1 | Business verification | Business settings → Security Centre | 2–10 working days — **same one the lead forms need**, so it may already be done |
| 2 | Add the **WhatsApp** product | App dashboard → Add Product → WhatsApp | 5 minutes |
| 3 | Enable **Embedded Signup** | App → WhatsApp → Embedded Signup → create a configuration | 10 minutes |
| 4 | App Review for `whatsapp_business_management` + `whatsapp_business_messaging` | App Review → Permissions | **days to weeks** |
| 5 | Add a payment method to the Business Portfolio | Business settings → Payments | 5 minutes |

Step 4 is the gate. Until it is granted, only people with an app role can complete
Embedded Signup — so your five agents can all use it as **Testers** while review is
pending, same as the lead forms.

Step 5 matters more than it looks: conversations are billed to the Business Portfolio,
and with no payment method attached, messages stop without a useful error.

## What each agent does — once, themselves

1. Leads capture → **WhatsApp accounts → Add**.
2. A Facebook popup opens. They log in as themselves, create or pick a WhatsApp Business
   account, and register a number.
3. Done. Their number shows in the rail; leads from it arrive in their own queue.

**The one thing every agent must understand before clicking:** the number they register
**permanently leaves the normal WhatsApp app**. They cannot chat from it on their phone
again. A spare prepaid SIM (Hotlink, Yoodo, XOX — about RM10) is the right answer; their
personal number is not. The CRM says this next to the button, but say it out loud too —
this is the one step that cannot be undone easily.

The number needs to receive **one** SMS or voice call during registration. After that it
lives in the cloud; the SIM can go in a drawer.

## Then it works like this

An agent runs a **Click-to-WhatsApp ad** pointing at their own number. Someone taps it,
a chat opens, and their first message arrives at the CRM carrying a `referral` object
with the ad id, the headline and a **`ctwa_clid`** click id.

That click id is the reason this shape is worth building: it ties a closed sale back to
the exact creative that produced it. A QR-code bridge cannot give you that at all, and
neither can a number somebody messages cold.

## Message templates — the 24-hour rule

An agent may reply freely for **24 hours** after the person's last message. Outside that
window, only a pre-approved template will send.

For ad leads the window is nearly always open, since they messaged first. But two
templates are worth approving up front:

| Template | When it's needed |
|---|---|
| Follow-up after no reply | Agent called, no answer, next day |
| Appointment reminder | Day before a booked viewing |

Approval takes minutes to a day. Templates with a clear purpose pass; anything that
reads like a marketing blast gets rejected.

Templates belong to each agent's own WhatsApp account, so this is theirs to create — I
will put it behind the same Add button rather than in an admin screen.

## Costs

Billed per 24-hour conversation, not per message. A conversation started by someone
tapping a Click-to-WhatsApp ad is currently free for the first 72 hours in most markets;
agency-initiated ones run roughly RM0.03–0.30 depending on category. Small for five
agents on new-launch volume — but not zero, and it needs that payment method from step 5.

## What I build, once step 4 clears

- **Add** wired to Embedded Signup, storing each agent's credentials in the same
  per-user `capture_accounts` table the Facebook connections use — encrypted, isolated,
  invisible to other agents including admins.
- Webhook receiver for `messages`, sharing the signature check and idempotency guard
  with the lead-form webhook.
- First message from an unknown number becomes a lead in **that agent's** queue, with
  `ctwa_clid` and the campaign stored so it shows in the ads funnel.
- A returning number attaches to the existing lead instead of creating a duplicate.
- A conversation view in the CRM, with the 24-hour window shown plainly — when it
  closes, the reply box switches to template-only rather than failing to send with an
  error nobody can interpret.

## Right now

The WhatsApp slot is visible in the rail with the Add button deliberately disabled and
the reason written next to it. It is a real slot, not decoration — the schema already
holds `provider = "whatsapp"` accounts. Steps 1–4 above are what switch it on.

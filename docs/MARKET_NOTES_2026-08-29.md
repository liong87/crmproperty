# Competitor reel, 29 Aug 2026 — what it changes

Source: `samples/Recording 2026-08-29 092216.mp4` — a 1m57s screen recording of an
Instagram reel by `iqijaydenng16` with `mad.co__`, posted ~26 Aug, 66 likes. Two
presenters from a large Malaysian agency ("2000人团队 Leader" in the background)
walking through the same CRM assessed in `ZIEN_COMPARISON.md`, with bilingual
EN/中文 captions.

**Read this as marketing, not a spec.** It ends on "Join his team / 加入他的团队" —
it is a recruitment ad for the agency, and the CRM demo is the hook. Features are
shown working, never shown failing, and no pricing appears except one telling aside
noted below.

## Their framing: three problems

Stated up front as the things that have to change:

1. **Advertisement quality** — 广告质量
2. **Distribution of the leads** — leads 的分布
3. **Priority leads to agent** — 优先, which leads reach an agent first

That is a good framing and worth borrowing for our own positioning. It is also
almost exactly the axis `ZIEN_COMPARISON.md` section 2 already organises around.

## The one number worth taking seriously

> "manage to make 11 appointment / 设法预约了11次 … and then show up only got 3 /
> 然后出现只有3个"

A 27% show-up rate, presented by the agency as normal. This is the strongest
validation yet of the call made on 25 Aug that show-up rate is *the* metric for a
Malaysian agency — eight of eleven booked viewings wasted an agent's afternoon.

We built the appointment board and the show-up-rate tile (item 4 of the recommended
sequence). Nothing to do here except note that the priority was right.

## What we have already closed

Everything the reel demonstrates in these areas now exists on our side:

| Reel shows | Ours |
|---|---|
| "Leads Capture" screen: Facebook Form / WhatsApp tabs, per-form routing toggles, "Select Page" | `/lead-sources` — maps each Meta form id to a project, with label and default interest |
| Product routing per form — "High Intent Form (Queensmount)", "(Bandar)", "(D'Cita)" | Same mapping, one row per form |
| "assign to the 2nd tier agent / 分配给第二层agent" when the first does not respond | Project lead pools with automatic pass-on, plus stale-lead flagging |
| Campaign report with spend and cost per lead | `/reports/spend`, migration 0010 |
| Per-agent funnel | `funnel.byAgent`, managers only |

The Lead sources page in particular is a direct match for their "Leads Capture"
screen, and ours arrived without the per-message cost their WhatsApp side carries.

## Genuinely new: per-agent call activity

> "Data Analysis / 数据分析 … Kevin here only call 6 leads / 凯文在这里只打6个电话"

This is an **input** metric, and it is not the same as the per-agent funnel we built.
Our funnel reports outcomes — leads, appointments, show-ups, closes — which tells a
manager *where* an agent loses people. It does not tell them whether the agent picked
up the phone at all. "Kevin only called 6" is the conversation a team leader actually
has on a Monday morning.

We can already capture this: `ACTIVITY_TYPE` in `lib/constants.ts` includes `call`,
and `activities` records `createdBy` and a timeline. What is missing is:

- a report surface — calls logged per agent per period, beside the existing funnel
- the discipline that makes it meaningful: if agents do not log calls, the metric is
  worse than absent, because it will read as zero and someone will act on it

That second point is the reason to think before building. A call-activity metric that
agents can game or ignore produces confident wrong management. Zien's version is
presumably fed by click-to-call inside the CRM, which logs automatically. Ours would
depend on manual logging unless calls originate from the app.

*If built: a tile on `/reports` reading from `activities` where `type = 'call'`,
grouped by `createdBy`. Half a day. The honest caveat about logging discipline belongs
in the UI, not just the code.*

## WhatsApp: their own admission supports our parked decision

The reel demos a chatbot answering an inbound "How Much" with "RM xxxx"
automatically — "so all these are automated / 所以所有这些都是自动化的" — and then
the presenter says plainly:

> "because it charge per message / 因为它按消息收费"

He is right in general and misleading about the thing he is demoing. Meta bills per
message BY CATEGORY, and Malaysia rates as of Aug 2026 are roughly:

    Service        free      our reply within 24h of the customer messaging us
    Utility        RM 0.06
    Marketing      RM 0.35

An inbound "How Much" answered by a bot is a SERVICE message — the customer opened
the 24-hour window — so on Meta's side that demo costs nothing. The real recurring
cost is the BSP platform subscription (360dialog / Twilio / WATI, roughly
USD 50-100/month), plus business verification and template pre-approval.

This refines rather than reverses the 25 Aug decision. The commitment is a fixed
monthly subscription and about a month of integration, not a per-message tax. The
condition to unpark it: inbound WhatsApp volume high enough that the subscription is
plainly cheaper than the agent time it replaces — a number we will have once leads
are flowing.

Meanwhile the zero-cost version is already built and underused: `message_templates`
with `{{name}}` / `{{property}}` / `{{price}}` plus `lib/messaging/wa-link-provider.ts`
generating `wa.me` links. The only difference from the reel is that a human presses
send. Cheapest upgrade worth making: pre-generate a first-reply link from a template
when a Meta lead lands, so replying is one tap from the lead row. No API, no
subscription, no approval.

Also shown: "Chatbox for WhatsApp", a shared inbox view. Same dependency.

## Learning Hub — still parked, still unchanged

> "Learning Hub / 学习中心 — automatically get to watch / 你上传的东西"

Video content pushed to agents. Section 2.6 parked this and nothing in the reel
argues otherwise. It is an agency-onboarding feature for a 2,000-agent team, which is
a different business from ours.

## Conclusion

No new gap of any size. The three-problem framing is worth stealing for positioning,
the 11→3 show-up figure validates a priority we already acted on, and per-agent call
activity is the single feature here we do not have — small to build, and worth a
conversation about logging discipline before it is.

Fold the useful parts into `ZIEN_COMPARISON.md` when convenient; this file is kept
separate only because it was written while another session was editing code.

# Meta developer console — what to do before the code matters

This is Brief 5 §1. It is not a coding task and it is the long pole: **App Review for
`leads_retrieval` takes days to weeks**, and until it clears, only people you add to the
app by name can connect. Start it now; the code is already waiting for it.

Console: <https://developers.facebook.com/apps> — app **PropertyAgent CRM**.

---

## The short version

| # | Step | Who | Blocks what | Typical wait |
|---|---|---|---|---|
| 1 | Business Portfolio verified | You (documents) | Everything below | 2–10 working days |
| 2 | Privacy Policy + Terms URLs live | You (one page each) | Submitting review | Same day |
| 3 | Data Deletion + Deauthorize callbacks | Paste the two URLs | Submitting review | 5 minutes |
| 4 | Facebook Login **for Business** product added | You | Agents connecting | 5 minutes |
| 5 | Valid OAuth redirect URI | Paste one URL | Any login at all | 5 minutes |
| 6 | Add the five agents as **Testers** | You + each agent accepts | Using it before approval | Same day |
| 7 | Submit App Review for the 5 permissions | You (screencast + notes) | Everyone outside the app | **Days to weeks** |
| 8 | ADVERTISE task on each Page | Page admin | Reading a Page's forms | 5 minutes |
| 9 | Lead Ads Testing Tool end-to-end | You | Nothing — it proves it works | 15 minutes |

Steps 4, 5, 6, 8 and 9 are enough to run the whole thing **with your five agents today**.
Step 7 only matters when someone outside the app needs to connect.

---

## 1. Business Verification

**App Dashboard → Settings → Basic → Business Account → Verify.**

Meta will ask for the company's registration document (SSM), address, and a phone or
email it can verify against public records. Get this in first — `leads_retrieval` and
`ads_management` cannot be approved without it, and it is the step with the longest
external dependency.

If the app is not yet attached to a Business Portfolio, create one at
<https://business.facebook.com> first and attach the app to it.

## 2. Privacy Policy and Terms of Service URLs

**Settings → Basic.** Both fields must be filled with pages that actually load — Meta's
reviewer opens them. They must be reachable without login.

The Privacy Policy has to say, in plain words, what you collect (name, phone, email
from lead forms), why (to contact the person about property), how long you keep it, and
how someone asks for deletion. Malaysian PDPA wants the same things, so one page serves
both.

Suggested URLs to host on your own domain:

```
https://propertyagent-crm.lanthornrealty.workers.dev/privacy
https://propertyagent-crm.lanthornrealty.workers.dev/terms
```

> Tell me when you want these built — they are two static pages and I can write them
> against your actual data practices rather than a generic template.

## 3. Data Deletion and Deauthorize callbacks

**Settings → Basic**, two fields near the bottom:

| Field | Value |
|---|---|
| Deauthorize Callback URL | `https://propertyagent-crm.lanthornrealty.workers.dev/api/auth/facebook/deauthorize` |
| Data Deletion Request URL | `https://propertyagent-crm.lanthornrealty.workers.dev/api/auth/facebook/data-deletion` |

Meta calls the first when someone removes the app from their Facebook account, and the
second when they ask Facebook to delete their data. Both are required to submit review.

> These two endpoints are **not built yet** — they belong with the webhook in §5, which
> the brief says to stop before. Fill the fields in now anyway; Meta only checks they
> respond during review.

## 4. Facebook Login **for Business**

**Add Product → Facebook Login for Business** (not plain "Facebook Login").

This matters more than it looks. A Page owned by a Business Portfolio — which is how any
real agency holds one — cannot be granted through the consumer dialog. Using the wrong
product produces a login that succeeds and then lists zero Pages, which is a confusing
afternoon to debug.

Under that product, create a **configuration** with these five permissions and note its
name:

```
leads_retrieval
pages_show_list
pages_read_engagement
pages_manage_metadata
ads_management
```

## 5. Valid OAuth Redirect URI

**Facebook Login for Business → Settings → Valid OAuth Redirect URIs:**

```
https://propertyagent-crm.lanthornrealty.workers.dev/api/auth/facebook/callback
```

Exact match, including the scheme and no trailing slash. This is the single most common
cause of "URL blocked" on the login screen.

Also switch the app to **Live** mode (top bar) when you are ready — in Development mode
only app roles can log in at all.

## 6. Add each agent as a Tester

**App Roles → Roles → Add People → Testers.**

Add all five agents by their Facebook account. **Each of them must then accept the
invitation** at <https://developers.facebook.com/requests> — an unaccepted invite looks
identical to not being added, and this is where these setups usually stall.

A Tester gets the unapproved permissions immediately. That is what lets the whole
agency use per-user capture *before* App Review clears, and it is why step 7 is not
blocking you.

## 7. App Review submission

**App Review → Permissions and Features.** Request all five permissions listed above.

For each one Meta wants:

- **A screencast** showing a real person clicking Connect Facebook in the CRM, choosing
  a Page, submitting a test lead, and that lead appearing in the leads table. One
  recording covering the whole flow is accepted for all five.
- **Step-by-step written instructions** a reviewer can follow, including test login
  credentials for the CRM itself. Create a throwaway CRM user for this — do not give a
  reviewer a real agent's account.
- **A use-case paragraph.** Keep it concrete: *"Our property agency runs Facebook lead
  ads. Each agent connects their own Facebook account so the leads from their own ads
  arrive in their own CRM queue, where they call them back the same day."*

Record the screencast **after** the code is deployed and you have connected one Page
successfully — a reviewer following instructions that do not work is an instant reject
and a fresh wait.

## 8. ADVERTISE task on each Page

**Page → Settings → Page Access → the agent's name.**

Each agent must hold the **ADVERTISE** task on any Page whose lead forms they want to
read. Page Admin covers it; a plain Editor does not. Without it the Page shows up in
the picker and then returns nothing, which reads as a bug in the CRM.

## 9. Lead Ads Testing Tool

<https://developers.facebook.com/tools/lead-ads-testing>

Pick the Page, pick the form, click **Create Lead**. This fires a real webhook delivery
without spending a ringgit on ads, and it is how you confirm the whole chain works.

Nothing will arrive yet — the webhook is §5 and deliberately not built. Once it is, this
tool is the first thing to run.

---

## Secrets I will need from you afterwards

Set as **Worker secrets** (`wrangler secret put NAME`), never in a file:

| Secret | Where it comes from |
|---|---|
| `META_APP_ID` | Settings → Basic → App ID (not secret, but set it here anyway) |
| `META_APP_SECRET` | Settings → Basic → App Secret → Show |
| `APP_URL` | `https://propertyagent-crm.lanthornrealty.workers.dev` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` — **already in use**, do not rotate it or every stored token becomes unreadable |
| `META_VERIFY_TOKEN` | Any random string you invent; needed at §5, not before |

**Do not paste any of these into chat.** The App Secret you sent earlier still needs
resetting — Settings → Basic → App Secret → **Reset**.

`ENCRYPTION_KEY` is worth one extra sentence: the brief proposed a separate
`TOKEN_ENCRYPTION_KEY`, but the CRM already encrypts credentials with `ENCRYPTION_KEY`
via `lib/crypto/secret-box.ts`. I reused it rather than introducing a second key — two
keys means two ways to lose one, and a lost key means every connection has to be
rebuilt by hand.

# Build brief 2 — navigation, Working Leads filters, threaded remarks

**For:** the Claude session in `C:\Users\weichong.liong\Desktop\Claude\Propertyagent\crm`
**Companion to:** `BUILD-BRIEF.md` (dashboard funnel), `CRM-REVAMP-SPEC.md`, `DESIGN-SYSTEM.md`

Do these three tasks in order. Task 6 is the important one.

---

## Paste this into the desktop session

> Read `BRIEF-2-NAV-FILTERS-REMARKS.md` in the repo root, plus `CRM-REVAMP-SPEC.md` for the data model.
>
> Do Task 4 (nav regroup) first and show me the sidebar before moving on. Then Task 5, then Task 6. Task 6 needs a migration — show me the schema change before you run it.

---

## Task 4 — Regroup the sidebar

ZIEN's expanded sidebar, confirmed live:

```
  Dashboard

  WORKSPACE
    Working Leads   ● 1     ← badge = active assignment count
    Appointment

  LEAD MANAGEMENT
    Master Leads
    Leads Capture
    Report

  COMMUNICATION
    WhatsApp Bot
```

The split is meaningful, not cosmetic: **Workspace** is what you do today; **Lead Management** is where leads come from and how they're administered. Leads Capture belongs with Leads, not buried in Settings, because routing rules and the lead database are the same job.

### Target for our app

```
  Dashboard
  Inbox

  WORKSPACE
    Working leads   ● {activeCount}
    Appointments
    Pipeline

  LEAD MANAGEMENT
    Leads                 ← the full database
    Leads capture         ← MOVED here out of Settings
    Reports               ← MOVED here out of More

  PROPERTY
    Properties
    Projects
    Contacts

  TEAM
    My team
    Commission

  SETTINGS
    Templates
    Users
```

### Requirements

1. Group headings use the existing small-caps style already in the sidebar (`MORE`, `TEAM`, `SETTINGS`) — same size, letter-spacing and colour. Don't invent a new label style.
2. `WORKSPACE` and `LEAD MANAGEMENT` are always expanded. The rest keep whatever collapse behaviour they have now.
3. **Working leads gets a count badge** — a small pill on the right of the row showing active assignments. Zero renders nothing, not "0".
4. Active item keeps the current filled dark-green pill.
5. Route paths do not change. This is a grouping change only — no redirects, no renamed URLs.
6. If `Pipeline` and `Appointments` overlap in function, leave both for now and flag it in your summary rather than merging them. That's a product decision, not a refactor.

---

## Task 5 — Working Leads filters

Our Working leads page has tabs and a follow-up pill already. It's missing the filter row and the search.

### Toolbar, left to right

`Active {n}` · `Appointment {n}` · `Inactive {n}` tabs — keep as is.

Add:
- **Search** — one input, placeholder `Search name, phone, email, remarks…`. It must search remark bodies, not just the lead fields. That's the whole point: agents find leads by what was said on the call.
- **Follow-up pill** — we have this; keep it.

### Filter chip row (new, own line below the toolbar)

Four dropdown chips: **Product · Status · Assigned to · WhatsApp**

- Each chip opens a multi-select list of the values that actually exist in the current result set — not a hardcoded enum.
- A selected value renders as its own chip beside the parent chip (ZIEN shows `Product` then a separate green `tbd` chip). Click the value chip to remove it.
- Filters combine with AND across chips, OR within a chip.
- **WhatsApp** filters to leads with a usable WhatsApp number.
- Chip styling: `px-3 py-1.5 rounded-full text-xs font-medium`, white background, `border-gray-200`, muted text — matches what we already use for `All / New / Contacted / Qualified` on the Leads page.
- Filter state lives in the URL query string so a filtered view is shareable and survives a refresh.
- Horizontally scrollable on mobile, never wraps to two rows.

### Table columns

ZIEN's Working Leads is a **table**, not cards — cards don't scale past a handful of leads. Ours is currently cards. Convert it:

`LEAD` (name + phone, phone is a WhatsApp link) · `INFO` (created date/time + lead info) · `PRODUCT` (inline editable chip) · `STATUS` · `REMARK` (see Task 6)

- Sortable headers with the ⇅ glyph.
- Row hover reveals a WhatsApp icon and a hide/dismiss icon on the right.
- Horizontal scroll on the table container only — the page body must never scroll sideways.
- Keep the existing quick actions (`Called`, `WhatsApp`, `Book`) — move them into the row hover state or a row overflow menu.

Keep the current footer line: *"Looking for a lead that is not yours, or one you disqualified months ago? Leads is the full database."* That's good copy, it stays.

---

## Task 6 — Threaded remarks

**This is the one that matters.** Right now a lead has one remark field that gets overwritten. It needs to be an append-only thread, because a lead is worked over weeks and every call is a separate fact.

### How ZIEN does it (confirmed live)

The `REMARK` cell is collapsed by default and shows the most recent entry:

```
Today · 2:15 pm    Product set to tbd (lead info match)
```

Click the cell and it expands **in place** — no modal, no page change:

```
┌────────────────────────────────────────────────────────┐
│  Today · 2:15 pm   Product set to tbd (lead info match)│  ← history, read-only
│                                                        │
│  02/09/2026, 2:23 pm   [ No Pick Up ▾ ]                │  ← new entry row
│  Tap to add remark…                          ✓    ✕    │
└────────────────────────────────────────────────────────┘
```

The composer row is three things at once: an **auto-filled timestamp** you can't edit, a **status dropdown**, and a **free-text field**. Confirming with ✓ appends one entry and applies the status to the lead in the same action.

That coupling is the clever part. In ZIEN you cannot change a lead's status without leaving a note, so the follow-up history is always complete and the follow-up rate is trustworthy. Copy that behaviour exactly — do not add a way to change status without a remark.

Their status list, in order, with colours:

| Status | Colour family |
|---|---|
| No Pick Up | slate |
| Not Reachable | rose |
| Follow Up | emerald |
| Call Another Time | blue |
| Appointment | amber |
| Closed | red |
| Not Searching | pink |
| Unmatched Requirement | violet |
| Blocked | rose |

Ours are currently `new / contacted / qualified / disqualified`. Those are lifecycle states; ZIEN's are **call outcomes**, which is far more useful to an agent. Keep our four as the coarse lifecycle and add the outcome list above as the per-remark status, or merge them — propose which and wait for a decision before migrating.

### Schema

```sql
CREATE TABLE lead_remark (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  lead_id       TEXT NOT NULL,
  user_id       TEXT,                 -- null for system entries
  body          TEXT,                 -- may be empty when only status changed
  status_id     TEXT,                 -- status applied with this remark, nullable
  kind          TEXT NOT NULL,        -- 'manual' | 'system'
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_remark_lead ON lead_remark(lead_id, created_at DESC);
CREATE INDEX idx_remark_ws   ON lead_remark(workspace_id, created_at DESC);
```

Add to `lead`: `last_followup_at INTEGER`, `followup_count INTEGER DEFAULT 0`.

### Rules

1. **Append only.** Existing remarks are never edited or deleted — it's an audit trail. No edit affordance in the UI.
2. **System entries too.** Automated events write `kind = 'system'` rows and render in the same thread, dimmer, no author avatar. ZIEN does exactly this (`Product set to tbd (lead info match)`).
3. **Only manual remarks count as a follow-up.** On insert where `kind = 'manual'`: set `lead.last_followup_at = created_at` and increment `followup_count`. System rows must not inflate the follow-up rate.
4. **Search hits remark bodies.** Add remark text to whatever the Working Leads and Leads search queries cover.
5. **Migration:** backfill `lead_remark` from the existing single remark field as one `kind='manual'` row per lead, timestamped with the lead's `updated_at`, then drop the old column in a second migration once verified. Do not drop it in the same migration.

### UI

- Collapsed cell shows the latest entry only: a light-blue timestamp pill (`Today · 2:15 pm`) then the body, truncated to one line.
- Expanded shows the full thread, newest last, scrollable above ~200px.
- Composer: timestamp is read-only text, status is a coloured dropdown, body is a borderless input with a bottom rule and placeholder `Tap to add remark…`. `Enter` or ✓ saves; `Esc` or ✕ cancels.
- Optimistic insert, roll back and keep the typed text on failure. Never silently drop what someone typed.
- Empty thread: *"No remarks yet. Log what happened on the call and it stays with this lead."*

### Acceptance

- [ ] Adding a remark appends without touching earlier entries
- [ ] Adding a remark with a status changes the lead's status in the same request
- [ ] `followup_count` and `last_followup_at` update only for manual remarks
- [ ] The follow-up pill on Working Leads reflects a new remark immediately
- [ ] Searching a word that only appears in a remark returns that lead
- [ ] Migration preserves every existing remark — verify by row count before and after
- [ ] `pnpm typecheck` and `pnpm test` pass, **and the page loads in the browser after deploy**

---

## Note on ordering

Task 6 changes the schema, so do it after 4 and 5 are deployed and stable. If you'd rather do the migration first to avoid rework in the Working Leads table, say so before starting — don't decide silently.

# Build brief 4 — Leads table (ZIEN's Master Leads)

**For:** the Claude session in `C:\Users\weichong.liong\Desktop\Claude\Propertyagent\crm`
**Companion to:** `BUILD-BRIEF.md`, `BRIEF-2-NAV-FILTERS-REMARKS.md`, `BRIEF-3-APPOINTMENT-BOARD.md`, `DESIGN-SYSTEM.md`

Everything below was captured from ZIEN's live Master Leads page, including the DOM of their modals and bulk bar.

**The core problem with our Leads page:** every edit costs a page navigation. Click the lead → new page → change one field → navigate back → lose your scroll position and your filters. An agent triaging thirty leads does that thirty times. ZIEN never leaves the table.

Our status chips already match ZIEN's list (New, No Pick Up, Not Reachable, Follow Up, Call Another Time, Appointment, Closed, Not Searching, Unmatched Requirement, Blocked) — that part is done. What's missing is everything you can *do* to a row.

---

## Paste this into the desktop session

> Read `BRIEF-4-LEADS-TABLE.md` in the repo root.
>
> Do Task 10 first (row actions and the Edit Lead modal) — that's the biggest daily-use win. Then 11, 12, 13. Show me each one deployed before moving to the next.

---

## Task 10 — Row actions, no navigation

### Hover state

Hovering a row reveals two icon buttons pinned to the right edge of the row: **✎ edit** and **🗑 delete**. They are invisible until hover so the table stays quiet at rest. Both are `w-4 h-4`, `text-gray-400`, darkening on hover; delete goes `text-red-500`.

Delete asks for confirmation naming the lead — *"Delete lead3? This can't be undone."* — not a generic "Are you sure?".

### Edit Lead modal

Opens over the table. Nothing navigates. Header is **`Edit Lead`** with the phone number as a muted subtitle, so you can confirm you opened the right row.

Fields, in this order:

```
Full name *                              [ lead3            ]

Contact number / WhatsApp username *     Email
[ 60178800880          ]                 [ optional         ]

Product
[ tbd                                                     ▾ ]

──────────────── SOURCE ────────────────
[ Google SEO                                              ▾ ]

  Type a value for each          Fetch from Facebook  ( ○ )
  Domain
  [                                                        ]

──────────────── LEAD INFO ─────────────
[ Budget, preferences, notes from form…                     ]
[                                                           ]

Entered 02 Sept 2026, 02:42 pm

[ Cancel ]                              [ Save changes ]
```

Details worth copying exactly:

1. **The source sub-fields are dynamic.** Picking `Google SEO` renders a `Domain` input. Picking `Meta` renders `Campaign`, `Ad Set`, `Ad`. This comes from the nested source config in `CRM-REVAMP-SPEC.md` §3 — the sub-levels are configured per source, not hardcoded per form.
2. **"Fetch from Facebook"** toggle — pulls campaign/adset/ad names from the Meta API instead of typing them. Build the toggle now, wire it when Leads Capture is done; a disabled toggle with a tooltip is fine in the meantime.
3. **`Entered 02 Sept 2026, 02:42 pm`** sits above the buttons as quiet grey text. Small thing, but an agent editing a lead always wants to know how old it is.
4. Required fields carry a red `*`. Save stays disabled until name and contact are non-empty.

Keep our `Interest` and `Budget` fields in this modal — ZIEN has no equivalent (they use one freeform `Lead Info` blob) and structured buyer qualification is exactly where we should be better than them. Put them in a `QUALIFICATION` section between Product and Source.

### Inline cell editing

Two cells edit in place without opening anything:

- **Product** — the chip is a dropdown. Click, pick, saved.
- **Status** — same. We already render a status chip; make it clickable.

Per Brief 2 Task 6, changing status **must** write a remark. Inline status change opens the small remark composer rather than saving silently.

---

## Task 11 — Bulk action bar

Ours is an inline light box offering `Delete` and `Clear`. ZIEN's is a **floating dark pill** that rises from the bottom of the viewport when a row is selected:

```
┌──────────────────────────────────────────────────────────────────┐
│  1 lead selected │ [Assign Product ▾] [Assign Leads] [⃠ Revoke]  │
│                                          [⤓] [🗑] [✕]           │
└──────────────────────────────────────────────────────────────────┘
```

Confirmed actions, with their exact tooltips:

| Control | Tooltip | Does |
|---|---|---|
| `Assign Product ▾` | — | sets product on all selected |
| `Assign Leads` | — | opens the Assign modal (Task 12) |
| `⃠ Revoke` | — | pulls leads back from whoever holds them, returns to unassigned |
| `⤓` | `Export selected` | CSV of the selection |
| `🗑` | `Delete selected` | destructive, red, confirms first |
| `✕` | `Clear selection` | — |

Styling: dark slate pill, `rounded-2xl`, floating with a shadow, centred over the content, `position: sticky` at the bottom of the table container so it doesn't cover the last row. Primary action (`Assign Leads`) is the accent-filled button; `Revoke` and `Delete` are red-tinted; the rest are ghost.

`Revoke` is the one we're missing conceptually. Right now a lead assigned to the wrong agent has no clean way back. It should clear the assignment, increment the lead's recycle count, and write a system remark.

Select-all uses an indeterminate checkbox in the header — ZIEN shows the dash state correctly when a subset is selected. Ours should too.

---

## Task 12 — Assign Lead modal

This is the best thing on their page and we have nothing like it.

```
Assign Lead
lead3 · 60178800880

Assign to *
[ Search collaborator…                                    ▾ ]

Lead Info  (optional, sent to all)
[ Product ×  |  Info ×                                      ]
[ + Source ] [ + Campaign ] [ + Ad Set ] [ + Ad ]

┌─ PREVIEW (LATEST LEAD) ──────────────────────────────────┐
│  LEAD                        │  INFO                     │
│  lead3                       │  🧑 2 Sept                │
│  60178800880                 │     tbd                   │
│  john@email.com              │                           │
└──────────────────────────────────────────────────────────┘

[ Cancel ]                                        [ Assign ]
```

Three things it gets right:

1. **Searchable collaborator picker**, not a raw select. Works with a real team.
2. **Field-level visibility control.** You choose which fields travel with the lead — `Product` and `Info` are on by default; `Source`, `Campaign`, `Ad Set` and `Ad` are opt-in tokens. An agency does not want juniors seeing which campaign a lead came from, or the cost data behind it. This is a real commercial requirement, not a nicety.
3. **A live preview of the receiving agent's row.** You see exactly what they'll see before you hit Assign. It removes the entire "wait, what did they get?" question.

Requirements:

- Visible-field selection persists per assignment, stored on `lead_assignment` as a JSON array.
- The receiving agent's Working Leads row renders only the permitted fields; hidden ones show `—`, never an empty cell that looks like missing data.
- Assigning writes a system remark: *"Assigned to {name}"*.
- Bulk assign uses the same modal; the preview shows the most recent lead in the selection, labelled `PREVIEW (LATEST LEAD)` exactly as theirs does.

---

## Task 13 — Columns and filters

### Filter chips

`Source · Product · Status · Progress · Collaborator` — same dropdown-chip component as Brief 2.

**`Progress` is the one to note.** It expands to `Active | Inactive | Ongoing Apt | Completed Apt`. It's a different axis from Status: Status is the last call outcome, Progress is where the lead sits in the working process. Both are needed, and mixing them into one filter is the mistake to avoid.

Keep our current status quick-filter row as well — it's faster than a dropdown for the most-used filter and we already have it.

### Columns

| Column | Have it? | Notes |
|---|---|---|
| LEAD | ✓ | name + phone, phone is a WhatsApp link |
| SOURCE | ✓ | add the sub-source line beneath (`Meta` / `· met1`) |
| INFO | ✗ | add — freeform lead info, truncated to one line |
| PRODUCT | ✗ | add — inline-editable chip |
| INTEREST / BUDGET | ✓ | **keep** — ZIEN has no equivalent, this is our advantage |
| STATUS | ✓ | make inline-editable |
| DATE | ✓ | show time under the date (`02 Sept` / `09:51 am`) |
| **↻ recycle** | ✗ | add — how many times reassigned (`↻ 1×`). Flags leads being passed around |
| **D dormant** | ✗ | add — days since last touch (`0d`). Sort by it to find neglected leads |
| COLLABORATORS | partial | ours is a single "Assigned to" select; theirs stacks avatar chips with sequence position (`#1`), name, relative time and current status |

`↻` and `D` are two narrow columns that between them tell you which leads are being neglected and which are being shuffled without progress. Cheap to add, and they're what makes the table a management tool rather than a list.

Footer shows `3 of 3 leads` — a filtered count against the total, so you always know a filter is on. Ours shows nothing.

---

## Acceptance

- [ ] Editing a lead never navigates away from the table; scroll position and active filters survive
- [ ] Edit modal renders the correct dynamic sub-fields for Meta vs Google SEO
- [ ] Product and Status edit inline; a status change opens the remark composer and writes a remark
- [ ] Bulk bar appears on selection with all six actions; delete and revoke confirm first
- [ ] Assign modal restricts visible fields, and the receiving agent's row honours that restriction
- [ ] `↻` and `D` columns populate and sort correctly
- [ ] Header checkbox shows the indeterminate state for a partial selection
- [ ] `pnpm typecheck` and `pnpm test` pass, **and the page loads in the browser after deploy**

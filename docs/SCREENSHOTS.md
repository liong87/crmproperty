# Screenshot list

The guide builds fine without any screenshots — each figure falls back to a labelled
placeholder box. Add them whenever you like and re-run the build; nothing else changes.

## How to add them

1. Take the screenshot (Windows: `Win + Shift + S`, then paste into Paint and save).
2. Save it into `docs/screenshots/` using **exactly** the file name below (`.png` or `.jpg`).
3. Rebuild:

   ```powershell
   python docs/build_user_guide.py
   ```

Images are scaled to the page width automatically, so don't worry about exact dimensions.
Landscape shots of a browser window work best — around 1400px wide is plenty.

## The shots

| File name | What to capture |
|---|---|
| `01-sign-in` | The sign-in screen, signed out |
| `02-dashboard` | Dashboard with the tiles and the follow-ups card |
| `03-new-lead` | The New Lead form, part-filled, with the Project picker visible |
| `04-leads-list` | Leads list showing search, status filter and the **Assigned to** column |
| `05-import-csv` | The Import leads screen, after an import so the summary shows |
| `06-lead-detail` | A lead record with the Activity & Notes timeline visible |
| `07-qualify` | Close-up of the Qualify and Disqualify buttons |
| `09-appointments` | The appointments board with the **no-show rate** above it |
| `11-pipeline` | Pipeline board on the **New launch** tab, with the Resale tab visible |
| `12-paperwork` | A deal's paperwork checklist, ideally with one item overdue in red |
| `13-reminders` | Reminders, with the **Paperwork due** card above the follow-ups |
| `14-reports` | Reports — the funnel, the trend chart and the period selector |
| `15-project` | A project page with two or more unit types, so the price range is a range |
| `16-lead-pool` | A project's lead pool with two or more members and the pass-on note |
| `18-users` | Users screen showing roles and Deactivate |

The old `dashboard.png`, `lead.png`, `newlead.png` and `signup.png` in `screenshots/`
predate this list and are not picked up — rename them to the keys above if they are
still accurate, or retake them.

## Before you screenshot

Use realistic but **fake** client details — invented names, phone numbers and budgets.
Real client data in a document that gets emailed around is a PDPA problem.

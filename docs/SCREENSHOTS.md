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
| `02-dashboard` | Dashboard with the four tiles and the follow-ups card |
| `03-new-lead` | The New Lead form, ideally part-filled |
| `04-leads-list` | Leads list showing the search box and status filter |
| `05-import-csv` | The Import leads screen, after an import so the summary shows |
| `06-lead-detail` | A lead record with the Activity & Notes timeline visible |
| `07-qualify` | Close-up of the "Qualify → Contact" and "Disqualify" buttons |
| `08-contact-detail` | A contact record |
| `09-new-property` | The property form |
| `10-property-photos` | A property with photographs uploaded |
| `11-pipeline` | Pipeline board with a few deals in different stages |
| `12-reminders` | Reminders screen, ideally with one overdue item |
| `13-reports` | Reports screen |
| `14-users` | Users screen showing roles and Deactivate |

## Before you screenshot

Use realistic but **fake** client details — invented names, phone numbers and budgets.
Once this guide circulates, anything visible in it has left the system, and real client
data (especially identity-card numbers) must not travel that way.

A tidy sequence: create one fake lead, work it through to a contact and a deal, then
capture every screen in one pass. That gives consistent-looking figures and lets you
delete the test records afterwards.

/**
 * The in-app user guide.
 *
 * Content lives here as data rather than as JSX so there is ONE place to edit when
 * the product changes, and so sections can be filtered by role before rendering —
 * an agent is never shown instructions for a screen they cannot reach.
 *
 * The same material is published as docs/Lanthorn-Properties-CRM-User-Guide.pdf for
 * handing to a new agent on day one. If you change one, change the other.
 */

export type Block =
  | { kind: "p"; text: string }
  | { kind: "steps"; items: string[] }
  | { kind: "list"; items: string[] }
  | { kind: "note"; tone: "info" | "warn" | "stop"; text: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  /**
   * A screenshot of the real screen, served from public/guide/.
   *
   * The guide described nine screens in prose and showed none of them. An agent reading
   * "press Called" has to find the button first, and a paragraph is a poor way to say
   * where something is. `src` is the filename in public/guide; `w` and `h` are the
   * capture's real pixel dimensions, which next/image needs to reserve the space before
   * the file arrives so the page does not jump as each one loads.
   */
  | { kind: "figure"; src: string; caption: string; w: number; h: number };

export interface HelpSection {
  id: string;
  n: number;
  title: string;
  part: string;
  /** Team lead and admin only. Filtered out server-side, not hidden with CSS. */
  teamLeadOnly?: boolean;
  blocks: Block[];
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "signing-in", n: 1, part: "Getting started", title: "Signing in",
    blocks: [
      { kind: "p", text: "There are two doors, and you pass through both. Cloudflare decides whether you may see the CRM at all; the CRM's own sign-in decides who you are. Expect both the first time — people who are not expecting the first one assume something has gone wrong." },
      { kind: "steps", items: [
        "Cloudflare asks for your email address and sends you a six-digit code. Type it in. This does not happen again for 24 hours.",
        "The CRM's sign-in appears. Use the work email your admin registered — you do not create a password here.",
      ] },
      { kind: "note", tone: "warn", text: "The six-digit code often lands in Spam the first time. It is a new sender on a new domain, which is exactly what mail providers are suspicious of. Look there before reporting a problem, mark it Not spam, and it will behave afterwards." },
      { kind: "p", text: "If you land on a page saying your account is pending, that is correct. New sign-ups arrive inactive and an admin has to approve you before you can see any client data." },
      { kind: "note", tone: "warn", text: "Sign in with the email your admin was given. A different address creates a brand-new inactive account instead of finding yours." },
      {
        kind: "table",
        head: ["Role", "Sees", "Can also"],
        rows: [
          ["Agent", "Their own leads, contacts, deals and appointments", "—"],
          ["Team Lead", "Their team's records", "Reassign leads, create projects, manage pools, see ad spend, publish training"],
          ["Admin", "Everything in the agency", "All of the above, plus approving accounts and setting roles"],
        ],
      },
      { kind: "p", text: "This is enforced in the data itself, not by hiding buttons — an agent cannot reach another agent's client by guessing a web address." },
    ],
  },
  {
    id: "dashboard", n: 2, part: "Getting started", title: "Your dashboard",
    blocks: [
      { kind: "p", text: "The dashboard answers one question: what needs me today? Lead and pipeline counts, follow-ups due, and two warnings that appear only when they matter — a red banner counting overdue documents, and a count of leads that have gone quiet." },
      { kind: "note", tone: "info", text: "No news means no banner. A permanent “0 overdue” row is furniture people learn to skip, so those warnings are absent entirely when there is nothing wrong. If you see one, it is real." },
      { kind: "figure", src: "02-dashboard.jpg", caption: "The dashboard.", w: 1341, h: 866 },
    ],
  },
  {
    id: "lead-sources-in", n: 3, part: "Leads", title: "Where leads come from",
    blocks: [
      { kind: "p", text: "Four routes in, and the route decides who gets the lead." },
      {
        kind: "table",
        head: ["How it arrives", "Who it goes to"],
        rows: [
          ["New Lead button", "Whoever created it — you. An agent cannot assign to somebody else"],
          ["Import CSV", "Whoever uploaded the file"],
          ["Facebook or Instagram lead form", "The project's lead pool, in rotation"],
          ["Website form or public API", "The same rotation, or the agency-wide one if no project is attached"],
        ],
      },
      { kind: "p", text: "So a lead you sourced yourself is yours from the moment you enter it. Rotation only ever touches leads nobody owns yet — the ones the agency paid for." },
      { kind: "p", text: "On the leads list, the Assigned to column shows who owns each lead, and calls out Unassigned in red. Duplicates are detected by phone and email, so re-importing the same CSV does not create the same person twice." },
      { kind: "figure", src: "04-leads-list.jpg", caption: "The leads list, with the Assigned to column.", w: 1568, h: 648 },
      { kind: "figure", src: "03-new-lead.jpg", caption: "The New Lead form.", w: 1341, h: 866 },
      { kind: "figure", src: "05-import-csv.jpg", caption: "Importing a CSV.", w: 1341, h: 866 },
    ],
  },
  {
    id: "working-a-lead", n: 4, part: "Leads", title: "Working a lead",
    blocks: [
      { kind: "p", text: "Open a lead to see their details, the project they enquired about, and a timeline of everything that has happened." },
      {
        kind: "steps",
        items: [
          "Log every contact — call, WhatsApp, email or note. This is what proves you are working the lead, and it is what stops a project lead being passed to somebody else.",
          "Set a follow-up date when you log something. It appears on your dashboard and Reminders that day, so you have one list rather than a separate diary.",
          "Use WhatsApp from the lead. The button opens a chat with their number filled in, and templates fill in their name and the project.",
        ],
      },
      { kind: "note", tone: "warn", text: "Log it the same day. Pass-on, response-time reporting and the funnel all read the timeline. Work that is not logged did not happen as far as the system is concerned." },
      { kind: "figure", src: "06-lead-detail.jpg", caption: "A lead, with its activity timeline.", w: 1568, h: 648 },
    ],
  },
  {
    id: "qualify", n: 5, part: "Leads", title: "Qualify or disqualify",
    blocks: [
      { kind: "p", text: "When someone is genuinely interested and can proceed, use Qualify. That converts them to a contact — carrying across their details, consent record and history — and a contact is what a deal is built on." },
      { kind: "p", text: "When they are not a buyer, give them the outcome that fits — Not Searching, Unmatched Requirement or Blocked — rather than leaving them in your list. It keeps your numbers honest and stops the system chasing you about them." },
      { kind: "note", tone: "info", text: "Disqualifying is part of the funnel, not a failure. Conversion is measured against every lead received, including the ones you rejected. Rejecting a poor lead quickly is good work." },
      { kind: "figure", src: "07-qualify.jpg", caption: "Qualify and Disqualify sit together on the lead.", w: 1568, h: 648 },
    ],
  },
  {
    id: "pass-on", n: 6, part: "Leads", title: "When a lead moves on",
    blocks: [
      { kind: "p", text: "On a new launch, a lead left untouched can be passed to the next person in the project's pool. This only happens when all of the following are true:" },
      {
        kind: "list",
        items: [
          "The lead is attached to a project, and that project has a pass-on window set",
          "It came from the agency — a Facebook form, the website or the API. A lead you entered by hand or imported yourself is never passed on",
          "You have logged nothing since it was assigned to you",
          "There is no appointment booked, and it is not marked qualified",
          "The pool has more than one active person",
        ],
      },
      { kind: "p", text: "Any activity at all stops the clock. Log a call and the lead stays yours, and the window restarts from that moment." },
      { kind: "note", tone: "info", text: "Nothing happens quietly. Every transfer writes a note on the lead's timeline naming both agents, and messages each of you." },
    ],
  },
  {
    id: "booking", n: 7, part: "Appointments", title: "Booking an appointment",
    blocks: [
      { kind: "p", text: "From a lead or a contact, choose Schedule appointment. Pick the subject — a project from the New launch group, or a property for a resale viewing. It is one or the other, never both." },
      {
        kind: "list",
        items: [
          "I am closing this myself — the usual case.",
          "Another agent — under a setter and closer split, you booked it and they run the presentation. Both are recorded, both can see it, and commission splits on that record later.",
        ],
      },
      { kind: "note", tone: "info", text: "Booking a project appointment links the lead to that project if it did not already have one. Somebody who turns up at a gallery is a lead for that project, and the timeline says so." },
      { kind: "figure", src: "09-appointments.jpg", caption: "The appointments board.", w: 1341, h: 866 },
    ],
  },
  {
    id: "outcomes", n: 8, part: "Appointments", title: "Recording what happened",
    blocks: [
      { kind: "p", text: "Appointments opens as a board: Scheduled → Showed up → Booked → No show → Cancelled. Use Record outcome on a card after the appointment." },
      {
        kind: "table",
        head: ["Status", "Then outcome"],
        rows: [
          ["Showed up", "Booked, interested, undecided or not interested"],
          ["No show", "—"],
          ["Cancelled", "—"],
        ],
      },
      { kind: "p", text: "The no-show rate above the board tells you whether your confirmations are working. It counts only appointments that reached a verdict, so a fresh booking never dilutes it." },
      { kind: "note", tone: "warn", text: "Record the outcome the same day. An appointment with no outcome counts as nothing in the funnel, so a good week can look like a bad one purely because nobody closed the loop." },
    ],
  },
  {
    id: "deals", n: 9, part: "Deals and paperwork", title: "Creating a deal",
    blocks: [
      { kind: "p", text: "A deal needs a contact, so qualify the lead first. On the contact, choose Create Deal. The Project picker decides which pipeline the deal joins, and it is pre-filled from the lead they came in on." },
      {
        kind: "list",
        items: [
          "A project selected → new launch deal, starting at Booked",
          "Left blank → resale deal, starting at New",
        ],
      },
      { kind: "p", text: "A line under the picker tells you which you are about to get. Check it before saving." },
      {
        kind: "table",
        head: ["New launch pipeline", "Resale pipeline"],
        rows: [
          ["Booked", "New"],
          ["SPA Signed", "Contacted"],
          ["Loan Approved", "Viewing Scheduled"],
          ["Completed", "Negotiation"],
          ["Cancelled", "Closed Won / Closed Lost"],
        ],
      },
      { kind: "p", text: "A project deal starts at Booked because the appointment board already owns everything before that. Repeating those steps here would count the same event twice." },
      { kind: "figure", src: "11-pipeline.jpg", caption: "The pipeline, on the New launch tab.", w: 1341, h: 866 },
    ],
  },
  {
    id: "paperwork", n: 10, part: "Deals and paperwork", title: "The paperwork checklist",
    blocks: [
      { kind: "p", text: "Click Paperwork on a pipeline card. The checklist is already there, created from the project template, with a suggested due date on each item: booking form, booking fee receipt, IC or passport, income documents, loan application, loan approval letter, SPA signed, stamping." },
      { kind: "p", text: "On each item you can tick it off, change the due date, attach a file, or add your own item." },
      { kind: "note", tone: "stop", text: "Attaching a file does not tick the item. Somebody still has to confirm the document is the right one and legible. Tick it when you have checked it, not when it uploads." },
      { kind: "p", text: "Overdue items turn red and say how many days late. They also appear on Reminders and, when overdue, on the dashboard — so paperwork chases you rather than waiting to be found." },
      { kind: "note", tone: "warn", text: "The loan approval letter is the one that kills deals. It expires. Watch its date more closely than the rest." },
    ],
  },
  {
    id: "reminders", n: 11, part: "Staying on top", title: "Inbox",
    blocks: [
      { kind: "p", text: "Everything still open, on one screen. Paperwork due sits above the follow-ups: anything due in the next 14 days plus anything already overdue, soonest first, with the client and project named. Overdue items never drop off. Below it, your follow-ups — every date you set while logging activity — and your notifications, including the weekly summary." },
      { kind: "note", tone: "info", text: "There is no separate Reminders screen. Follow-ups and paperwork used to live on their own page; both answered “what needs me?”, so there were two places to check and people reliably checked neither. They are one screen now." },
      { kind: "figure", src: "13-inbox.jpg", caption: "The Inbox.", w: 1341, h: 866 },
    ],
  },
  {
    id: "reports", n: 12, part: "Staying on top", title: "Reports",
    blocks: [
      { kind: "p", text: "The funnel is the heart of it: Leads → Appointments set → Showed up → Booked, with the conversion rate at each step. Underneath, the same figures by project and, for team leads, by agent. A trend chart plots leads, appointments and bookings week by week." },
      { kind: "p", text: "The period selector — 30 days, 90 days, 6 months, 12 months, All time — drives the funnel, the trend and both tables together. The four tiles at the top are not filtered: open pipeline is a snapshot of what is live right now." },
      { kind: "note", tone: "info", text: "Setting and closing are credited separately. Appointments set count for whoever booked them; show-ups and bookings for whoever ran the presentation. A setter who hands over good appointments is never shown as having converted nothing." },
      { kind: "figure", src: "14-reports.jpg", caption: "Reports.", w: 1341, h: 866 },
    ],
  },
  {
    id: "sales-kit", n: 13, part: "Projects", title: "The sales kit",
    blocks: [
      { kind: "p", text: "Every project page has a Sales kit: the price list, brochure, layout plans, APDL and licences, the blank forms you hand a buyer, the panel lawyer, and the showroom location. One place, and always the version the agency stands behind — you never have to ask anyone which price list is current." },
      { kind: "p", text: "You cannot change a kit. Team leads and admins publish it; agents read it. That is deliberate, so that two agents can never be quoting from different copies of the same price list." },
      {
        kind: "list",
        items: [
          "A file — click it to download. Price lists, brochures, licences, blank forms.",
          "A link — opens elsewhere, such as a shared sheet or a map pin for the showroom.",
          "A value — a plain fact you need at hand, like an HDA account number or a panel banker's phone.",
        ],
      },
      { kind: "note", tone: "stop", text: "If a kit contains a unit lock or availability sheet, it records only what OUR agents have committed. Other agencies sell the same projects, and their bookings never appear in it. Always confirm a unit is still available with the developer before promising it to a buyer." },
      { kind: "note", tone: "info", text: "Blank forms live in the kit. The buyer's SIGNED copy belongs on that buyer's deal, under the paperwork checklist — not back in the kit, which is shared by everyone." },
      { kind: "figure", src: "15-sales-kit.jpg", caption: "A project's sales kit.", w: 1568, h: 648 },
    ],
  },
  {
    id: "lead-form-mapping", n: 14, part: "Your own tools", title: "Your Facebook lead capture",
    blocks: [
      { kind: "p", text: "Leads capture is yours, not the office's. Every agent connects their own Facebook account and chooses their own Pages and lead forms. Leads from a form you picked arrive assigned to you, automatically, within seconds of the person submitting it." },
      { kind: "steps", items: [
        "Open Leads capture and press Connect Facebook. You are sent to Facebook to log in as yourself.",
        "Choose the Pages you want leads from. If Facebook offers “Continue with previous settings”, do not take it — press Edit settings and tick the Pages, or you will come back with nothing connected.",
        "Back in the CRM, press + New and pick the lead form by name.",
      ] },
      { kind: "note", tone: "info", text: "Nobody else can see your connection — not another agent, not a manager, not an administrator. Your Facebook access token is encrypted and never displayed, and Disconnect removes it." },
      { kind: "note", tone: "warn", text: "A Facebook lead form cannot be edited once it exists — Meta allows only create and archive. Read a new form through before submitting it." },
      { kind: "p", text: "Map fields, on each Facebook form, is for when a form asks in unexpected words. The CRM already recognises Meta's standard name, phone and email questions, so leave every field on Guess unless one is coming through blank. A form whose phone question is labelled \u201cNombor telefon\u201d is the case this exists for: without a mapping those leads arrive with no number and nobody can call them." },
      { kind: "note", tone: "info", text: "An unmapped form still creates the lead — it just arrives with no project. Losing a lead the agency paid for because nobody filled in a mapping would be far worse than filing it imperfectly." },
      { kind: "figure", src: "19-leads-capture.jpg", caption: "Leads capture — your own Facebook connections.", w: 1341, h: 866 },
    ],
  },
  {
    id: "learning", n: 15, part: "Your own tools", title: "Learning Hub",
    blocks: [
      { kind: "p", text: "Training material, kept where the work happens. A team leader records or links videos; the agents under them watch and tick them off. It exists so that what a good negotiator knows stops living only in their head." },
      { kind: "p", text: "Library is every topic your team leader has published, as cards showing how many chapters there are, roughly how long they run, and how far you have got. Open one and you get the video, the leader's notes, any files attached to that chapter, and a chapter list down the side." },
      { kind: "p", text: "Press Mark as watched when you finish a chapter. That is the only thing feeding your progress bar, and it is what your leader sees." },
      { kind: "figure", src: "20-learning-library.jpg", caption: "The Learning Hub library.", w: 1341, h: 866 },
      { kind: "note", tone: "info", text: "The progress bar is yours alone. It answers “what do I still owe?” rather than showing a team average, which would be a number about somebody else." },
      { kind: "p", text: "Team leaders also get My uploads and Team progress. Create a topic, add chapters — each chapter is one video, either a link (an unlisted YouTube or Vimeo address is fine, and costs nothing to store) or a file you upload — then Publish when it is ready. Until you publish, your team cannot see it." },
      { kind: "note", tone: "warn", text: "A topic with no chapters cannot be published. An empty topic appearing in your agents' library reads as the CRM being broken rather than as you being half-way through." },
    ],
  },
  {
    id: "publishing-kit", n: 16, part: "For team leads", title: "Publishing a sales kit", teamLeadOnly: true,
    blocks: [
      { kind: "p", text: "Kit items are added from the project page itself, so the person who notices the price list is out of date is the person who can replace it." },
      {
        kind: "steps",
        items: [
          "Open the project and find the Sales kit card.",
          "Add an item, choose the section it belongs in, and name it.",
          "Paste a link, or type a value, or add it and then attach a file to it.",
          "Use the Note field for anything an agent must know before acting on it.",
        ],
      },
      { kind: "note", tone: "warn", text: "Name items for what they actually are. \"Available unit\" reads as developer availability; \"Unit Lock Sheet\" does not. An agent who misreads a label promises a unit that went last week." },
      { kind: "p", text: "Replacing a file keeps the item and its name, so agents' habits do not break — the old file is removed from storage at the same time. Removing an item does not touch anything on a deal." },
      { kind: "note", tone: "info", text: "Files you upload live in the agency's own storage, reached through this app. When you deactivate someone's account they lose access immediately, which is not true of a shared drive link they have saved." },
    ],
  },
  {
    id: "projects", n: 17, part: "For team leads", title: "Projects and unit types", teamLeadOnly: true,
    blocks: [
      { kind: "p", text: "Projects → New Project. Name, developer, state and area are the minimum. Also worth setting: developer commission rate, expected VP date, gallery address, and the pass-on window in days." },
      { kind: "p", text: "Then add unit types — label, built-up, beds, baths, parking, list price and the nett price after rebate. This is the level agents quote at. Every field stays editable, and editing keeps the type's identity, so any lead or booking pointing at it is not orphaned." },
      { kind: "note", tone: "info", text: "The price range on the project card is calculated, never typed. It comes from the unit types every time the card is drawn, using the nett price where one exists." },
      { kind: "p", text: "Projects belong to the agency, not to an agent. Every agent views them; only team leads and admins create, edit or delete. That differs from Properties on purpose — a listing belongs to the agent who won it." },
      { kind: "figure", src: "15-project.jpg", caption: "A project and its unit types.", w: 1568, h: 648 },
    ],
  },
  {
    id: "pools", n: 18, part: "For team leads", title: "Lead pools and pass-on", teamLeadOnly: true,
    blocks: [
      { kind: "p", text: "On a project page, Lead pool decides who receives that project's leads and in what order. New leads go round the list in rotation, so over any stretch of time everyone gets the same number. Position is a seat at the table, not a ranking." },
      {
        kind: "list",
        items: [
          "Add someone — they join the end of the rotation, which never disturbs the existing order",
          "Up and down arrows — change the order",
          "Pause — keeps their place but skips them, for somebody on leave",
          "Remove — takes them out entirely",
        ],
      },
      { kind: "p", text: "Set the pass-on window on the project's edit page. Leave it blank and pass-on never runs. A pool of one has nobody to pass to, and the screen says so." },
      { kind: "note", tone: "warn", text: "Tell the team when you switch pass-on on. Agents cannot see the pool or the rule from inside the app, so the first hand-over will otherwise be a surprise. And it applies retroactively — switching it on for a project with old untouched leads will move a batch on the first night." },
    ],
  },
  {
    id: "users", n: 19, part: "For team leads", title: "Users and templates", teamLeadOnly: true,
    blocks: [
      { kind: "p", text: "Users is where new sign-ups are approved. Somebody who has signed up appears inactive and can see nothing until you activate them and set their role." },
      { kind: "note", tone: "warn", text: "Deactivate somebody the day they leave. Their sign-in keeps working until you do." },
      { kind: "p", text: "Templates holds reusable WhatsApp and email messages with placeholders for name, project and price, so agents send something consistent without retyping it." },
      { kind: "figure", src: "18-users.jpg", caption: "The Users screen.", w: 1341, h: 866 },
    ],
  },
  {
    id: "spend", n: 20, part: "For team leads", title: "Advertising spend", teamLeadOnly: true,
    blocks: [
      { kind: "p", text: "Reports → Advertising spend. Record what each campaign cost and the report divides it by what the campaign produced. Agents never see agency ad spend." },
      {
        kind: "table",
        head: ["Figure", "What it tells you"],
        rows: [
          ["Cost per lead", "Whether the ad is reaching anyone"],
          ["Cost per appointment", "Whether those leads are real"],
          ["Cost per booking", "Whether the campaign works. Judge a live campaign on this"],
          ["Cost per closed deal", "The eventual truth — but months behind"],
        ],
      },
      { kind: "p", text: "Cost per booking is the one to act on. A booking happens within weeks of the lead; a completed sale is six to eighteen months later, so cost per closed deal is a verdict on last year's advertising." },
      { kind: "note", tone: "warn", text: "The most useful line is the flagged one. A campaign with money recorded and no matching leads appears as its own row — money out, nothing in." },
    ],
  },
  {
    id: "vocabulary", n: 21, part: "Reference", title: "Status vocabulary",
    blocks: [
      {
        kind: "table",
        head: ["Lead status", "Means"],
        rows: [
          ["New", "Arrived, nobody has spoken to them"],
          ["No Pick Up / Not Reachable", "You tried and could not get through"],
          ["Follow Up / Call Another Time", "You spoke to them and it continues"],
          ["Appointment", "Booked in to view"],
          ["Closed", "Real buyer — converted to a contact"],
          ["Not Searching / Unmatched Requirement / Blocked", "Not a buyer. Say so rather than leaving them"],
        ],
      },
      {
        kind: "table",
        head: ["Appointment", "Outcome", "Means"],
        rows: [
          ["scheduled", "—", "Booked in, not yet happened"],
          ["showed-up", "booked", "They turned up and booked a unit"],
          ["showed-up", "interested", "Turned up, keen, no booking yet"],
          ["showed-up", "undecided", "Turned up, thinking about it"],
          ["showed-up", "not-interested", "Turned up, ruled it out"],
          ["no-show", "—", "Did not turn up"],
          ["cancelled", "—", "Called off beforehand"],
        ],
      },
      {
        kind: "table",
        head: ["Term", "Means"],
        rows: [
          ["Setter", "The agent who owns the client and books the appointment"],
          ["Closer", "The agent who runs the presentation. Often the same person"],
          ["Lead pool", "The agents who receive a project's leads, in rotation"],
          ["Pass-on", "Moving an untouched agency lead to the next person in the pool"],
          ["Nett price", "List price after the developer's rebate — what the buyer pays"],
          ["VP", "Vacant possession — when the developer hands over the unit"],
          ["SPA", "Sale and purchase agreement"],
        ],
      },
    ],
  },
  {
    id: "pdpa", n: 22, part: "Reference", title: "Protecting client data",
    blocks: [
      { kind: "p", text: "Everything here is personal data belonging to real people, and Malaysian law gives them rights over it. A few habits keep the agency on the right side of that:" },
      {
        kind: "list",
        items: [
          "Record consent where the form asks for it. Leads from a form with a consent question carry the answer automatically — do not overwrite it.",
          "Do not export client lists to your own device unless you have been asked to.",
          "Use fake details in screenshots and in anything shared outside the agency.",
          "Tell your admin immediately if you think data has gone somewhere it should not have. Early is recoverable; late is not.",
        ],
      },
    ],
  },
];

/** Sections this user may see. Filtered here, not hidden in the browser. */
export function sectionsFor(isTeamLead: boolean): HelpSection[] {
  return HELP_SECTIONS.filter((s) => isTeamLead || !s.teamLeadOnly);
}

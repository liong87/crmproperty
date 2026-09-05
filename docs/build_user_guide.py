"""
Builds the Lanthorn Properties CRM user guide PDF.

Screenshots are optional. Every figure looks for a PNG/JPG in docs/screenshots/
named after its key (e.g. docs/screenshots/03-leads-list.png). If the file exists
it is embedded; if not, a labelled placeholder box is drawn instead, so the guide
is always complete and readable — you can add screenshots later and re-run.

    pip install reportlab --break-system-packages
    python docs/build_user_guide.py

Output: docs/Lanthorn-Properties-CRM-User-Guide.pdf
"""

import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "screenshots")
OUT = os.path.join(HERE, "Lanthorn-Properties-CRM-User-Guide.pdf")

APP_URL = "https://crm.lanthornproperties.com"

# Brand — pulled from the app's own palette so the guide matches the product.
INK = colors.HexColor("#12312C")
GREEN = colors.HexColor("#14524A")
ACCENT = colors.HexColor("#0F766E")
MUTED = colors.HexColor("#5B6B67")
RULE = colors.HexColor("#D8E0DD")
SOFT = colors.HexColor("#F1F6F4")
WARN = colors.HexColor("#B45309")
WARN_BG = colors.HexColor("#FEF6E7")

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

styles = getSampleStyleSheet()


def style(name, **kw):
    base = kw.pop("parent", styles["Normal"])
    return ParagraphStyle(name, parent=base, **kw)


S = {
    "title": style("title", fontName="Helvetica-Bold", fontSize=30, leading=35,
                   textColor=GREEN, spaceAfter=6),
    "subtitle": style("subtitle", fontName="Helvetica", fontSize=13, leading=18,
                      textColor=MUTED),
    "h1": style("h1", fontName="Helvetica-Bold", fontSize=18, leading=23,
                textColor=GREEN, spaceBefore=2, spaceAfter=8),
    "h2": style("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=17,
                textColor=INK, spaceBefore=12, spaceAfter=5),
    "body": style("body", fontName="Helvetica", fontSize=10, leading=15,
                  textColor=INK, spaceAfter=6),
    "small": style("small", fontName="Helvetica", fontSize=8.6, leading=12.5,
                   textColor=MUTED),
    "step": style("step", fontName="Helvetica", fontSize=10, leading=15,
                  textColor=INK, spaceAfter=3),
    "caption": style("caption", fontName="Helvetica-Oblique", fontSize=8.6,
                     leading=12, textColor=MUTED, spaceBefore=4, alignment=TA_CENTER),
    "cell": style("cell", fontName="Helvetica", fontSize=9, leading=13, textColor=INK),
    "cellb": style("cellb", fontName="Helvetica-Bold", fontSize=9, leading=13, textColor=INK),
    "note": style("note", fontName="Helvetica", fontSize=9.2, leading=13.5, textColor=INK),
    "toc": style("toc", fontName="Helvetica", fontSize=10.5, leading=19, textColor=INK),
}


class Rule(Flowable):
    """A thin horizontal rule."""

    def __init__(self, width, colour=RULE, thickness=0.6):
        super().__init__()
        self.width, self.colour, self.thickness = width, colour, thickness
        self.height = thickness

    def draw(self):
        self.canv.setStrokeColor(self.colour)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 0, self.width, 0)


class Placeholder(Flowable):
    """Dashed box standing in for a screenshot that hasn't been captured yet."""

    def __init__(self, width, height, label):
        super().__init__()
        self.width, self.height, self.label = width, height, label

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(SOFT)
        c.setStrokeColor(RULE)
        c.setDash(4, 3)
        c.setLineWidth(0.9)
        c.roundRect(0, 0, self.width, self.height, 5, stroke=1, fill=1)
        c.setDash()
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(self.width / 2, self.height / 2 + 4, "SCREENSHOT")
        c.setFont("Helvetica", 8.2)
        c.drawCentredString(self.width / 2, self.height / 2 - 8, self.label)
        c.restoreState()


def figure(key, caption, max_h=78 * mm):
    """Embed docs/screenshots/<key>.(png|jpg) if present, else a placeholder."""
    path = None
    for ext in (".png", ".jpg", ".jpeg", ".PNG", ".JPG"):
        candidate = os.path.join(SHOTS, key + ext)
        if os.path.exists(candidate):
            path = candidate
            break

    if path:
        iw, ih = ImageReader(path).getSize()
        w = CONTENT_W
        h = w * ih / iw
        if h > max_h:
            h = max_h
            w = h * iw / ih
        img = Image(path, width=w, height=h)
        img.hAlign = "CENTER"
        flow = [img]
    else:
        flow = [Placeholder(CONTENT_W, 42 * mm, f"{key}  —  {caption}")]

    flow.append(Paragraph(caption, S["caption"]))
    flow.append(Spacer(1, 8))
    return KeepTogether(flow)


def steps(items):
    return ListFlowable(
        [ListItem(Paragraph(t, S["step"]), leftIndent=16) for t in items],
        bulletType="1",
        bulletFontName="Helvetica-Bold",
        bulletFontSize=9.5,
        bulletColor=ACCENT,
        leftIndent=16,
        bulletDedent=12,
        spaceAfter=8,
    )


def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(t, S["step"]), leftIndent=14) for t in items],
        bulletType="bullet",
        start="•",
        bulletFontSize=8,
        bulletColor=ACCENT,
        leftIndent=14,
        bulletDedent=8,
        spaceAfter=8,
    )


def callout(text, kind="note"):
    """Tinted box for notes and warnings."""
    bg, bar = (WARN_BG, WARN) if kind == "warn" else (SOFT, ACCENT)
    inner = Paragraph(text, S["note"])
    t = Table([[inner]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, bar),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return KeepTogether([t, Spacer(1, 10)])


def table(rows, widths, header=True):
    data = []
    for i, row in enumerate(rows):
        st = S["cellb"] if (header and i == 0) else S["cell"]
        data.append([Paragraph(str(c), st) for c in row])
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFCFB")]),
    ]
    if header:
        cmds += [("BACKGROUND", (0, 0), (-1, 0), SOFT),
                 ("LINEBELOW", (0, 0), (-1, 0), 0.8, RULE)]
    t.setStyle(TableStyle(cmds))
    return KeepTogether([t, Spacer(1, 10)])


def section(number, title):
    return [
        Spacer(1, 2),
        Paragraph(f'<font color="#0F766E">{number}</font>&nbsp;&nbsp;{title}', S["h1"]),
        Rule(CONTENT_W),
        Spacer(1, 9),
    ]


# ----------------------------------------------------------------------------
# Page furniture
# ----------------------------------------------------------------------------

def cover_page(c, doc):
    c.saveState()
    c.setFillColor(GREEN)
    c.rect(0, PAGE_H - 118 * mm, PAGE_W, 118 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 27)
    c.drawString(MARGIN, PAGE_H - 62 * mm, "Lanthorn Properties CRM")
    c.setFont("Helvetica", 17)
    c.drawString(MARGIN, PAGE_H - 74 * mm, "User Guide")
    c.setFont("Helvetica", 10.5)
    c.setFillColor(colors.HexColor("#BFD8D3"))
    c.drawString(MARGIN, PAGE_H - 90 * mm, "For agents, managers and administrators")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(MARGIN, 20 * mm, APP_URL)
    c.restoreState()


def body_page(c, doc):
    c.saveState()
    c.setStrokeColor(RULE)
    c.setLineWidth(0.5)
    c.line(MARGIN, PAGE_H - 14 * mm, PAGE_W - MARGIN, PAGE_H - 14 * mm)
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    c.drawString(MARGIN, PAGE_H - 12 * mm, "Lanthorn Properties CRM — User Guide")
    c.drawRightString(PAGE_W - MARGIN, 12 * mm, str(c.getPageNumber()))
    c.restoreState()


def build():
    doc = BaseDocTemplate(
        OUT, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=18 * mm,
        title="Lanthorn Properties CRM — User Guide",
        author="Lanthorn Properties CRM",
    )
    frame = Frame(MARGIN, 18 * mm, CONTENT_W, PAGE_H - MARGIN - 18 * mm, id="body")
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[frame], onPage=cover_page),
        PageTemplate(id="body", frames=[frame], onPage=body_page),
    ])
    doc.build(story())


# ----------------------------------------------------------------------------
# Content
# ----------------------------------------------------------------------------

def story():
    s = []

    # ---- Cover -------------------------------------------------------------
    # Everything after this first page uses the plain template — without this the
    # green cover banner is painted on every page.
    s.append(NextPageTemplate("body"))
    s.append(Spacer(1, 128 * mm))
    s.append(Paragraph(
        "How to use the system, from a lead arriving to a unit being booked "
        "and the paperwork going through.", S["subtitle"]))
    s.append(Spacer(1, 14))
    s.append(table([
        ["Who this is for", "Agents, managers and administrators"],
        ["Where to sign in", APP_URL],
        ["Works on", "Phone, tablet and desktop browsers"],
    ], [45 * mm, CONTENT_W - 45 * mm], header=False))

    s.append(PageBreak())
    s.append(Paragraph("Contents", S["h1"]))
    s.append(Rule(CONTENT_W))
    s.append(Spacer(1, 10))
    for line in [
        "<b>Getting started</b>",
        "1 &nbsp; Signing in",
        "2 &nbsp; The screens",
        "3 &nbsp; Your dashboard",
        "<b>Leads</b>",
        "4 &nbsp; Where leads come from",
        "5 &nbsp; Working a lead",
        "6 &nbsp; Qualify or disqualify",
        "7 &nbsp; When a lead moves on",
        "<b>Appointments</b>",
        "8 &nbsp; Booking an appointment",
        "9 &nbsp; Recording what happened",
        "<b>Deals and paperwork</b>",
        "10 &nbsp; Creating a deal",
        "11 &nbsp; The two pipelines",
        "12 &nbsp; The paperwork checklist",
        "<b>Staying on top</b>",
        "13 &nbsp; Inbox",
        "14 &nbsp; Reports",
        "<b>Projects</b>",
        "15 &nbsp; The sales kit",
        "<b>Your own tools</b>",
        "16 &nbsp; Your Facebook lead capture",
        "17 &nbsp; Learning Hub",
        "<b>For managers and administrators</b>",
        "18 &nbsp; Publishing a sales kit",
        "19 &nbsp; Projects and unit types",
        "20 &nbsp; Lead pools and pass-on",
        "21 &nbsp; Users and templates",
        "22 &nbsp; Advertising spend",
        "<b>Reference</b>",
        "23 &nbsp; Status vocabulary",
        "24 &nbsp; Protecting client data (PDPA)",
        "25 &nbsp; Troubleshooting",
    ]:
        s.append(Paragraph(line, S["toc"]))

    s.append(Spacer(1, 16))
    s.append(callout(
        "<b>New here?</b> Read sections 1 to 15 in order. That is the whole daily loop: "
        "sign in, work a lead, book an appointment, record the outcome, create the deal "
        "and chase the paperwork, with 15 covering the sales kit you work from. "
        "Sections 16 and 17 are yours too \u2014 connecting your own Facebook, and the "
        "training your team leader has published. Sections 18 to 22 are for managers and "
        "administrators, and you will not be able to reach those screens as an agent."))

    # ---- 1 -----------------------------------------------------------------
    s.append(PageBreak())
    s += section("1", "Signing in")

    s.append(Paragraph(
        "There are <b>two doors</b>, and you pass through both. The first is Cloudflare, "
        "which decides whether you may see the CRM at all; the second is the CRM\u2019s own "
        "sign-in, which decides who you are. Expect both the first time \u2014 people who are "
        "not expecting the first one assume something has gone wrong.", S["body"]))

    s.append(Paragraph("Your first sign-in", S["h2"]))
    s.append(steps([
        f"Open <b>{APP_URL}</b> in your browser. Add it to your phone home screen \u2014 "
        "you will use it in the field.",
        "<b>Door one.</b> A Cloudflare page asks for your email address. Enter the one "
        "your administrator registered. It emails you a six-digit code; type that in. "
        "This does not happen again for 24 hours.",
        "<b>Door two.</b> The CRM\u2019s own sign-in appears. Sign in with <b>the work email "
        "address your administrator was given</b>. Sign-in is handled by Clerk; you do not "
        "create a password inside the CRM.",
        "If you land on <b>Account pending approval</b>, that is correct. New accounts "
        "arrive inactive and cannot see any client data.",
        "Tell your administrator. Once they activate you, sign in again and you reach "
        "the dashboard.",
    ]))
    s.append(callout(
        "<b>The six-digit code often lands in Spam the first time.</b> It is a new sender "
        "on a new domain, which is exactly what mail providers are suspicious of. Look "
        "there before reporting a problem, mark it <b>Not spam</b>, and it will behave "
        "afterwards.", "warn"))
    s.append(figure("01-sign-in", "The sign-in screen."))

    s.append(callout(
        "<b>Use the right email.</b> Your Clerk account is matched to your staff record "
        "by email address. Sign up with a different address and the system has no way to "
        "know who you are — it creates a brand-new inactive account instead of finding "
        "yours.", "warn"))

    s.append(Paragraph("What your role controls", S["h2"]))
    s.append(table([
        ["Role", "Sees", "Can also"],
        ["Agent", "Their own leads, contacts, deals and appointments", "&mdash;"],
        ["Manager", "Their team's records",
         "Reassign leads, create projects, manage lead pools, see advertising spend"],
        ["Admin", "Everything in the agency",
         "All of the above, plus approving accounts and setting roles"],
    ], [24 * mm, 60 * mm, CONTENT_W - 84 * mm]))
    s.append(Paragraph(
        "This is enforced in the data itself rather than by hiding buttons: an agent "
        "cannot reach another agent's client by guessing a web address.", S["body"]))

    # ---- 2 -----------------------------------------------------------------
    s.append(PageBreak())
    s += section("2", "The screens")

    s.append(table([
        ["Screen", "What it is for"],
        ["Dashboard", "Your day at a glance — what needs chasing"],
        ["Leads", "Enquiries that have not yet become clients"],
        ["Contacts", "People you have qualified and are working with"],
        ["Projects", "New launch developments and their unit types"],
        ["Properties", "Resale and rental listings"],
        ["Pipeline", "Deals in progress, on a board by stage"],
        ["Appointments", "Gallery visits and viewings, and how they went"],
        ["Inbox", "Follow-ups due, paperwork due, and notifications"],
        ["Reports", "The funnel, by project and by agent"],
        ["Leads capture", "Connect <i>your own</i> Facebook and pick the lead forms you want"],
        ["Learning", "Training videos from your team leader, and what you have watched"],
        ["Templates <i>(manager)</i>", "Reusable WhatsApp and email messages"],
        ["Users <i>(manager)</i>", "Approving accounts and setting roles"],
    ], [44 * mm, CONTENT_W - 44 * mm]))

    s.append(Paragraph(
        "<b>Search everything.</b> The search box at the top of the sidebar looks across "
        "leads, contacts, projects and properties at once, so you do not have to guess "
        "which screen a name is filed under. Press <b>Ctrl-K</b> (<b>Cmd-K</b> on a Mac) "
        "from anywhere to open it without reaching for the mouse; type, then press "
        "<b>Enter</b> on the result you want.", S["body"]))

    s += section("3", "Your dashboard")
    s.append(Paragraph(
        "The dashboard answers one question: <i>what needs me today?</i> It shows your "
        "lead and pipeline counts, follow-ups that are due, and two warnings that only "
        "appear when they matter — a red banner counting overdue documents, and a count "
        "of leads that have gone quiet.", S["body"]))
    s.append(figure("02-dashboard", "The dashboard."))
    s.append(callout(
        "<b>No news means no banner.</b> A permanent &ldquo;0 overdue&rdquo; row is "
        "furniture people learn to skip, so those warnings are absent entirely when there "
        "is nothing wrong. If you see one, it is real."))

    # ---- 4 -----------------------------------------------------------------
    s.append(PageBreak())
    s += section("4", "Where leads come from")

    s.append(Paragraph("Four routes in, and the route decides who gets the lead:", S["body"]))
    s.append(table([
        ["How it arrives", "Who it goes to"],
        ["<b>New Lead</b> button", "Whoever created it — you. An agent cannot assign to somebody else"],
        ["<b>Import CSV</b>", "Whoever uploaded the file"],
        ["Facebook or Instagram lead form", "The project's lead pool, in rotation"],
        ["Website form or public API", "The same rotation, or the agency-wide one if no project is attached"],
    ], [52 * mm, CONTENT_W - 52 * mm]))
    s.append(Paragraph(
        "So a lead you sourced yourself is yours from the moment you enter it. Rotation "
        "only ever touches leads nobody owns yet — the ones the agency paid for.", S["body"]))

    s.append(Paragraph("The leads list", S["h2"]))
    s.append(Paragraph(
        "Search by name, phone or email; filter by status. The <b>Assigned to</b> column "
        "shows who owns each lead, and calls out <b>Unassigned</b> in red — a lead nobody "
        "owns is the one thing on that screen worth noticing.", S["body"]))
    s.append(figure("04-leads-list", "The leads list, with search, status filter and the Assigned to column."))

    s.append(Paragraph("Adding one by hand", S["h2"]))
    s.append(Paragraph(
        "<b>Leads &rarr; New Lead.</b> Name and phone are required; everything else helps "
        "later. Set the <b>Project</b> if the enquiry is about a specific launch — that is "
        "what makes per-project reporting work.", S["body"]))
    s.append(figure("03-new-lead", "The New Lead form."))

    s.append(Paragraph("Importing a CSV", S["h2"]))
    s.append(Paragraph(
        "<b>Leads &rarr; Import CSV</b>, for a list from a roadshow or an export from "
        "elsewhere. Duplicates are detected by phone and email, so re-importing the same "
        "file does not create the same person twice.", S["body"]))
    s.append(figure("05-import-csv", "The CSV import screen with its summary of results."))

    # ---- 5 -----------------------------------------------------------------
    s.append(PageBreak())
    s += section("5", "Working a lead")

    s.append(Paragraph(
        "Open a lead to see everything in one place: their details, the project they "
        "enquired about, and a timeline of everything that has happened.", S["body"]))
    s.append(figure("06-lead-detail", "A lead record with its activity timeline."))

    s.append(steps([
        "<b>Log every contact.</b> Call, WhatsApp, email or note. This is not admin for "
        "its own sake — it is what proves you are working the lead, and it is what stops "
        "a project lead being passed to somebody else.",
        "<b>Set a follow-up date</b> when you log something. It appears on your dashboard "
        "and Reminders on that day, so you have one list rather than a separate diary.",
        "<b>Use WhatsApp from the lead.</b> The button opens a chat with their number "
        "filled in, and templates fill in their name and the project.",
    ]))
    s.append(callout(
        "<b>Log it the same day.</b> Everything downstream — pass-on, response-time "
        "reporting, the funnel — reads the timeline. Work that is not logged did not "
        "happen as far as the system is concerned.", "warn"))

    # ---- 6 -----------------------------------------------------------------
    s += section("6", "Qualify or disqualify")

    s.append(Paragraph(
        "A lead has four statuses: <b>new</b>, <b>contacted</b>, <b>qualified</b> and "
        "<b>disqualified</b>.", S["body"]))
    s.append(Paragraph(
        "When someone is genuinely interested and can proceed, use <b>Qualify</b>. That "
        "converts them to a <b>contact</b> — carrying across their details, their consent "
        "record and their history — and a contact is what a deal is built on.", S["body"]))
    s.append(Paragraph(
        "When they are not a buyer, mark them <b>disqualified</b> rather than leaving them "
        "sitting in your list. It keeps your own numbers honest and stops the system "
        "chasing you about them.", S["body"]))
    s.append(figure("07-qualify", "The Qualify and Disqualify buttons on a lead."))
    s.append(callout(
        "<b>Disqualifying is part of the funnel, not a failure.</b> Conversion is measured "
        "against every lead received, including the ones you rejected. Rejecting a poor "
        "lead quickly is good work."))

    # ---- 7 -----------------------------------------------------------------
    s.append(PageBreak())
    s += section("7", "When a lead moves on")

    s.append(Paragraph(
        "On a new launch, a lead left untouched can be passed to the next person in the "
        "project's pool. This only happens when <i>all</i> of the following are true:", S["body"]))
    s.append(bullets([
        "The lead is attached to a <b>project</b>, and that project has a pass-on window set",
        "It came from the <b>agency</b> — a Facebook form, the website or the API. A lead "
        "you entered by hand or imported yourself is never passed on",
        "You have logged <b>nothing</b> since it was assigned to you",
        "There is <b>no appointment</b> booked, and it is not marked qualified",
        "The pool has more than one active person",
    ]))
    s.append(Paragraph(
        "Any activity at all stops the clock. Log a call and the lead stays yours, and the "
        "window restarts from that moment.", S["body"]))
    s.append(callout(
        "<b>Nothing happens quietly.</b> Every transfer writes a note on the lead's "
        "timeline naming both agents, and messages each of you. You will never discover it "
        "from a colleague."))

    # ---- 8 -----------------------------------------------------------------
    s.append(PageBreak())
    s += section("8", "Booking an appointment")

    s.append(Paragraph(
        "From a lead or a contact, choose <b>Schedule appointment</b>. Pick the subject — "
        "a <b>project</b> from the New launch group, or a <b>property</b> for a resale "
        "viewing. It is one or the other, never both.", S["body"]))
    s.append(Paragraph("Then set the date and time, and choose who is closing it:", S["body"]))
    s.append(bullets([
        "<b>I am closing this myself</b> — the usual case.",
        "<b>Another agent</b> — under a setter and closer split, you booked it and they "
        "run the presentation. Both of you are recorded, both of you can see it, and "
        "commission splits on that record later.",
    ]))
    s.append(callout(
        "<b>Booking a project appointment links the lead to that project</b> if it did not "
        "already have one. Somebody who turns up at a gallery is a lead for that project, "
        "and the timeline says so."))

    # ---- 9 -----------------------------------------------------------------
    s += section("9", "Recording what happened")

    s.append(Paragraph(
        "<b>Appointments</b> opens as a board: Scheduled &rarr; Showed up &rarr; Booked "
        "&rarr; No show &rarr; Cancelled. Use <b>Record outcome</b> on a card after the "
        "appointment.", S["body"]))
    s.append(figure("09-appointments", "The appointments board with the no-show rate above it."))
    s.append(table([
        ["Status", "Then outcome"],
        ["Showed up", "<b>Booked</b>, interested, undecided or not interested"],
        ["No show", "&mdash;"],
        ["Cancelled", "&mdash;"],
    ], [40 * mm, CONTENT_W - 40 * mm]))
    s.append(Paragraph(
        "The <b>no-show rate</b> above the board is the most useful operational number in "
        "project sales — it tells you whether your confirmations are working. It counts "
        "only appointments that reached a verdict, so a fresh booking never dilutes it.",
        S["body"]))
    s.append(callout(
        "<b>Record the outcome the same day.</b> An appointment with no outcome counts as "
        "nothing in the funnel, so a good week can look like a bad one purely because "
        "nobody closed the loop.", "warn"))

    # ---- 10 ----------------------------------------------------------------
    s.append(PageBreak())
    s += section("10", "Creating a deal")

    s.append(Paragraph(
        "A deal needs a <b>contact</b>, so qualify the lead first. On the contact, choose "
        "<b>Create Deal</b>.", S["body"]))
    s.append(Paragraph(
        "The <b>Project</b> picker decides which pipeline the deal joins, and it is "
        "pre-filled from the lead they came in on:", S["body"]))
    s.append(bullets([
        "<b>A project selected</b> &rarr; new launch deal, starting at <b>Booked</b>",
        "<b>Left blank</b> &rarr; resale deal, starting at <b>New</b>",
    ]))
    s.append(Paragraph(
        "A line under the picker tells you which you are about to get. Check it before "
        "saving.", S["body"]))

    # ---- 11 ----------------------------------------------------------------
    s += section("11", "The two pipelines")

    s.append(Paragraph(
        "<b>Pipeline</b> has a <b>New launch</b> tab and a <b>Resale</b> tab. A deal "
        "appears on one and never both.", S["body"]))
    s.append(table([
        ["New launch", "Resale"],
        ["Booked", "New"],
        ["SPA Signed", "Contacted"],
        ["Loan Approved", "Viewing Scheduled"],
        ["Completed", "Negotiation"],
        ["Cancelled", "Closed Won / Closed Lost"],
    ], [CONTENT_W / 2, CONTENT_W / 2]))
    s.append(figure("11-pipeline", "The pipeline board, on the New launch tab."))
    s.append(Paragraph(
        "A project deal starts at <b>Booked</b> rather than at the beginning because the "
        "appointment board already owns everything before that. Repeating those steps here "
        "would count the same event twice and let the funnel and the pipeline disagree "
        "about the same week.", S["body"]))

    # ---- 12 ----------------------------------------------------------------
    s.append(PageBreak())
    s += section("12", "The paperwork checklist")

    s.append(Paragraph(
        "Click <b>Paperwork</b> on a pipeline card. The checklist is already there, "
        "created from the project template, with a suggested due date on each item counted "
        "from today:", S["body"]))
    s.append(bullets([
        "Booking form &middot; Booking fee receipt &middot; IC or passport copy &middot; Income documents",
        "Loan application submitted &middot; <b>Loan approval letter</b> &middot; SPA signed &middot; Stamping and legal",
    ]))
    s.append(figure("12-paperwork", "The paperwork checklist on a deal."))
    s.append(Paragraph(
        "On each item you can tick it off, change the due date, attach a file, or add your "
        "own item at the bottom.", S["body"]))
    s.append(callout(
        "<b>Attaching a file does not tick the item.</b> That is deliberate — somebody "
        "still has to confirm the document is the right one and legible. Tick it when you "
        "have checked it, not when it uploads.", "warn"))
    s.append(Paragraph(
        "Overdue items turn red and say how many days late. They also appear on "
        "<b>Reminders</b> and, when overdue, on the dashboard — so paperwork chases you "
        "rather than waiting to be found.", S["body"]))
    s.append(callout(
        "<b>The loan approval letter is the one that kills deals.</b> It expires. Watch "
        "its date more closely than the rest.", "warn"))

    # ---- 13 ----------------------------------------------------------------
    s.append(PageBreak())
    s += section("13", "Inbox")

    s.append(Paragraph(
        "Everything still open, on one screen: paperwork with a deadline, the follow-ups "
        "you promised, and your notifications.", S["body"]))

    s.append(Paragraph("All and Late", S["h2"]))
    s.append(Paragraph(
        "The two tabs at the top right carry their own counts. <b>All</b> is the full "
        "picture. <b>Late</b> strips it back to what has already passed its date \u2014 "
        "overdue paperwork and overdue follow-ups, nothing else. Start on Late when you "
        "have ten minutes and want them spent on the right things.", S["body"]))

    s.append(Paragraph("Paperwork due", S["h2"]))
    s.append(Paragraph(
        "Anything due in the next 14 days, plus anything already overdue. Overdue items "
        "never drop off, even once they are well past that window.", S["body"]))
    s.append(Paragraph(
        "Items are grouped <b>by client</b>, one row per booking, with the project named "
        "and a count of what is still outstanding. Click a row to open it and see the "
        "individual documents; a booking with something overdue opens by itself, so the "
        "case that matters is never hidden behind a click. The right-hand end of each row "
        "is the one number that decides whether it needs you today \u2014 a red "
        "<b>overdue</b> count, or the date the next item falls due.", S["body"]))

    s.append(Paragraph("Sorting", S["h2"]))
    s.append(table([
        ["Sort", "Use it when"],
        ["Soonest due", "The default. What is most urgent, first."],
        ["Client A\u2013Z", "You know whose file you are looking for and scrolling beats searching."],
        ["Newest lead", "You want the freshest bookings on top, even if nothing in them is late yet."],
    ], [40 * mm, CONTENT_W - 40 * mm]))
    s.append(Paragraph(
        "The sort is remembered in the page address, so a sorted Inbox is a link you can "
        "send to a colleague and they will see what you saw.", S["body"]))

    s.append(Paragraph("Follow-ups and notifications", S["h2"]))
    s.append(Paragraph(
        "Below the paperwork sit your follow-ups \u2014 every date you set while logging "
        "activity. Notifications sit in their own column on a wide screen: leads assigned "
        "to you, bookings, and the weekly summary.", S["body"]))

    s.append(Paragraph("Keeping it clean", S["h2"]))
    s.append(Paragraph(
        "Notifications are not meant to be kept forever. <b>Mark all read</b> silences the "
        "unread dots but leaves the record on the page. <b>Clear read</b> takes the tidied "
        "ones off it, and asks you to confirm first because it acts on more rows than you "
        "can see at once. A single row can be dismissed on its own with the \u00d7 at its "
        "right-hand end \u2014 no confirmation, because a one-row mistake is obvious.", S["body"]))
    s.append(figure("13-inbox", "The Inbox: paperwork grouped by client, with the sort controls above it."))
    s.append(callout(
        "<b>Nothing here is deleted outright.</b> Cleared and dismissed notifications are "
        "hidden, not destroyed, and older ones are purged on a schedule. Paperwork and "
        "follow-ups are never cleared from this screen \u2014 they leave it by being done."))
    s.append(callout(
        "<b>There is no separate Reminders screen.</b> Follow-ups and paperwork used to "
        "live on their own page; both answered &ldquo;what needs me?&rdquo;, so an agent had "
        "two places to check and reliably checked neither. They are one screen now, and "
        "/reminders sends you here."))

    # ---- 14 ----------------------------------------------------------------
    s += section("14", "Reports")

    s.append(Paragraph("The funnel is the heart of it:", S["body"]))
    s.append(Paragraph(
        '<font color="#0F766E"><b>Leads &rarr; Appointments set &rarr; Showed up &rarr; '
        "Booked</b></font>", S["body"]))
    s.append(Paragraph(
        "with the conversion rate at each step. Underneath, the same figures <b>by "
        "project</b> and, for managers, <b>by agent</b>. A trend chart plots leads, "
        "appointments and bookings week by week.", S["body"]))
    s.append(figure("14-reports", "The Reports screen, showing the funnel and the trend."))
    s.append(Paragraph(
        "The period selector — 30 days, 90 days, 6 months, 12 months, All time — drives the "
        "funnel, the trend and both tables together. The four tiles at the top are "
        "<i>not</i> filtered: open pipeline is a snapshot of what is live right now, so "
        "windowing it would say something untrue.", S["body"]))
    s.append(callout(
        "<b>Setting and closing are credited separately.</b> Appointments <i>set</i> count "
        "for whoever booked them; show-ups and bookings count for whoever ran the "
        "presentation. A setter who hands over good appointments is never shown as having "
        "converted nothing."))
    s.append(Paragraph(
        "A project with leads but no appointments still appears in the table. That is "
        "deliberate — it is the interesting case.", S["body"]))

    # ---- 15 ----------------------------------------------------------------
    s.append(PageBreak())
    s += section("15", "The sales kit")

    s.append(Paragraph(
        "Every project page carries a <b>Sales kit</b>: the selling price list, the "
        "brochure and layout plans, the APDL and developer licence, the blank forms you "
        "hand a buyer, the panel lawyer, and the showroom location. One place, and always "
        "the version the agency stands behind — you never have to ask anyone which price "
        "list is the current one.", S["body"]))
    s.append(Paragraph(
        "<b>You cannot change a kit.</b> Managers and administrators publish it; agents "
        "read it. That is deliberate: it is the only way two agents can never end up "
        "quoting a buyer from two different copies of the same price list.", S["body"]))
    s.append(bullets([
        "<b>A file</b> — click to download it. Price lists, brochures, licences, blank forms.",
        "<b>A link</b> — opens elsewhere, such as a shared sheet or a map pin for the showroom.",
        "<b>A value</b> — a plain fact you need at hand, like an HDA account number or a "
        "panel banker&rsquo;s direct line.",
    ]))
    s.append(figure("15-sales-kit", "A project&rsquo;s sales kit, grouped by section."))
    s.append(callout(
        "<b>A unit lock or availability sheet in a kit records only what OUR agents have "
        "committed.</b> Other agencies sell these same projects, and their bookings never "
        "appear in it. Always confirm a unit is still available with the developer before "
        "you promise it to a buyer.", kind="warn"))
    s.append(Paragraph(
        "<b>Blank forms live in the kit. Signed ones do not.</b> The buyer&rsquo;s completed "
        "and signed copy belongs on that buyer&rsquo;s deal, under the paperwork checklist "
        "in section 12 — not back in the kit, which everybody shares.", S["body"]))

    # ---- 16 ----------------------------------------------------------------
    s += section("16", "Your Facebook lead capture")

    s.append(Paragraph(
        "Leads capture is <b>yours</b>, not the office\u2019s. Every agent connects their own "
        "Facebook account and chooses their own Pages and lead forms. Leads from a form you "
        "picked arrive assigned to you, automatically, within seconds of the person "
        "submitting it \u2014 no one retypes anything and no one has to notice it first.",
        S["body"]))

    s.append(Paragraph("Connecting, once", S["h2"]))
    s.append(steps([
        "Open <b>Leads capture</b> and press <b>Connect Facebook</b>. You are sent to "
        "Facebook to log in as yourself.",
        "Choose the Pages you want leads from. If Facebook offers <b>Continue with "
        "previous settings</b>, do not take it \u2014 press <b>Edit settings</b> and tick the "
        "Pages, or you will come back with nothing connected.",
        "Back in the CRM, press <b>+ New</b> and pick the lead form by name.",
        "That is the whole setup. New leads on that form now reach you.",
    ]))
    s.append(figure("19-leads-capture", "Leads capture, showing one agent\u2019s own connections."))

    s.append(callout(
        "<b>Nobody else can see your connection.</b> Not another agent, not a manager, not "
        "an administrator \u2014 the screen shows only what the signed-in person connected, and "
        "your Facebook access token is encrypted and never displayed. If you leave, "
        "disconnecting removes it."))
    s.append(callout(
        "<b>A Facebook lead form cannot be edited once it exists</b> \u2014 Meta allows only "
        "create and archive. Read a new form through before submitting it."))
    s.append(callout(
        "<b>If a lead does not appear</b>, check that the form is still ticked here, then "
        "tell your administrator. A lead that Facebook accepted is not lost \u2014 Meta retries "
        "delivery for 36 hours."))

    # ---- 17 ----------------------------------------------------------------
    s.append(PageBreak())
    s += section("17", "Learning Hub")

    s.append(Paragraph(
        "Training material, kept where the work happens. A team leader records or links "
        "videos; the agents under them watch and tick them off. It exists so that what a "
        "good negotiator knows stops living only in their head.", S["body"]))

    s.append(Paragraph("Library \u2014 everybody", S["h2"]))
    s.append(Paragraph(
        "Every topic published by your team leader, as cards showing how many chapters "
        "there are, roughly how long they run, and how far <i>you</i> have got. Open one and "
        "you get the video, the leader\u2019s notes, any files attached to that chapter, and a "
        "chapter list down the side.", S["body"]))
    s.append(Paragraph(
        "Press <b>Mark as watched</b> when you finish a chapter. That is the only thing "
        "feeding your progress bar, and it is what your leader sees.", S["body"]))
    s.append(figure("20-learning-library", "The Learning Hub library."))

    s.append(callout(
        "<b>The progress bar is yours alone.</b> It answers &ldquo;what do I still owe?&rdquo; "
        "rather than showing a team average, which would be a number about somebody else."))

    s.append(Paragraph("My uploads \u2014 team leaders", S["h2"]))
    s.append(steps([
        "Create a <b>topic</b> \u2014 a title, a short summary, and optionally a category.",
        "Add <b>chapters</b> to it. Each chapter is one video: either a link (an unlisted "
        "YouTube or Vimeo address is fine, and costs nothing to store) or a file you upload.",
        "Add notes and any files agents should keep \u2014 a script, a checklist, a price list.",
        "Press <b>Publish</b> when it is ready. Until you do, your team cannot see it.",
    ]))
    s.append(callout(
        "<b>A topic with no chapters cannot be published.</b> An empty topic appearing in "
        "your agents\u2019 library reads as the CRM being broken rather than as you being "
        "half-way through."))

    s.append(Paragraph("Team progress \u2014 team leaders", S["h2"]))
    s.append(Paragraph(
        "Who has watched what, across your team. Useful before a coaching session, and "
        "useful for spotting a topic nobody finishes \u2014 which is usually a fact about the "
        "topic rather than about the team.", S["body"]))

    s.append(callout(
        "<b>You only see your own team.</b> A leader writes and sees their own material and "
        "their own agents\u2019 progress. An administrator can read every leader\u2019s published "
        "library but cannot edit it \u2014 training belongs to whoever recorded it.", "warn"))

    # ---- 18 ----------------------------------------------------------------
    s.append(PageBreak())
    s += section("18", "Publishing a sales kit")
    s.append(Paragraph("Managers and administrators only.", S["small"]))
    s.append(Spacer(1, 6))

    s.append(Paragraph(
        "Kit items are added from the project page itself, so the person who notices the "
        "price list has gone stale is also the person who can replace it.", S["body"]))
    s.append(steps([
        "Open the project and find the <b>Sales kit</b> card.",
        "<b>Add an item</b>, choose the section it belongs in, and give it a name.",
        "Paste a link, or type a value, or add it and then attach a file to it.",
        "Use the <b>Note</b> field for anything an agent must know before acting on it.",
    ]))
    s.append(callout(
        "<b>Name items for what they actually are.</b> &ldquo;Available unit&rdquo; reads as "
        "developer availability; &ldquo;Unit Lock Sheet&rdquo; does not. An agent who "
        "misreads a label promises a buyer a unit that went last week.", kind="warn"))
    s.append(Paragraph(
        "<b>Replacing a file keeps the item and its name</b>, so agents&rsquo; habits do not "
        "break, and the old file is removed from storage at the same time. Removing an item "
        "affects nothing on any deal — deal paperwork is a separate thing entirely.", S["body"]))
    s.append(callout(
        "Files you upload live in the agency&rsquo;s own storage, reached only through this "
        "app. Deactivate somebody&rsquo;s account and their access ends immediately — which "
        "is not true of a shared drive link they saved months ago."))

    # ---- 19 ----------------------------------------------------------------
    s.append(PageBreak())
    s += section("19", "Projects and unit types")
    s.append(Paragraph("Managers and administrators only.", S["small"]))
    s.append(Spacer(1, 6))

    s.append(Paragraph(
        "<b>Projects &rarr; New Project.</b> Name, developer, state and area are the "
        "minimum. Also worth setting: developer commission rate, expected VP date, gallery "
        "address, and the <b>pass-on window</b> in days.", S["body"]))
    s.append(Paragraph(
        "Then add <b>unit types</b> — Type A, built-up, beds, baths, parking, list price "
        "and the nett price after rebate. This is the level agents actually quote at. Every "
        "field stays editable afterwards, and editing keeps the type's identity, so any "
        "lead or booking pointing at it is not orphaned.", S["body"]))
    s.append(figure("15-project", "A project with its unit types."))
    s.append(callout(
        "<b>The price range on the project card is calculated, never typed.</b> It comes "
        "from the unit types every time the card is drawn, using the nett price where one "
        "exists. If you ever see a figure there that matches something you typed into the "
        "project itself, something is wrong."))
    s.append(Paragraph(
        "Projects belong to the agency, not to an agent. Every agent can view them; only "
        "managers and administrators create, edit or delete. That differs from Properties "
        "on purpose — a listing belongs to the agent who won it.", S["body"]))

    # ---- 20 ----------------------------------------------------------------
    s.append(PageBreak())
    s += section("20", "Lead pools and pass-on")
    s.append(Paragraph("Managers and administrators only.", S["small"]))
    s.append(Spacer(1, 6))

    s.append(Paragraph(
        "On a project page, <b>Lead pool</b> decides who receives that project's leads and "
        "in what order. New leads go round the list in rotation, so over any stretch of "
        "time everyone gets the same number. Position is a seat at the table, not a "
        "ranking.", S["body"]))
    s.append(bullets([
        "<b>Add someone</b> — they join the end of the rotation, which never disturbs the "
        "existing order",
        "<b>Up and down arrows</b> — change the order",
        "<b>Pause</b> — keeps their place but skips them, for somebody on leave",
        "<b>Remove</b> — takes them out entirely",
    ]))
    s.append(figure("16-lead-pool", "A project's lead pool."))
    s.append(Paragraph(
        "Set the pass-on window on the project's edit page. Leave it blank and pass-on "
        "never runs — the right setting for a project where one person owns the "
        "relationship. A pool of one has nobody to pass to, and the screen says so.", S["body"]))
    s.append(callout(
        "<b>Tell the team when you switch pass-on on.</b> Agents cannot see the pool or the "
        "rule from inside the app, so the first hand-over will otherwise be a surprise. And "
        "it applies retroactively — switching it on for a project with old untouched leads "
        "will move a batch on the first night.", "warn"))

    # ---- 21 ----------------------------------------------------------------
    s.append(PageBreak())
    s += section("21", "Users and templates")
    s.append(Paragraph("Managers and administrators only.", S["small"]))
    s.append(Spacer(1, 6))

    s.append(Paragraph(
        "<b>Users</b> is where new sign-ups are approved. Somebody who has signed up "
        "appears inactive and can see nothing until you activate them and set their role.",
        S["body"]))
    s.append(figure("18-users", "The Users screen, where roles are set and accounts approved."))
    s.append(callout(
        "<b>Deactivate somebody the day they leave.</b> Their sign-in keeps working until "
        "you do.", "warn"))
    s.append(Paragraph(
        "<b>Templates</b> holds reusable WhatsApp and email messages with placeholders for "
        "name, project and price, so agents send something consistent without retyping it.",
        S["body"]))

    # ---- 22 ----------------------------------------------------------------
    s += section("22", "Advertising spend")
    s.append(Paragraph("Managers and administrators only. Agents never see agency ad spend.", S["small"]))
    s.append(Spacer(1, 6))

    s.append(Paragraph(
        "<b>Reports &rarr; Advertising spend.</b> Record what each campaign cost and the "
        "report divides it by what the campaign produced:", S["body"]))
    s.append(table([
        ["Figure", "What it tells you"],
        ["Cost per lead", "Whether the ad is reaching anyone"],
        ["Cost per appointment", "Whether those leads are real"],
        ["<b>Cost per booking</b>", "Whether the campaign works. Judge a live campaign on this"],
        ["Cost per closed deal", "The eventual truth — but months behind"],
    ], [50 * mm, CONTENT_W - 50 * mm]))
    s.append(Paragraph(
        "Cost per booking is the one to act on. A booking happens within weeks of the "
        "lead; a completed sale is six to eighteen months later, so cost per closed deal is "
        "a verdict on last year's advertising and cannot inform this month's budget.", S["body"]))
    s.append(callout(
        "<b>The most useful line is the flagged one.</b> A campaign with money recorded and "
        "no matching leads appears as its own row — money out, nothing in. That is the row "
        "to look at first.", "warn"))

    # ---- 23 ----------------------------------------------------------------
    s.append(PageBreak())
    s += section("23", "Status vocabulary")

    s.append(Paragraph("Lead status", S["h2"]))
    s.append(table([
        ["Status", "Means"],
        ["new", "Arrived, nobody has spoken to them"],
        ["contacted", "You have reached them at least once"],
        ["qualified", "Real buyer — converted to a contact"],
        ["disqualified", "Not a buyer. Say so rather than leaving them"],
    ], [40 * mm, CONTENT_W - 40 * mm]))

    s.append(Paragraph("Appointment status and outcome", S["h2"]))
    s.append(table([
        ["Status", "Outcome", "Means"],
        ["scheduled", "&mdash;", "Booked in, not yet happened"],
        ["showed-up", "booked", "They turned up and booked a unit"],
        ["showed-up", "interested", "Turned up, keen, no booking yet"],
        ["showed-up", "undecided", "Turned up, thinking about it"],
        ["showed-up", "not-interested", "Turned up, ruled it out"],
        ["no-show", "&mdash;", "Did not turn up"],
        ["cancelled", "&mdash;", "Called off beforehand"],
    ], [30 * mm, 32 * mm, CONTENT_W - 62 * mm]))

    s.append(Paragraph("Words used in this guide", S["h2"]))
    s.append(table([
        ["Term", "Means"],
        ["Setter", "The agent who owns the client and books the appointment"],
        ["Closer", "The agent who runs the presentation. Often the same person"],
        ["Lead pool", "The agents who receive a project's leads, in rotation"],
        ["Pass-on", "Moving an untouched agency lead to the next person in the pool"],
        ["Nett price", "List price after the developer's rebate — what the buyer pays"],
        ["VP", "Vacant possession — when the developer hands over the unit"],
        ["SPA", "Sale and purchase agreement"],
    ], [34 * mm, CONTENT_W - 34 * mm]))

    # ---- 24 ----------------------------------------------------------------
    s.append(PageBreak())
    s += section("24", "Protecting client data (PDPA)")

    s.append(Paragraph(
        "Everything in this system is personal data belonging to real people, and Malaysian "
        "law gives them rights over it. A few habits keep the agency on the right side of "
        "that:", S["body"]))
    s.append(bullets([
        "<b>Record consent where the form asks for it.</b> Leads that arrive from a form "
        "with a consent question carry the answer automatically — do not overwrite it.",
        "<b>Do not export client lists to your own device</b> unless you have been asked to.",
        "<b>Use fake details in screenshots</b> and in anything you share outside the agency.",
        "<b>Tell your administrator immediately</b> if you think data has gone somewhere it "
        "should not have. Early is recoverable; late is not.",
    ]))
    s.append(Paragraph(
        "Administrators can export everything held about one person, and erase them, from "
        "the contact record — that is how a request from a client is answered.", S["body"]))

    # ---- 25 ----------------------------------------------------------------
    s += section("25", "Troubleshooting")

    s.append(table([
        ["Symptom", "Almost always"],
        ["The six-digit code never arrived",
         "Check your Spam folder \u2014 it usually lands there the first time. If it is not there either, your address is not on the access list; ask your administrator to add it."],
        ["Cloudflare says you do not have access",
         "You typed an address your administrator has not registered. Try the exact one they gave you."],
        ["Stuck on &ldquo;Account pending approval&rdquo;",
         "An administrator has not activated you yet, or you signed up with a different email address than the one they were given."],
        ["A screen in this guide is missing from the menu",
         "It is manager or administrator only. Sections 18 to 22 are all like this."],
        ["No Edit button on a record",
         "It is not assigned to you, or the lead has already been qualified. Qualified leads become read-only."],
        ["WhatsApp does not open",
         "The phone number is not in international format. Edit the record and use +60123456789."],
        ["A lead disappeared from your list",
         "It may have been passed on — check its timeline, which names both agents. See section 7."],
        ["A follow-up fired at the wrong time",
         "Reminders use Malaysian time. Check the time you entered rather than your device clock."],
        ["A file will not upload",
         "Check the file type and your signal. If it keeps failing, tell your administrator."],
        ["A page shows an error",
         "Reload once. If it persists, note what you were doing and tell your administrator."],
    ], [52 * mm, CONTENT_W - 52 * mm]))

    s.append(Spacer(1, 6))
    s.append(Rule(CONTENT_W))
    s.append(Spacer(1, 8))
    s.append(Paragraph(
        "Questions this guide does not answer should go to your system administrator.",
        S["small"]))

    return s


if __name__ == "__main__":
    os.makedirs(SHOTS, exist_ok=True)
    build()
    print("Wrote", OUT)

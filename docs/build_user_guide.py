"""
Builds the PropertyAgent CRM user guide PDF.

Screenshots are optional. Every figure looks for a PNG/JPG in docs/screenshots/
named after its key (e.g. docs/screenshots/03-leads-list.png). If the file exists
it is embedded; if not, a labelled placeholder box is drawn instead, so the guide
is always complete and readable — you can add screenshots later and re-run.

    pip install reportlab --break-system-packages
    python docs/build_user_guide.py

Output: docs/PropertyAgent-CRM-User-Guide.pdf
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
OUT = os.path.join(HERE, "PropertyAgent-CRM-User-Guide.pdf")

APP_URL = "https://propertyagent-crm.lanthornrealty.workers.dev"

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
    c.setFont("Helvetica-Bold", 34)
    c.drawString(MARGIN, PAGE_H - 62 * mm, "PropertyAgent CRM")
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
    c.drawString(MARGIN, PAGE_H - 12 * mm, "PropertyAgent CRM — User Guide")
    c.drawRightString(PAGE_W - MARGIN, 12 * mm, str(c.getPageNumber()))
    c.restoreState()


def build():
    doc = BaseDocTemplate(
        OUT, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=18 * mm,
        title="PropertyAgent CRM — User Guide",
        author="PropertyAgent CRM",
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
        "Everything you need to capture a lead, qualify it into a contact, "
        "track the deal and keep your client records compliant.", S["subtitle"]))
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
        "1 &nbsp; Getting started",
        "2 &nbsp; Finding your way around",
        "3 &nbsp; Leads — capturing enquiries",
        "4 &nbsp; Qualifying a lead into a contact",
        "5 &nbsp; Contacts — people you are working with",
        "6 &nbsp; Properties — your listings",
        "7 &nbsp; Pipeline — moving deals to close",
        "8 &nbsp; Reminders and follow-ups",
        "9 &nbsp; Reports",
        "10 &nbsp; For administrators",
        "11 &nbsp; Protecting client data (PDPA)",
        "12 &nbsp; Troubleshooting",
    ]:
        s.append(Paragraph(line, S["toc"]))

    s.append(Spacer(1, 16))
    s.append(callout(
        "<b>New here?</b> Read sections 1 to 5. That covers the daily loop: sign in, "
        "add a lead, log what happened, qualify it, and keep in touch. Everything else "
        "can wait until you need it."))

    # ---- 1. Getting started ------------------------------------------------
    s.append(PageBreak())
    s += section("1", "Getting started")

    s.append(Paragraph("Signing in for the first time", S["h2"]))
    s.append(steps([
        f"Open <b>{APP_URL}</b> in your browser. Add it to your phone's home screen — "
        "you will use it in the field.",
        "Choose <b>Sign up</b> and register with your work email address.",
        "Verify your email if prompted.",
        "You will land on a screen saying <b>Account pending approval</b>. This is normal.",
        "Tell your administrator you have registered. Once they approve you, sign in again "
        "and you will reach the dashboard.",
    ]))
    s.append(figure("01-sign-in", "The sign-in screen."))

    s.append(callout(
        "<b>Why the wait?</b> New accounts arrive switched off on purpose. Client records "
        "include identity-card numbers and budgets, so nobody sees data until an "
        "administrator grants access."))

    s.append(Paragraph("What your role lets you do", S["h2"]))
    s.append(Paragraph(
        "Your administrator assigns one of three roles. This decides what you can see "
        "and change.", S["body"]))
    s.append(table([
        ["Role", "Can see", "Can change"],
        ["Agent", "Only records assigned to you", "Only records assigned to you"],
        ["Manager", "Everything across the team", "Team records; can assign leads to agents"],
        ["Administrator", "Everything", "Everything, plus user management and data deletion"],
    ], [32 * mm, 62 * mm, CONTENT_W - 94 * mm]))

    s.append(callout(
        "If a colleague cannot find a lead you are discussing, it is almost certainly "
        "assigned to someone else. Ask a manager to reassign it rather than creating a "
        "duplicate."))

    # ---- 2. Navigation -----------------------------------------------------
    s.append(PageBreak())
    s += section("2", "Finding your way around")

    s.append(Paragraph(
        "On a computer the menu sits down the left-hand side. On a phone it becomes a row "
        "of icons across the top that you can swipe through. The same seven areas are "
        "available either way.", S["body"]))

    s.append(table([
        ["Area", "What it is for"],
        ["Dashboard", "Your daily starting point: key numbers and follow-ups due"],
        ["Leads", "Enquiries that have come in but are not yet qualified"],
        ["Contacts", "People you are actively working with"],
        ["Properties", "Your listings, with photographs"],
        ["Pipeline", "Deals in progress, arranged by stage"],
        ["Reminders", "Every follow-up you have set, oldest first"],
        ["Reports", "Totals, conversion rate and the agent leaderboard"],
        ["Users", "Managers and administrators only — approve people and set roles"],
    ], [38 * mm, CONTENT_W - 38 * mm]))

    s.append(figure("02-dashboard", "The dashboard, showing the four summary tiles and upcoming follow-ups."))

    s.append(Paragraph("The dashboard at a glance", S["h2"]))
    s.append(bullets([
        "<b>Open leads</b> — enquiries not yet qualified or disqualified.",
        "<b>Qualified</b> — how many became contacts, with your conversion rate.",
        "<b>Open pipeline</b> — total ringgit value of deals still in play.",
        "<b>Follow-ups due</b> — reminders you have set, flagged when overdue.",
    ]))
    s.append(Paragraph(
        "Agents see their own figures. Managers and administrators see the whole team, "
        "labelled <i>Team overview</i>.", S["body"]))

    # ---- 3. Leads ----------------------------------------------------------
    s.append(PageBreak())
    s += section("3", "Leads — capturing enquiries")

    s.append(Paragraph(
        "A lead is an enquiry: someone who has shown interest but is not yet a client. "
        "Leads arrive from your website, from Facebook or Google advertising, from a CSV "
        "file, or you type them in yourself.", S["body"]))

    s.append(Paragraph("Adding a lead by hand", S["h2"]))
    s.append(steps([
        "Go to <b>Leads</b> and choose <b>New Lead</b>.",
        "Fill in <b>Name</b> and <b>Phone</b>. These two are required; everything else can follow later.",
        "Enter the phone in international format — <b>+60123456789</b>. This keeps WhatsApp working.",
        "Set <b>Interest</b> to buy, rent, sell or invest.",
        "Add <b>Budget min</b> and <b>Budget max</b> in ringgit, and <b>Preferred areas</b> "
        "such as “Mont Kiara, Bangsar”.",
        "Tick <b>Consent to be contacted (PDPA)</b> if the person agreed to be contacted.",
        "Choose <b>Save</b>.",
    ]))
    s.append(figure("03-new-lead", "The New Lead form."))

    s.append(callout(
        "<b>Consent matters.</b> Tick the box only when the person actually agreed — on a "
        "web form, in writing, or clearly in conversation. It is your record that contacting "
        "them is lawful under the PDPA.", "warn"))

    s.append(Paragraph("Finding a lead", S["h2"]))
    s.append(Paragraph(
        "The Leads screen has a search box and a status filter. Search matches name, phone "
        "or email. Filter by <b>new</b>, <b>contacted</b>, <b>qualified</b> or "
        "<b>disqualified</b>. Long lists are split into pages of 25.", S["body"]))
    s.append(figure("04-leads-list", "The Leads list with the search box and status filter."))

    s.append(Paragraph("Importing many leads from a CSV file", S["h2"]))
    s.append(Paragraph(
        "Use this after exporting from Facebook Ads Manager or Google Ads. Column names are "
        "matched loosely, so exports usually work without editing.", S["body"]))
    s.append(steps([
        "Go to <b>Leads</b> then <b>Import CSV</b>.",
        "Choose your file, or paste the contents into the box.",
        "Check the preview text, then choose <b>Import leads</b>.",
        "Read the summary: rows created, duplicates merged, and any failures with line numbers.",
    ]))
    s.append(Paragraph(
        "Recognised columns: <b>name, phone, email, interest, preferredAreas, budgetMin, "
        "budgetMax, consent</b>. Phone accepts 012-345 6789 or +60123456789. Budgets accept "
        "850000, “RM 850,000” or 850k.", S["body"]))
    s.append(figure("05-import-csv", "The CSV import screen with its summary of results."))

    s.append(callout(
        "Duplicates are merged automatically by phone or email, so re-importing the same file "
        "will not create a second copy of anyone. Rows with no consent column are still "
        "imported but carry no consent record — the summary tells you how many.", "warn"))

    s.append(Paragraph("Working a lead", S["h2"]))
    s.append(Paragraph(
        "Open a lead to see its details, log what happened, and message the person.", S["body"]))
    s.append(steps([
        "Open the lead from the list.",
        "Use <b>WhatsApp</b> to write a message. It opens WhatsApp with the text ready, and "
        "records that you sent it.",
        "Under <b>Activity &amp; Notes</b>, pick a type — call, email, viewing, note or whatsapp.",
        "Write what happened in <b>Notes</b>.",
        "Set a <b>Follow-up reminder</b> date and time if you need to chase this. Times are "
        "Malaysian time.",
        "Choose <b>Log activity</b>.",
    ]))
    s.append(figure("06-lead-detail", "A lead record with the activity timeline underneath."))

    s.append(callout(
        "Log every call and viewing, even briefly. The timeline is what lets a colleague pick "
        "up your client if you are on leave, and it is what the reports count."))

    # ---- 4. Qualifying -----------------------------------------------------
    s.append(PageBreak())
    s += section("4", "Qualifying a lead into a contact")

    s.append(Paragraph(
        "When an enquiry becomes someone you are genuinely working with, qualify it. The lead "
        "becomes a <b>contact</b>, and the whole history follows across.", S["body"]))
    s.append(steps([
        "Open the lead.",
        "Choose <b>Qualify → Contact</b>.",
        "You are taken straight to the new contact record.",
    ]))
    s.append(Paragraph(
        "If the enquiry is going nowhere — wrong number, no budget, not serious — choose "
        "<b>Disqualify</b> instead. Nothing is deleted; the lead is simply marked and drops "
        "out of your open list.", S["body"]))
    s.append(figure("07-qualify", "The Qualify and Disqualify buttons on a lead."))

    s.append(callout(
        "Qualifying happens once and cannot be undone from the screen. The original lead stays "
        "linked to the contact, so nothing is lost — but you cannot edit the lead afterwards.",
        "warn"))

    # ---- 5. Contacts -------------------------------------------------------
    s += section("5", "Contacts — people you are working with")

    s.append(Paragraph(
        "A contact holds more than a lead: nationality, occupation, identity document, notes, "
        "and the full activity history.", S["body"]))
    s.append(bullets([
        "<b>Search</b> by name, phone or email from the Contacts screen.",
        "<b>Edit</b> to add nationality, occupation, identity details or notes.",
        "<b>WhatsApp</b> to message them, logged automatically.",
        "<b>Activity &amp; Notes</b> works exactly as it does on a lead.",
        "<b>Create Deal</b> starts tracking a transaction — see section 7.",
    ]))
    s.append(figure("08-contact-detail", "A contact record."))

    s.append(callout(
        "Identity-card and passport numbers are sensitive personal data. Record them only when "
        "you genuinely need them for a transaction, never in the free-text notes field.", "warn"))

    # ---- 6. Properties -----------------------------------------------------
    s.append(PageBreak())
    s += section("6", "Properties — your listings")

    s.append(steps([
        "Go to <b>Properties</b> and choose <b>New Property</b>.",
        "Give it a <b>Title</b> — how you would describe it to a client.",
        "Choose <b>Listing type</b> (sale or rent) and <b>Property type</b> — condo, "
        "serviced apartment, terrace, semi-D, bungalow, land, shop or office.",
        "Set the <b>State</b> and <b>Area</b>, and the full address if you have it.",
        "Add size, bedrooms, bathrooms, car parks and the <b>asking price</b>.",
        "Record <b>Tenure</b> (freehold or leasehold), <b>Title type</b> (individual, strata "
        "or master) and whether it is a <b>Bumi lot</b> — these affect who can buy.",
        "Save, then add photographs from the property page.",
    ]))
    s.append(figure("09-new-property", "The property form."))

    s.append(Paragraph("Photographs and status", S["h2"]))
    s.append(Paragraph(
        "Upload photographs one at a time from the property page; delete any with the small "
        "Delete button on the image. Keep the <b>status</b> current — active, pending, sold, "
        "rented or withdrawn — because the reports count listings by status.", S["body"]))
    s.append(figure("10-property-photos", "Managing photographs on a property."))

    # ---- 7. Pipeline -------------------------------------------------------
    s += section("7", "Pipeline — moving deals to close")

    s.append(Paragraph(
        "A deal is a transaction you are working on for a contact. The pipeline shows deals as "
        "cards in columns, one column per stage, with a running total per column.", S["body"]))
    s.append(steps([
        "Open the <b>contact</b> and choose <b>Create Deal</b>.",
        "Enter the <b>deal value</b> in ringgit and choose <b>Create</b>.",
        "You land on the Pipeline. To move a deal, use the dropdown on its card and pick the "
        "new stage — it saves immediately.",
    ]))
    s.append(figure("11-pipeline", "The pipeline board with deals in stage columns."))

    s.append(callout(
        "Keep stages honest. <b>Open pipeline</b> on the dashboard and reports is calculated "
        "from these values, so a deal parked in the wrong stage quietly distorts everyone's "
        "numbers."))

    # ---- 8. Reminders ------------------------------------------------------
    s.append(PageBreak())
    s += section("8", "Reminders and follow-ups")

    s.append(Paragraph(
        "Reminders are created when you set a follow-up date while logging an activity. The "
        "Reminders screen lists every open one, with overdue items flagged. Agents see their "
        "own; managers and administrators see the team's.", S["body"]))
    s.append(bullets([
        "Set a follow-up every time you leave a conversation unfinished.",
        "Check Reminders at the start of the day — the dashboard also shows the next five.",
        "Times are Malaysian time, whatever your device is set to.",
    ]))
    s.append(figure("12-reminders", "The Reminders screen."))

    # ---- 9. Reports --------------------------------------------------------
    s += section("9", "Reports")

    s.append(Paragraph("Reports show where things stand. Agents see their own book; managers "
                       "and administrators see the whole team.", S["body"]))
    s.append(bullets([
        "<b>Total leads</b>, <b>Qualified</b> and <b>Conversion</b> — how many enquiries turn into contacts.",
        "<b>Open pipeline</b> — ringgit value of deals still in play.",
        "<b>Leads by status</b> and <b>Properties by status</b>.",
        "<b>Pipeline by stage</b> — count and value in each stage.",
        "<b>Activities (7 days)</b> — how much was logged in the last week.",
        "<b>Agent leaderboard</b> — leads, contacts and won value per agent.",
    ]))
    s.append(figure("13-reports", "The Reports screen."))

    # ---- 10. Admin ---------------------------------------------------------
    s.append(PageBreak())
    s += section("10", "For administrators")

    s.append(Paragraph("Approving a new member of staff", S["h2"]))
    s.append(steps([
        "The person registers themselves at the sign-in screen and waits.",
        "Go to <b>Users</b>. They appear as <b>inactive</b>, with the role <b>agent</b>.",
        "Set the correct role, then activate the account.",
        "Tell them they are in.",
    ]))
    s.append(figure("14-users", "The Users screen, where roles are set and accounts approved."))

    s.append(callout(
        "Deactivating somebody takes effect immediately and blocks every screen — do this the "
        "day someone leaves. You cannot change your own role or deactivate yourself, which "
        "prevents locking the last administrator out.", "warn"))

    s.append(Paragraph("Choosing roles sensibly", S["h2"]))
    s.append(bullets([
        "<b>Agent</b> for most people. They see only their own clients.",
        "<b>Manager</b> for team leaders who need the full picture and to reassign leads.",
        "<b>Administrator</b> sparingly — it includes permanent deletion of client data and "
        "export of identity-card numbers. Two is usually right: one primary, one spare.",
    ]))

    s.append(Paragraph("Exporting or erasing a client's data", S["h2"]))
    s.append(Paragraph(
        "On any contact, administrators see a <b>PDPA — Personal Data</b> panel.", S["body"]))
    s.append(bullets([
        "<b>Export all data (JSON)</b> — everything held about that person, for a data-access request.",
        "<b>Permanently delete</b> — erases the contact, the originating lead, deals, activities, "
        "documents and message logs. You must type DELETE to confirm.",
    ]))
    s.append(callout(
        "Erasure cannot be undone and is not covered by a soft delete. Use it only for a genuine "
        "erasure request, and note who asked and when.", "warn"))

    # ---- 11. PDPA ----------------------------------------------------------
    s.append(PageBreak())
    s += section("11", "Protecting client data (PDPA)")

    s.append(Paragraph(
        "This system holds names, phone numbers, budgets and identity-card numbers. Malaysia's "
        "Personal Data Protection Act governs how you handle them. In daily practice:", S["body"]))
    s.append(bullets([
        "Record consent when you get it — tick the consent box on the lead.",
        "Collect only what you need. Identity documents belong in the ID fields, and only when "
        "a transaction requires them.",
        "Never paste identity-card or passport numbers into notes.",
        "Do not forward client lists to personal email or WhatsApp groups.",
        "Sign out on shared or borrowed devices.",
        "Pass any request to see or delete data to an administrator.",
    ]))
    s.append(callout(
        "Leads that were never qualified are deleted automatically after 24 months, along with "
        "their activities and documents. Contacts and their history are kept, because they "
        "represent a real client relationship."))

    # ---- 12. Troubleshooting ----------------------------------------------
    s += section("12", "Troubleshooting")

    s.append(table([
        ["Problem", "What to do"],
        ["“Account pending approval”", "An administrator has not activated you yet. Ask them to open Users and approve your account."],
        ["A lead or contact you expected is missing", "It is assigned to another agent. Agents only see their own records — ask a manager."],
        ["No Edit button on a record", "It is not assigned to you, or the lead has already been qualified. Qualified leads become read-only."],
        ["WhatsApp does not open", "The phone number is not in international format. Edit the record and use +60123456789."],
        ["A follow-up fired at the wrong time", "Reminders use Malaysian time. Check the time you entered rather than your device clock."],
        ["Photograph will not upload", "Check the file is an image and your signal is stable. If it keeps failing, tell your administrator."],
        ["A page shows an error", "Reload once. If it persists, note what you were doing and tell your administrator."],
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

/**
 * A small, realistic dataset for a demo run: one project, three leads at three
 * different points in the journey, two appointments, one deal with paperwork.
 *
 * Run:
 *   pnpm seed:sample            # report only — changes nothing
 *   APPLY=1 pnpm seed:sample    # actually insert
 *
 * PowerShell:
 *   $env:APPLY=1; pnpm seed:sample; Remove-Item Env:APPLY
 *
 * WHO IT SEEDS FOR
 *
 * By default the first admin. Pass OWNER_EMAIL to seed a different signed-in user —
 * a tester, say — and run it once per person:
 *
 *   $env:APPLY=1
 *   $env:OWNER_EMAIL="lanthornrealty@gmail.com"; pnpm seed:sample
 *   Remove-Item Env:OWNER_EMAIL, Env:APPLY
 *
 * Running it twice is safe and additive. The PROJECT is shared — it is reused if it
 * already exists, because two agents working the same launch is the real situation and
 * a second identical project on the board would just be confusing. The LEADS are not:
 * each run picks an unused set of people, so the tester gets their own three clients
 * rather than a second copy of yours. Every list in the app is scoped by ownership, so
 * without that each person would be looking at an empty queue.
 *
 * Intended to follow `pnpm reset:sample`, but it does not require it: everything
 * inserted is new, and nothing existing is touched or deleted.
 *
 * WHY THE DEAL IS OPENED THROUGH `openDeal` RATHER THAN INSERTED
 *
 * A hand-written `insert into deals` produces a row that looks right and behaves
 * wrong: no paperwork checklist, so the Inbox stays empty, the dashboard's overdue
 * banner never fires, and the one workflow most worth demonstrating — a loan approval
 * with a deadline — cannot be shown. `openDeal` is the same function a booked
 * appointment calls, so the seeded deal is indistinguishable from a real one. If the
 * pipeline has no stages it returns null, and this script says so rather than pressing
 * on and leaving half a dataset.
 *
 * EVERY NAME AND NUMBER HERE IS INVENTED. Phones sit in +6011-3000-00xx, which is a
 * real Malaysian prefix but a block reserved here for seeding — no real subscriber is
 * reachable on them, and nothing in this file should ever be mistaken for a client
 * record. Emails are on example.com, which cannot receive mail by RFC 2606.
 */
import { maskUrl } from "../lib/load-env";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../lib/db/client";
import {
  users,
  leads,
  contacts,
  projects,
  projectUnitTypes,
  appointments,
  activities,
  leadRemarks,
  dealStages,
  type User,
} from "../lib/db/schema";
import { openDeal } from "../server/deals/create-internal";

const APPLY = (process.env.APPLY ?? "") !== "";

const MYR = (ringgit: number) => ringgit * 100; // the schema stores integer cents
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

const PROJECT_NAME = "Seri Bayu Residences";

/**
 * One set of three clients per person seeded.
 *
 * Separate people rather than the same three names twice: two agents each holding a
 * "Kavitha Nair" is the sort of thing that makes a tester doubt what they are looking
 * at, and duplicate-detection would flag them at each other. Phone blocks are distinct
 * per set for the same reason.
 *
 * Roles within a set are fixed — [never touched, being worked, booked] — because the
 * script below relies on that order, and because it is what makes each seeded person's
 * dashboard show all five stages instead of one.
 */
const PERSONA_SETS = [
  {
    prefix: "+60113000007",
    people: [
      { name: "Amirah Zulkifli", email: "amirah.z@example.com" },
      { name: "Jonathan Teoh", email: "jonathan.teoh@example.com" },
      { name: "Kavitha Nair", email: "kavitha.nair@example.com" },
    ],
  },
  {
    prefix: "+60113000008",
    people: [
      { name: "Faizal Rahim", email: "faizal.rahim@example.com" },
      { name: "Michelle Cheong", email: "michelle.cheong@example.com" },
      { name: "Arun Selvam", email: "arun.selvam@example.com" },
    ],
  },
  {
    prefix: "+60113000009",
    people: [
      { name: "Nadia Ismail", email: "nadia.ismail@example.com" },
      { name: "Brandon Lai", email: "brandon.lai@example.com" },
      { name: "Suresh Menon", email: "suresh.menon@example.com" },
    ],
  },
] as const;

/** The project, its unit types, and nothing else. Only called on a first run. */
async function createProject() {
  const [row] = await db
    .insert(projects)
    .values({
      name: PROJECT_NAME,
      developer: "Bayu Land Sdn Bhd",
      state: "Selangor",
      area: "Cheras",
      status: "open",
      notes: "Freehold serviced apartments beside the MRT. Sample project for demo runs.",
    })
    .returning({ id: projects.id, name: projects.name });

  await db.insert(projectUnitTypes).values([
    { projectId: row!.id, label: "Type A — 2 bedroom", builtUpSqft: 743, bedrooms: 2, bathrooms: 2, carParks: 1, listPrice: MYR(468_000), totalUnits: 120, sortOrder: 1 },
    { projectId: row!.id, label: "Type B — 3 bedroom", builtUpSqft: 1_012, bedrooms: 3, bathrooms: 2, carParks: 2, listPrice: MYR(625_000), totalUnits: 84, sortOrder: 2 },
    { projectId: row!.id, label: "Type C — 3 bedroom dual key", builtUpSqft: 1_268, bedrooms: 3, bathrooms: 3, carParks: 2, listPrice: MYR(792_000), totalUnits: 36, sortOrder: 3 },
  ]);

  return row!;
}

async function main() {
  console.log(`Database: ${maskUrl(process.env.DATABASE_URL ?? "")}`);

  /*
   * Seeded against a REAL user, not a fabricated one.
   *
   * The whole point is that the person signs in and sees this on their own dashboard —
   * every list in the app is scoped by ownership, so data assigned to an invented
   * agent would be invisible to everyone and the demo would show five empty screens.
   *
   * The user must already EXIST, which means they have signed in at least once. There
   * is no creating one here on purpose: an account row invented by a script has no
   * matching identity at the auth provider, so nobody could ever log into it, and it
   * would sit in the Users screen looking like a real colleague.
   */
  const wanted = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();

  const [owner] = wanted
    ? await db
        .select()
        .from(users)
        .where(and(eq(users.email, wanted), isNull(users.deletedAt)))
        .limit(1)
    : await db
        .select()
        .from(users)
        .where(and(eq(users.role, "admin"), isNull(users.deletedAt)))
        .orderBy(users.createdAt)
        .limit(1);

  if (!owner) {
    console.error(
      wanted
        ? `No user found with the email ${wanted}.\n` +
            "They need to sign in to the CRM once so the account exists, then re-run.\n" +
            "Check the exact address on the Users screen — it is matched exactly."
        : "No admin user found. Sign in once first, then re-run.",
    );
    process.exit(1);
  }
  console.log(`Owner: ${owner.name} <${owner.email}> (${owner.role})`);

  const [stage] = await db
    .select({ id: dealStages.id, name: dealStages.name })
    .from(dealStages)
    .where(and(eq(dealStages.pipeline, "project"), isNull(dealStages.deletedAt)))
    .orderBy(dealStages.sortOrder)
    .limit(1);

  if (!stage) {
    console.error(
      "No project pipeline stages exist, so a deal cannot be created.\n" +
        "Run `pnpm seed:project-checklist` first, or restore the deal stages.",
    );
    process.exit(1);
  }

  /*
   * Pick the first set of people whose phone block is not already in the database.
   * Re-running for a second person then produces three NEW clients rather than a
   * duplicate of the first three.
   */
  const used = await db
    .select({ phone: leads.phone })
    .from(leads)
    .where(isNull(leads.deletedAt));
  const taken = new Set(used.map((r) => r.phone));
  const set = PERSONA_SETS.find((p) => !p.people.some((_, i) => taken.has(`${p.prefix}${i + 1}`)));

  if (!set) {
    console.error(
      `All ${PERSONA_SETS.length} sample client sets are already in use.\n` +
        "Clear the existing sample data with `pnpm reset:sample`, or add another set to\n" +
        "PERSONA_SETS in this file.",
    );
    process.exit(1);
  }

  const existingProject = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.name, PROJECT_NAME), isNull(projects.deletedAt)))
    .limit(1);
  const reusingProject = existingProject.length > 0;

  console.log("\nWill create:");
  console.log(
    reusingProject
      ? `   0  projects — reusing the existing "${PROJECT_NAME}"`
      : `   1  project — ${PROJECT_NAME}, Cheras (3 unit types)`,
  );
  console.log(`   3  leads — ${set.people.map((p) => p.name).join(", ")}`);
  console.log("      one new, one being worked, one that booked");
  console.log("   2  appointments — one upcoming, one that showed up and booked");
  console.log("   1  contact + 1 deal, opened at the first stage with its checklist");
  console.log("   a  few activities and remarks, so the timelines are not blank");

  if (!APPLY) {
    console.log("\nNothing was created. Re-run with APPLY=1 to insert.");
    return;
  }

  // ---- project ------------------------------------------------------------
  /*
   * Reused when it is already there. Two agents working one launch is the real
   * situation, and a second identical project on the board — with its own unit types
   * and its own sales kit — would be a bug an agent reports rather than a feature.
   */
  const project = reusingProject
    ? existingProject[0]!
    : await createProject();

  if (!reusingProject) {
    console.log(`Created project ${project.name}.`);
  }

  // ---- leads --------------------------------------------------------------
  // ---- leads --------------------------------------------------------------
  /*
   * Three leads at three points, chosen so that every screen has something on it:
   * one nobody has touched (Working Leads, Active), one mid-conversation with a
   * follow-up date (Inbox), and one that went all the way to a booking (Pipeline,
   * funnel, paperwork). A seed where every row is in the same state demonstrates one
   * screen and leaves the rest empty.
   */
  const seeded = await db
    .insert(leads)
    .values([
      {
        name: set.people[0]!.name,
        phone: `${set.prefix}1`,
        email: set.people[0]!.email,
        source: "manual",
        sourceDetail: "Walk-in at the gallery",
        interest: "buy",
        budgetMin: MYR(400_000),
        budgetMax: MYR(550_000),
        preferredAreas: "Cheras, Kajang",
        projectId: project.id,
        status: "new",
        assignedTo: owner.id,
      },
      {
        name: set.people[1]!.name,
        phone: `${set.prefix}2`,
        email: set.people[1]!.email,
        source: "api",
        sourceDetail: "Facebook lead form",
        utmSource: "facebook",
        utmCampaign: "seri-bayu-launch",
        interest: "invest",
        budgetMin: MYR(600_000),
        budgetMax: MYR(800_000),
        preferredAreas: "Cheras",
        projectId: project.id,
        status: "follow-up",
        assignedTo: owner.id,
      },
      {
        name: set.people[2]!.name,
        phone: `${set.prefix}3`,
        email: set.people[2]!.email,
        source: "manual",
        sourceDetail: "Referral from an existing buyer",
        interest: "buy",
        budgetMin: MYR(600_000),
        budgetMax: MYR(700_000),
        preferredAreas: "Cheras, Sri Petaling",
        projectId: project.id,
        status: "closed", // converted below — the same status conversion sets
        assignedTo: owner.id,
      },
    ])
    .returning({ id: leads.id, name: leads.name });

  const [untouched, working, booked] = seeded;

  await db.insert(leadRemarks).values([
    {
      leadId: working!.id,
      body: "Called — asked for the Type B floor plan and the maintenance fee. Sending both.",
      userId: owner.id,
    },
    {
      leadId: working!.id,
      body: "Wants to view on a weekend. Following up Friday.",
      userId: owner.id,
    },
  ]);

  await db.insert(activities).values([
    {
      entityType: "leads",
      entityId: working!.id,
      type: "call",
      body: "Spoke for 6 minutes. Investor, second property, no urgency.",
      occurredAt: daysFromNow(-3),
      createdBy: owner.id,
    },
    {
      entityType: "leads",
      entityId: working!.id,
      type: "whatsapp",
      body: "Sent Type B floor plan and price list.",
      occurredAt: daysFromNow(-2),
      createdBy: owner.id,
    },
  ]);

  // ---- the one that booked ------------------------------------------------
  const [contact] = await db
    .insert(contacts)
    .values({
      name: set.people[2]!.name,
      phone: `${set.prefix}3`,
      email: set.people[2]!.email,
      assignedTo: owner.id,
      sourceLeadId: booked!.id,
    })
    .returning({ id: contacts.id });

  await db
    .update(leads)
    .set({ convertedToContactId: contact!.id })
    .where(eq(leads.id, booked!.id));

  const deal = await openDeal(
    {
      contactId: contact!.id,
      projectId: project.id,
      dealType: "project",
      value: MYR(625_000),
      assignedTo: owner.id,
    },
    owner as User,
  );

  if (!deal) {
    console.error("openDeal returned null — the project pipeline has no stages.");
    process.exit(1);
  }

  // ---- appointments -------------------------------------------------------
  /*
   * One in each half of the funnel. The past one carries `outcome: booked`, so the
   * dashboard shows a real conversion rather than a column of zeroes; the future one
   * gives the Appointments board and the reminder something to hold.
   *
   * Times are stored UTC. 3pm Malaysia is 07:00Z — the same conversion the scheduling
   * form does with `localInputToIso`.
   */
  await db.insert(appointments).values([
    {
      leadId: untouched!.id,
      projectId: project.id,
      assignedTo: owner.id,
      scheduledAt: daysFromNow(3),
      status: "scheduled",
      notes: "Gallery visit. Interested in Type A, wants to see the show unit.",
    },
    {
      contactId: contact!.id,
      projectId: project.id,
      assignedTo: owner.id,
      scheduledAt: daysFromNow(-5),
      status: "showed-up",
      outcome: "booked",
      notes: "Booked Type B, corner unit. Deposit paid on the day.",
    },
  ]);

  console.log("\nDone.");
  console.log(`  Project   ${project.name}${reusingProject ? " (reused)" : ""}`);
  console.log(`  Leads     ${seeded.map((l) => l.name).join(", ")}`);
  console.log(`  Deal      opened at "${stage.name}" with its paperwork checklist`);
  console.log("\nSign in and check Working leads, Appointments, Pipeline and Inbox.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

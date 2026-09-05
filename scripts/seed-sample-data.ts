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

async function main() {
  console.log(`Database: ${maskUrl(process.env.DATABASE_URL ?? "")}`);

  /*
   * Seeded against a REAL user, not a fabricated one.
   *
   * The whole point is that you sign in and see this data on your own dashboard —
   * every list in the app is scoped by ownership, so data assigned to an invented
   * agent would be invisible to you and the demo would show five empty screens.
   */
  const [owner] = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.deletedAt)))
    .orderBy(users.createdAt)
    .limit(1);

  if (!owner) {
    console.error("No admin user found. Sign in once first, then re-run.");
    process.exit(1);
  }
  console.log(`Owner: ${owner.name} <${owner.email}>`);

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

  console.log("\nWill create:");
  console.log("   1  project — Seri Bayu Residences, Cheras (3 unit types)");
  console.log("   3  leads — one new, one being worked, one that booked");
  console.log("   2  appointments — one upcoming, one that showed up and booked");
  console.log("   1  contact + 1 deal, opened at the first stage with its checklist");
  console.log("   a  few activities and remarks, so the timelines are not blank");

  if (!APPLY) {
    console.log("\nNothing was created. Re-run with APPLY=1 to insert.");
    return;
  }

  // ---- project ------------------------------------------------------------
  const [project] = await db
    .insert(projects)
    .values({
      name: "Seri Bayu Residences",
      developer: "Bayu Land Sdn Bhd",
      state: "Selangor",
      area: "Cheras",
      status: "open",
      notes: "Freehold serviced apartments beside the MRT. Sample project for demo runs.",
    })
    .returning({ id: projects.id, name: projects.name });

  await db.insert(projectUnitTypes).values([
    {
      projectId: project!.id,
      label: "Type A — 2 bedroom",
      builtUpSqft: 743,
      bedrooms: 2,
      bathrooms: 2,
      carParks: 1,
      listPrice: MYR(468_000),
      totalUnits: 120,
      sortOrder: 1,
    },
    {
      projectId: project!.id,
      label: "Type B — 3 bedroom",
      builtUpSqft: 1_012,
      bedrooms: 3,
      bathrooms: 2,
      carParks: 2,
      listPrice: MYR(625_000),
      totalUnits: 84,
      sortOrder: 2,
    },
    {
      projectId: project!.id,
      label: "Type C — 3 bedroom dual key",
      builtUpSqft: 1_268,
      bedrooms: 3,
      bathrooms: 3,
      carParks: 2,
      listPrice: MYR(792_000),
      totalUnits: 36,
      sortOrder: 3,
    },
  ]);

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
        name: "Amirah Zulkifli",
        phone: "+601130000071",
        email: "amirah.z@example.com",
        source: "manual",
        sourceDetail: "Walk-in at the gallery",
        interest: "buy",
        budgetMin: MYR(400_000),
        budgetMax: MYR(550_000),
        preferredAreas: "Cheras, Kajang",
        projectId: project!.id,
        status: "new",
        assignedTo: owner.id,
      },
      {
        name: "Jonathan Teoh",
        phone: "+601130000072",
        email: "jonathan.teoh@example.com",
        source: "api",
        sourceDetail: "Facebook lead form",
        utmSource: "facebook",
        utmCampaign: "seri-bayu-launch",
        interest: "invest",
        budgetMin: MYR(600_000),
        budgetMax: MYR(800_000),
        preferredAreas: "Cheras",
        projectId: project!.id,
        status: "follow-up",
        assignedTo: owner.id,
      },
      {
        name: "Kavitha Nair",
        phone: "+601130000073",
        email: "kavitha.nair@example.com",
        source: "manual",
        sourceDetail: "Referral from an existing buyer",
        interest: "buy",
        budgetMin: MYR(600_000),
        budgetMax: MYR(700_000),
        preferredAreas: "Cheras, Sri Petaling",
        projectId: project!.id,
        status: "closed", // converted below — the same status conversion sets
        assignedTo: owner.id,
      },
    ])
    .returning({ id: leads.id, name: leads.name });

  const [amirah, jonathan, kavitha] = seeded;

  await db.insert(leadRemarks).values([
    {
      leadId: jonathan!.id,
      body: "Called — asked for the Type B floor plan and the maintenance fee. Sending both.",
      userId: owner.id,
    },
    {
      leadId: jonathan!.id,
      body: "Wants to view on a weekend. Following up Friday.",
      userId: owner.id,
    },
  ]);

  await db.insert(activities).values([
    {
      entityType: "leads",
      entityId: jonathan!.id,
      type: "call",
      body: "Spoke for 6 minutes. Investor, second property, no urgency.",
      occurredAt: daysFromNow(-3),
      createdBy: owner.id,
    },
    {
      entityType: "leads",
      entityId: jonathan!.id,
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
      name: "Kavitha Nair",
      phone: "+601130000073",
      email: "kavitha.nair@example.com",
      assignedTo: owner.id,
      sourceLeadId: kavitha!.id,
    })
    .returning({ id: contacts.id });

  await db
    .update(leads)
    .set({ convertedToContactId: contact!.id })
    .where(eq(leads.id, kavitha!.id));

  const deal = await openDeal(
    {
      contactId: contact!.id,
      projectId: project!.id,
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
      leadId: amirah!.id,
      projectId: project!.id,
      assignedTo: owner.id,
      scheduledAt: daysFromNow(3),
      status: "scheduled",
      notes: "Gallery visit. Interested in Type A, wants to see the show unit.",
    },
    {
      contactId: contact!.id,
      projectId: project!.id,
      assignedTo: owner.id,
      scheduledAt: daysFromNow(-5),
      status: "showed-up",
      outcome: "booked",
      notes: "Booked Type B, corner unit. Deposit paid on the day.",
    },
  ]);

  console.log("\nDone.");
  console.log(`  Project   ${project!.name}`);
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

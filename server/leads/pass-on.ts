/**
 * Automatic pass-on for PROJECT leads.
 *
 * The rule, and its boundary, matter more than the mechanism:
 *
 *   A lead attached to a project whose pool has a pass-on window, whose owner has
 *   logged nothing within that window, moves to the next person in the pool.
 *
 * Nothing else moves. Resale and unprojected leads are surfaced by
 * `server/leads/stale.ts` and left alone, because there the client relationship is the
 * agent's own asset and an automatic transfer is, in commission terms, taking a lead
 * off one person and giving it to another. On a launch that argument does not apply:
 * the pool are interchangeable setters working the developer's campaign, passing leads
 * on is the working model, and a paid lead going cold in one inbox is pure waste.
 *
 * Everything it does is recorded — an append-only `lead_assignments` row, a note on the
 * lead's timeline, and a message to both agents — so a transfer is never something an
 * agent discovers by accident.
 *
 * Run manually:  pnpm passon:leads
 * Scheduled by:  .github/workflows/lead-pass-on.yml
 * Set PASS_ON_DRY_RUN=1 to report what would move without moving anything.
 */
import { and, eq, isNull, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, projects, users, activities, appointments, leadAssignments } from "@/lib/db/schema";
import { listPool, nextAfter } from "./pool";
import { messaging } from "@/lib/messaging";
import { monitoring } from "@/lib/monitoring";

export interface PassOnCandidate {
  leadId: string;
  leadName: string;
  leadPhone: string;
  projectId: string;
  projectName: string;
  fromUserId: string | null;
  idleDays: number;
  passOnAfterDays: number;
}

export interface PassOnResult {
  considered: number;
  moved: number;
  skippedNoOneToPassTo: number;
  candidates: Array<PassOnCandidate & { toUserId: string | null }>;
}

/**
 * Leads eligible to move.
 *
 * The exclusions are the whole design. A lead is NOT passed on when it:
 *
 *  - has no project, or its project has no pass-on window set (opt-in, per project)
 *  - was sourced by the agent themselves — entered by hand or imported from their own
 *    export. Pass-on redistributes leads the AGENCY paid for; an agent's own walk-in,
 *    referral or personal ad campaign is their asset and taking it off them is theft,
 *    not management. Only `api` and `webhook` leads are agency-sourced.
 *  - is converted, disqualified or already qualified — all finished or in-hand work
 *  - has an appointment of any kind, which means somebody is actively working it
 *  - has any activity logged since the current owner received it
 *
 * That last one is the point: the clock measures the OWNER's silence, not the lead's
 * age, so an agent who called yesterday never loses a lead they are working.
 */
async function findCandidates(): Promise<PassOnCandidate[]> {
  const rows = await db
    .select({
      leadId: leads.id,
      leadName: leads.name,
      leadPhone: leads.phone,
      projectId: projects.id,
      projectName: projects.name,
      fromUserId: leads.assignedTo,
      passOnAfterDays: projects.passOnAfterDays,
      idleDays: sql<number>`floor(extract(epoch from (
        now() - coalesce(${leads.assignedAt}, ${leads.createdAt})
      )) / 86400)::int`,
    })
    .from(leads)
    .innerJoin(projects, eq(projects.id, leads.projectId))
    .where(
      and(
        isNull(leads.deletedAt),
        // Agency-sourced only. `manual` is an agent typing in their own enquiry and
        // `import` is an agent uploading their own export; neither belongs to the pool.
        notInArray(leads.source, ["manual", "import"]),
        isNull(leads.convertedToContactId),
        ne(leads.status, "disqualified"),
        ne(leads.status, "qualified"),
        isNull(projects.deletedAt),
        sql`${projects.passOnAfterDays} is not null and ${projects.passOnAfterDays} > 0`,
        // Silence measured from when THIS owner got it.
        sql`coalesce(${leads.assignedAt}, ${leads.createdAt})
            < now() - make_interval(days => ${projects.passOnAfterDays})`,
        // Nothing logged since they got it.
        sql`not exists (
          select 1 from ${activities} a
          where a.entity_type = 'leads' and a.entity_id = ${leads.id}
            and a.deleted_at is null
            and a.occurred_at >= coalesce(${leads.assignedAt}, ${leads.createdAt})
        )`,
        // Somebody with an appointment booked is working it, whatever else is quiet.
        sql`not exists (
          select 1 from ${appointments} ap
          where ap.lead_id = ${leads.id} and ap.deleted_at is null
        )`,
      ),
    );

  return rows.map((r) => ({
    ...r,
    passOnAfterDays: Number(r.passOnAfterDays),
    idleDays: Number(r.idleDays),
  }));
}

/**
 * @param dryRun report what would move without moving it.
 * @param actorId the person who triggered it, when a person did. Null for the schedule.
 */
export async function runPassOn(
  { dryRun = false, actorId = null }: { dryRun?: boolean; actorId?: string | null } = {},
): Promise<PassOnResult> {
  const candidates = await findCandidates();
  const result: PassOnResult = {
    considered: candidates.length,
    moved: 0,
    skippedNoOneToPassTo: 0,
    candidates: [],
  };

  // Pools are read once per project, not once per lead — a launch in full flow can
  // easily produce dozens of candidates from the same pool.
  const poolCache = new Map<string, Awaited<ReturnType<typeof listPool>>>();

  for (const c of candidates) {
    let pool = poolCache.get(c.projectId);
    if (!pool) {
      pool = await listPool(c.projectId);
      poolCache.set(c.projectId, pool);
    }

    const toUserId = nextAfter(pool, c.fromUserId);
    if (!toUserId || toUserId === c.fromUserId) {
      // A pool of one has nobody to pass to. Not a failure — the stale list still
      // surfaces it, which is the right outcome for a one-person launch.
      result.skippedNoOneToPassTo++;
      result.candidates.push({ ...c, toUserId: null });
      continue;
    }

    result.candidates.push({ ...c, toUserId });
    if (dryRun) continue;

    const [from, to] = await Promise.all([
      c.fromUserId
        ? db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, c.fromUserId))
        : Promise.resolve([]),
      db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, toUserId)),
    ]);
    const fromName = from[0]?.name ?? "Unassigned";
    const toName = to[0]?.name ?? "another agent";

    // The move, its history row and its timeline note go together: a transfer that
    // happened without a record is exactly the thing that starts a commission dispute.
    await db.transaction(async (tx) => {
      await tx
        .update(leads)
        .set({ assignedTo: toUserId, assignedAt: new Date() })
        .where(eq(leads.id, c.leadId));

      await tx.insert(leadAssignments).values({
        leadId: c.leadId,
        fromUserId: c.fromUserId,
        toUserId,
        reason: "sla-pass-on",
        note: `No activity for ${c.idleDays} days (${c.projectName} passes on after ${c.passOnAfterDays}).`,
        createdBy: actorId,
      });

      await tx.insert(activities).values({
        entityType: "leads",
        entityId: c.leadId,
        type: "note",
        body:
          `Passed on automatically from ${fromName} to ${toName} — nothing logged for ` +
          `${c.idleDays} days. ${c.projectName} passes leads on after ${c.passOnAfterDays} days.`,
        createdBy: actorId,
      });
    });

    result.moved++;

    // Both ends are told. Telling only the receiver is how the person who lost the
    // lead finds out from a colleague instead of from the system.
    await notify(to[0]?.phone, `Lead passed to you: ${c.leadName} (${c.leadPhone}) — ${c.projectName}.`);
    await notify(
      from[0]?.phone,
      `${c.leadName} (${c.leadPhone}) has been passed to ${toName} — nothing was logged for ${c.idleDays} days.`,
    );
  }

  return result;
}

/** Notification failures never fail the transfer; the lead has already moved. */
async function notify(phone: string | null | undefined, message: string) {
  if (!phone) return;
  try {
    await messaging.sendFollowUp(phone, { message });
  } catch (err) {
    monitoring.captureException(err, { where: "passOn.notify" });
  }
}

/**
 * Shared lead intake pipeline — ALL sources (public API, webhook, manual, import)
 * funnel through createLeadFromIntake so behaviour is identical everywhere.
 *
 * Responsibilities:
 *  - Validate payload (Zod)
 *  - Deduplicate by phone/email (merge into existing lead + log an activity)
 *  - Capture UTM / referrer
 *  - Auto-assign via round-robin (counter persisted in DB — NEVER in memory)
 *  - Trigger notifications (WhatsApp link to agent; optional confirmation to customer)
 *  - Log to activity + message_log
 */
import { z } from "zod";
import { and, eq, isNull, or, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, users, activities, assignmentCounter } from "@/lib/db/schema";
import { messaging } from "@/lib/messaging";
import { monitoring } from "@/lib/monitoring";
import { LEAD_SOURCE, INTEREST } from "@/lib/constants";
import type { ActionResult } from "@/types";
import { ok, fail } from "@/lib/action-result";

const ROUND_ROBIN_KEY = "lead_round_robin";

export const intakeSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "phone must be E.164, e.g. +60123456789"),
  email: z.string().email().max(320).optional().nullable(),
  interest: z.enum(INTEREST).optional().nullable(),
  budgetMin: z.number().int().nonnegative().optional().nullable(),
  budgetMax: z.number().int().nonnegative().optional().nullable(),
  preferredAreas: z.string().max(1000).optional().nullable(),
  sourceDetail: z.string().max(255).optional().nullable(),
  utmSource: z.string().max(255).optional().nullable(),
  utmMedium: z.string().max(255).optional().nullable(),
  utmCampaign: z.string().max(255).optional().nullable(),
  referrer: z.string().optional().nullable(),
  // PDPA: public intake MUST record consent.
  consentGiven: z.boolean().optional(),
  consentSource: z.string().max(255).optional().nullable(),
  // anti-spam honeypot — must be empty
  hp: z.string().optional(),
});

export type IntakePayload = z.infer<typeof intakeSchema>;
export type LeadSource = (typeof LEAD_SOURCE)[number];

/** Round-robin assignment using a DB-persisted counter (serverless-safe). */
async function pickAssignee(): Promise<string | null> {
  const agents = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.active, true), eq(users.role, "agent"), isNull(users.deletedAt)))
    .orderBy(asc(users.createdAt));

  if (agents.length === 0) return null;

  // Read-modify-write the counter row atomically enough for low volume.
  const [counter] = await db
    .select()
    .from(assignmentCounter)
    .where(eq(assignmentCounter.id, ROUND_ROBIN_KEY));

  const nextIndex = ((counter?.lastIndex ?? -1) + 1) % agents.length;

  if (counter) {
    await db
      .update(assignmentCounter)
      .set({ lastIndex: nextIndex })
      .where(eq(assignmentCounter.id, ROUND_ROBIN_KEY));
  } else {
    await db.insert(assignmentCounter).values({ id: ROUND_ROBIN_KEY, lastIndex: nextIndex });
  }

  return agents[nextIndex]?.id ?? null;
}

export async function createLeadFromIntake(
  rawPayload: unknown,
  source: LeadSource,
): Promise<ActionResult<{ leadId: string; deduped: boolean }>> {
  const parsed = intakeSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const p = parsed.data;

  // Honeypot: silently accept-and-drop spam (return a fake success shape).
  if (p.hp && p.hp.trim() !== "") {
    return ok({ leadId: "spam-ignored", deduped: false });
  }

  try {
    // Dedup by phone or email among non-deleted leads.
    const existingMatches = await db
      .select()
      .from(leads)
      .where(
        and(
          isNull(leads.deletedAt),
          p.email
            ? or(eq(leads.phone, p.phone), eq(leads.email, p.email))
            : eq(leads.phone, p.phone),
        ),
      );
    const existing = existingMatches[0];

    if (existing) {
      // Merge: log a new activity on the existing lead rather than duplicating.
      await db.insert(activities).values({
        entityType: "leads",
        entityId: existing.id,
        type: "note",
        body: `Duplicate inquiry received via ${source}${p.sourceDetail ? ` (${p.sourceDetail})` : ""}.`,
      });
      return ok({ leadId: existing.id, deduped: true });
    }

    const assignedTo = await pickAssignee();

    const [inserted] = await db
      .insert(leads)
      .values({
        name: p.name,
        phone: p.phone,
        email: p.email ?? null,
        source,
        sourceDetail: p.sourceDetail ?? null,
        utmSource: p.utmSource ?? null,
        utmMedium: p.utmMedium ?? null,
        utmCampaign: p.utmCampaign ?? null,
        referrer: p.referrer ?? null,
        interest: p.interest ?? null,
        budgetMin: p.budgetMin ?? null,
        budgetMax: p.budgetMax ?? null,
        preferredAreas: p.preferredAreas ?? null,
        status: "new",
        assignedTo,
        consentGivenAt: p.consentGiven ? new Date() : null,
        consentSource: p.consentSource ?? null,
      })
      .returning({ id: leads.id });

    const leadId = inserted!.id;

    // Log intake activity.
    await db.insert(activities).values({
      entityType: "leads",
      entityId: leadId,
      type: "note",
      body: `Lead created via ${source}${p.sourceDetail ? ` (${p.sourceDetail})` : ""}.`,
    });

    // Notify assigned agent (WhatsApp click-to-chat link in Phase A).
    if (assignedTo) {
      const [agent] = await db
        .select({ phone: users.phone })
        .from(users)
        .where(eq(users.id, assignedTo));
      if (agent?.phone) {
        try {
          await messaging.sendFollowUp(agent.phone, {
            message: `New lead assigned: ${p.name} (${p.phone}).`,
          });
        } catch (notifyErr) {
          monitoring.captureException(notifyErr, { where: "intake.notify" });
        }
      }
    }

    return ok({ leadId, deduped: false });
  } catch (err) {
    monitoring.captureException(err, { where: "createLeadFromIntake", source });
    return fail("Failed to create lead.");
  }
}

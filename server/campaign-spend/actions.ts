"use server";
/**
 * Recording monthly advertising spend.
 *
 * Managers and admins only, enforced here and not merely in the page — this is the
 * agency's cost base, and the report built on it drives budget decisions.
 */
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { campaignSpend, users } from "@/lib/db/schema";
import { requireDbUser, isManagerOrAbove, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import { ringgitToCents } from "@/server/leads/csv";
import type { ActionResult } from "@/types";

export interface SpendRow {
  id: string;
  campaign: string;
  source: string;
  /** "2026-08" */
  month: string;
  amount: number;
  notes: string | null;
  /** Who typed it in — a name, for the audit trail on screen. */
  recordedByName: string | null;
}

const schema = z.object({
  campaign: z.string().min(1, "Campaign name is required.").max(255),
  source: z.string().min(1).max(255),
  // "2026-08". A month, not a day — the form offers a month picker.
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month."),
  // Typed as ringgit by a person, stored as integer cents like every other money
  // column. Accepts "3500", "RM 3,500.50" and "3.5k" — see ringgitToCents.
  amount: z.string().min(1, "Enter what this campaign cost."),
  notes: z.string().max(1000).optional().nullable(),
});

/**
 * Create or replace the figure for one campaign, channel and month.
 *
 * Deliberately an upsert rather than an insert: the natural way to use this is to
 * type last month's number, then correct it when the invoice arrives. Two rows for
 * the same campaign-month would halve every cost-per-lead figure derived from it, so
 * the unique index does the enforcing and this reconciles against it.
 */
export async function recordSpend(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await requireDbUser();
    if (!isManagerOrAbove(me)) throw new AuthorizationError();

    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join("; "));
    const p = parsed.data;

    const amount = ringgitToCents(p.amount);
    if (amount == null) return fail("That amount is not a number I can read.");

    const monthDate = `${p.month}-01`;
    const campaign = p.campaign.trim();
    const source = p.source.trim().toLowerCase();

    const [row] = await db
      .insert(campaignSpend)
      .values({
        campaign,
        utmSource: source,
        month: monthDate,
        amount,
        notes: p.notes?.trim() || null,
        recordedBy: me.id,
      })
      .onConflictDoUpdate({
        target: [campaignSpend.campaign, campaignSpend.utmSource, campaignSpend.month],
        targetWhere: sql`deleted_at is null`,
        set: {
          amount,
          notes: p.notes?.trim() || null,
          recordedBy: me.id,
          updatedAt: new Date(),
        },
      })
      .returning({ id: campaignSpend.id });

    revalidatePath("/reports/spend");
    return ok({ id: row!.id });
  } catch (err) {
    if (err instanceof AuthorizationError) return fail("Managers and admins only.");
    if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
    monitoring.captureException(err, { where: "recordSpend" });
    return fail("Could not save that figure.");
  }
}

/** Soft-delete one figure. Used when a campaign was entered against the wrong month. */
export async function deleteSpend(id: unknown): Promise<ActionResult<null>> {
  try {
    const me = await requireDbUser();
    if (!isManagerOrAbove(me)) throw new AuthorizationError();
    if (typeof id !== "string") return fail("Missing record.");

    await db
      .update(campaignSpend)
      .set({ deletedAt: new Date() })
      .where(and(eq(campaignSpend.id, id), isNull(campaignSpend.deletedAt)));

    revalidatePath("/reports/spend");
    return ok(null);
  } catch (err) {
    if (err instanceof AuthorizationError) return fail("Managers and admins only.");
    monitoring.captureException(err, { where: "deleteSpend" });
    return fail("Could not remove that figure.");
  }
}

/** Everything entered, newest month first, for the management table. */
export async function listSpend(): Promise<SpendRow[]> {
  const me = await requireDbUser();
  if (!isManagerOrAbove(me)) throw new AuthorizationError();

  return db
    .select({
      id: campaignSpend.id,
      campaign: campaignSpend.campaign,
      source: campaignSpend.utmSource,
      month: sql<string>`to_char(${campaignSpend.month}, 'YYYY-MM')`,
      amount: campaignSpend.amount,
      notes: campaignSpend.notes,
      recordedByName: users.name,
    })
    .from(campaignSpend)
    .leftJoin(users, eq(users.id, campaignSpend.recordedBy))
    .where(isNull(campaignSpend.deletedAt))
    .orderBy(desc(campaignSpend.month), campaignSpend.campaign);
}

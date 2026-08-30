/** Commission read helpers. */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  commissionSchemes, commissionSchemeStages, dealCommissions, dealCommissionStages,
  dealCommissionSplits, deals, contacts, projects, users,
  type CommissionScheme, type CommissionSchemeStage, type DealCommission,
  type DealCommissionStage, type DealCommissionSplit,
} from "@/lib/db/schema";

export interface SchemeWithStages {
  scheme: CommissionScheme;
  stages: CommissionSchemeStage[];
}

export async function listSchemes(): Promise<SchemeWithStages[]> {
  const schemes = await db
    .select()
    .from(commissionSchemes)
    .where(isNull(commissionSchemes.deletedAt))
    .orderBy(desc(commissionSchemes.isDefault), asc(commissionSchemes.name));

  const stages = await db
    .select()
    .from(commissionSchemeStages)
    .where(isNull(commissionSchemeStages.deletedAt))
    .orderBy(asc(commissionSchemeStages.sortOrder));

  return schemes.map((scheme) => ({
    scheme,
    stages: stages.filter((s) => s.schemeId === scheme.id),
  }));
}

export async function getSchemeWithStages(id: string): Promise<SchemeWithStages | null> {
  const [scheme] = await db
    .select()
    .from(commissionSchemes)
    .where(and(eq(commissionSchemes.id, id), isNull(commissionSchemes.deletedAt)));
  if (!scheme) return null;
  const stages = await db
    .select()
    .from(commissionSchemeStages)
    .where(and(eq(commissionSchemeStages.schemeId, id), isNull(commissionSchemeStages.deletedAt)))
    .orderBy(asc(commissionSchemeStages.sortOrder));
  return { scheme, stages };
}

export async function getDefaultScheme(): Promise<SchemeWithStages | null> {
  const [scheme] = await db
    .select()
    .from(commissionSchemes)
    .where(and(eq(commissionSchemes.isDefault, true), isNull(commissionSchemes.deletedAt)));
  return scheme ? getSchemeWithStages(scheme.id) : null;
}

export interface DealCommissionFull {
  commission: DealCommission;
  stages: DealCommissionStage[];
  splits: DealCommissionSplit[];
}

export async function getDealCommission(dealId: string): Promise<DealCommissionFull | null> {
  const [commission] = await db
    .select()
    .from(dealCommissions)
    .where(and(eq(dealCommissions.dealId, dealId), isNull(dealCommissions.deletedAt)));
  if (!commission) return null;

  const [stages, splits] = await Promise.all([
    db.select().from(dealCommissionStages)
      .where(and(
        eq(dealCommissionStages.dealCommissionId, commission.id),
        isNull(dealCommissionStages.deletedAt),
      ))
      .orderBy(asc(dealCommissionStages.sortOrder)),
    db.select().from(dealCommissionSplits)
      .where(and(
        eq(dealCommissionSplits.dealCommissionId, commission.id),
        isNull(dealCommissionSplits.deletedAt),
      )),
  ]);

  return { commission, stages, splits };
}

export interface OutstandingRow {
  stageId: string;
  label: string;
  amount: number;
  expectedAt: Date | null;
  invoicedAt: Date | null;
  dealId: string;
  contactName: string;
  projectName: string | null;
}

/**
 * Money billed or expected and not yet received — the principal's Monday morning
 * question. Ordered by expected date so the oldest outstanding sits at the top, which
 * is where "stuck" shows itself.
 */
export async function listOutstanding(): Promise<OutstandingRow[]> {
  const rows = await db
    .select({
      stageId: dealCommissionStages.id,
      label: dealCommissionStages.label,
      amount: dealCommissionStages.amount,
      expectedAt: dealCommissionStages.expectedAt,
      invoicedAt: dealCommissionStages.invoicedAt,
      dealId: dealCommissions.dealId,
      contactName: contacts.name,
      projectName: projects.name,
    })
    .from(dealCommissionStages)
    .innerJoin(dealCommissions, eq(dealCommissions.id, dealCommissionStages.dealCommissionId))
    .innerJoin(deals, eq(deals.id, dealCommissions.dealId))
    .innerJoin(contacts, eq(contacts.id, deals.contactId))
    .leftJoin(projects, eq(projects.id, deals.projectId))
    .where(and(
      isNull(dealCommissionStages.receivedAt),
      isNull(dealCommissionStages.deletedAt),
      isNull(dealCommissions.deletedAt),
      isNull(deals.deletedAt),
    ))
    .orderBy(asc(dealCommissionStages.expectedAt));

  return rows;
}

export interface EarningsRow {
  userId: string | null;
  name: string;
  /** Everything allocated to them, whether or not the money has arrived. */
  earned: number;
  /** The part that has actually been received. */
  received: number;
}

/**
 * What each person has earned, and how much of it is actually in.
 *
 * A split's share of a stage is proportional to that stage's share of the gross, so
 * "received" is computed stage by stage rather than by assuming the money arrives in
 * the same proportions the split was written in.
 */
export async function earningsByPerson(): Promise<EarningsRow[]> {
  const rows = (await db.execute(sql`
    with received as (
      select dc.id as commission_id,
             sum(s.amount) filter (where s.received_at is not null) as received_amount,
             sum(s.amount) as total_amount
      from ${dealCommissions} dc
      join ${dealCommissionStages} s on s.deal_commission_id = dc.id and s.deleted_at is null
      where dc.deleted_at is null
      group by dc.id
    )
    select sp.user_id                              as user_id,
           coalesce(u.name, sp.label)              as name,
           sum(sp.amount)::bigint                  as earned,
           coalesce(sum(
             case when r.total_amount > 0
                  then round(sp.amount::numeric * r.received_amount / r.total_amount)
                  else 0 end
           ), 0)::bigint                           as received
    from ${dealCommissionSplits} sp
    join received r on r.commission_id = sp.deal_commission_id
    left join ${users} u on u.id = sp.user_id
    where sp.deleted_at is null
    group by sp.user_id, coalesce(u.name, sp.label)
    order by earned desc
  `)) as unknown as Array<{ user_id: string | null; name: string; earned: string | number; received: string | number }>;

  // bigint comes back as a string from postgres; coerce rather than render "12345".
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    earned: Number(r.earned),
    received: Number(r.received),
  }));
}

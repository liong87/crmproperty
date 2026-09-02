/**
 * Cost per lead, appointment, booking and closed deal, by campaign.
 *
 * The question this exists to answer is "should we keep paying for this?" — which
 * needs three numbers side by side: what a campaign cost, how many enquiries it
 * produced, and how many of those became money. Lead count alone rewards whichever
 * campaign buys the cheapest clicks, and cheap leads that never turn up at a viewing
 * are the most expensive kind.
 *
 * Team leads and admins only. Agents never see agency ad spend — it is commercially
 * sensitive, and an agent's own cost per lead is not a number they can act on.
 *
 * Attribution is last-touch on the ORIGINATING lead, which is the only chain we can
 * evidence: lead → contact (contacts.source_lead_id) → deal → a stage flagged is_won.
 * A deal created against a walk-in contact with no lead behind it counts towards no
 * campaign, which is correct — nobody paid for it.
 *
 * **Why cost per BOOKING is the number to watch, not cost per closed deal.** In project
 * sales a booking is followed by SPA signing, loan approval and completion — six to
 * eighteen months. Cost per closed deal is therefore a verdict on advertising the agency
 * paid for last year, and cannot inform this month's budget. The booking happens within
 * weeks of the lead and is the earliest point at which money is genuinely committed, so
 * it is the fastest honest signal a campaign is working. Cost per closed deal stays,
 * because it is the eventual truth and it is what resale runs on.
 *
 * A booking is counted from the APPOINTMENT outcome (`outcome = 'booked'`) rather than
 * from a deal reaching the Booked stage, so both this report and the funnel key off the
 * same underlying event.
 *
 * They count it at different GRAINS, deliberately, and the numbers can differ:
 * the funnel counts booked APPOINTMENTS, because it is describing what happened to
 * appointments; this report counts LEADS that produced at least one booking, because a
 * campaign that bought one lead who booked twice bought one booking's worth of business,
 * not two. Neither is wrong — but do not expect the two figures to match, and do not
 * "fix" one to agree with the other.
 */
import { and, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { campaignSpend, type User } from "@/lib/db/schema";
import { isTeamLeadOrAbove, AuthorizationError } from "@/lib/auth";

export interface CampaignCostRow {
  /** "2026-08" — the calendar month in Malaysia, not UTC. */
  month: string;
  campaign: string;
  source: string;
  leads: number;
  appointments: number;
  /** Appointments whose outcome was `booked` — the same event the funnel counts. */
  bookings: number;
  won: number;
  /** MYR cents. Null when nobody has entered a figure for this campaign-month. */
  spend: number | null;
  /** MYR cents per lead. Null without spend, or with spend but no leads. */
  costPerLead: number | null;
  /** MYR cents per appointment actually set. */
  costPerAppointment: number | null;
  /** MYR cents per booking. The fastest honest read on whether a campaign works. */
  costPerBooking: number | null;
  /** MYR cents per closed deal. Lags by months in project sales; see the file note. */
  costPerWon: number | null;
  /**
   * True when money was recorded but no lead carries this campaign name.
   *
   * Usually a renamed campaign or a typo rather than genuinely wasted budget, and
   * worth showing as a warning rather than as a cost per lead of infinity.
   */
  spendWithoutLeads: boolean;
}

export interface CampaignCostReport {
  months: number;
  rows: CampaignCostRow[];
  /** Totals across every row, so the summary and the table cannot disagree. */
  totals: {
    leads: number;
    appointments: number;
    bookings: number;
    won: number;
    spend: number;
    costPerLead: number | null;
    costPerAppointment: number | null;
    costPerBooking: number | null;
    costPerWon: number | null;
  };
}

interface LeadAggRow {
  month: string;
  campaign: string;
  source: string;
  leads: number;
  appointments: number;
  bookings: number;
  won: number;
}

const key = (month: string, campaign: string, source: string) =>
  `${month}|${source.toLowerCase()}|${campaign.toLowerCase()}`;

/**
 * Integer-cent division, guarding both the no-spend and no-denominator cases.
 *
 * Returning null rather than 0 or Infinity matters: a campaign with spend and no
 * leads must not report a cost per lead of zero, and one with leads and no recorded
 * spend must not report free leads. Both render as "—", which is the truth.
 *
 * Exported for testing — the arithmetic is trivial and the edge cases are not.
 */
export function costPer(spend: number | null, n: number): number | null {
  if (spend == null || n <= 0) return null;
  return Math.round(spend / n);
}

const per = costPer;

/**
 * @param months how many whole calendar months back to report, including this one.
 */
export async function getCampaignCosts(user: User, months = 3): Promise<CampaignCostReport> {
  if (!isTeamLeadOrAbove(user)) throw new AuthorizationError();

  // First day of the month, `months - 1` months ago, in Malaysian local time.
  // Parenthesised as a whole expression on purpose. Without the outer brackets a
  // `::date` cast downstream binds to make_interval() alone rather than to the
  // subtraction, and Postgres rejects it with "cannot cast type interval to date".
  const since = sql`(date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur'))
                     - make_interval(months => ${months - 1}::int))`;

  /*
   * One pass over leads, with appointments and won deals folded in as EXISTS tests.
   *
   * EXISTS rather than joins on purpose: a lead with three appointments must count
   * once, and joining would count it three times — silently inflating the appointment
   * column and deflating cost per appointment. The same lead reached through both its
   * own lead_id and its converted contact would double again.
   *
   * Month is bucketed in Asia/Kuala_Lumpur so "August" means the month the agency
   * paid for, not a UTC window that starts at 8am on the 1st.
   */
  const rows = (await db.execute(sql`
    with base as (
      select
        to_char(date_trunc('month', l.created_at at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM') as month,
        l.utm_campaign as campaign,
        coalesce(nullif(l.utm_source, ''), 'unknown') as source,
        l.id
      from leads l
      where l.deleted_at is null
        and l.utm_campaign is not null
        and l.utm_campaign <> ''
        and (l.created_at at time zone 'Asia/Kuala_Lumpur') >= ${since}
    )
    select
      b.month,
      b.campaign,
      b.source,
      count(*)::int as leads,
      count(*) filter (where exists (
        select 1 from appointments a
        where a.deleted_at is null
          and (a.lead_id = b.id
               or a.contact_id in (
                 select c.id from contacts c
                 where c.source_lead_id = b.id and c.deleted_at is null
               ))
      ))::int as appointments,
      count(*) filter (where exists (
        select 1 from appointments a
        where a.deleted_at is null
          and a.outcome = 'booked'
          and (a.lead_id = b.id
               or a.contact_id in (
                 select c.id from contacts c
                 where c.source_lead_id = b.id and c.deleted_at is null
               ))
      ))::int as bookings,
      count(*) filter (where exists (
        select 1
        from contacts c
        join deals d on d.contact_id = c.id and d.deleted_at is null
        join deal_stages s on s.id = d.stage_id and s.is_won = true
        where c.source_lead_id = b.id and c.deleted_at is null
      ))::int as won
    from base b
    group by b.month, b.campaign, b.source
  `)) as unknown as LeadAggRow[];

  // Spend is fetched separately and merged in code rather than joined, so that a
  // campaign with spend and no leads survives into the report. That row — money out,
  // nothing in — is the single most useful line the report can show, and an inner
  // join would drop it.
  const spendRows = await db
    .select({
      month: sql<string>`to_char(${campaignSpend.month}, 'YYYY-MM')`,
      campaign: campaignSpend.campaign,
      source: campaignSpend.utmSource,
      amount: campaignSpend.amount,
    })
    .from(campaignSpend)
    .where(and(isNull(campaignSpend.deletedAt), gte(campaignSpend.month, sql`${since}::date`)));

  const spendByKey = new Map<string, { amount: number; campaign: string; source: string; month: string }>();
  for (const s of spendRows) {
    const k = key(s.month, s.campaign, s.source);
    // Several rows can only collide here if the unique index was dropped; summing is
    // the least surprising answer if it ever happens.
    const prev = spendByKey.get(k);
    spendByKey.set(k, {
      amount: (prev?.amount ?? 0) + Number(s.amount),
      campaign: s.campaign,
      source: s.source,
      month: s.month,
    });
  }

  const out: CampaignCostRow[] = rows.map((r) => {
    const k = key(r.month, r.campaign, r.source);
    const spend = spendByKey.get(k)?.amount ?? null;
    spendByKey.delete(k);
    return {
      month: r.month,
      campaign: r.campaign,
      source: r.source,
      leads: Number(r.leads),
      appointments: Number(r.appointments),
      bookings: Number(r.bookings),
      won: Number(r.won),
      spend,
      costPerLead: per(spend, Number(r.leads)),
      costPerAppointment: per(spend, Number(r.appointments)),
      costPerBooking: per(spend, Number(r.bookings)),
      costPerWon: per(spend, Number(r.won)),
      spendWithoutLeads: false,
    };
  });

  // Whatever is left in the map is spend nobody's leads matched.
  for (const s of spendByKey.values()) {
    out.push({
      month: s.month,
      campaign: s.campaign,
      source: s.source,
      leads: 0,
      appointments: 0,
      bookings: 0,
      won: 0,
      spend: s.amount,
      costPerLead: null,
      costPerAppointment: null,
      costPerBooking: null,
      costPerWon: null,
      spendWithoutLeads: true,
    });
  }

  // Newest month first, then dearest campaign — the expensive rows are the ones
  // anybody opening this report came to look at.
  out.sort((a, b) => b.month.localeCompare(a.month) || (b.spend ?? 0) - (a.spend ?? 0));

  const totals = out.reduce(
    (acc, r) => {
      acc.leads += r.leads;
      acc.appointments += r.appointments;
      acc.bookings += r.bookings;
      acc.won += r.won;
      acc.spend += r.spend ?? 0;
      return acc;
    },
    { leads: 0, appointments: 0, bookings: 0, won: 0, spend: 0 },
  );

  return {
    months,
    rows: out,
    totals: {
      ...totals,
      costPerLead: per(totals.spend || null, totals.leads),
      costPerAppointment: per(totals.spend || null, totals.appointments),
      costPerBooking: per(totals.spend || null, totals.bookings),
      costPerWon: per(totals.spend || null, totals.won),
    },
  };
}

/**
 * Campaign names seen on leads in the reporting window, for the spend entry form.
 *
 * Typing a campaign name by hand is how the join gets broken — one stray character
 * and the spend attaches to nothing. Offering the names already on leads makes the
 * common case a selection rather than a spelling test.
 */
export async function listKnownCampaigns(
  user: User,
  months = 6,
): Promise<Array<{ campaign: string; source: string }>> {
  if (!isTeamLeadOrAbove(user)) throw new AuthorizationError();
  const rows = (await db.execute(sql`
    select distinct
      l.utm_campaign as campaign,
      coalesce(nullif(l.utm_source, ''), 'unknown') as source
    from leads l
    where l.deleted_at is null
      and l.utm_campaign is not null
      and l.utm_campaign <> ''
      and (l.created_at at time zone 'Asia/Kuala_Lumpur')
          >= date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur'))
             - make_interval(months => ${months - 1}::int)
    order by 1
  `)) as unknown as Array<{ campaign: string; source: string }>;
  return rows;
}

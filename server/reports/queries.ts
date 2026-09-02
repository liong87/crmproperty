/** Role-scoped reporting aggregates. Agents see their own book; team leads/admins see all. */
import { and, count, eq, gte, isNull, sum } from "drizzle-orm";
import { statusGroup } from "@/lib/constants";
import { db } from "@/lib/db/client";
import { leads, contacts, deals, dealStages, properties, activities, users, type User } from "@/lib/db/schema";
import { isTeamLeadOrAbove } from "@/lib/auth";

export interface Count { label: string; value: number }
export interface StageStat { label: string; count: number; value: number; isTerminal: boolean }
export interface AgentRow { name: string; leads: number; contacts: number; wonValue: number }

export interface ReportData {
  scope: "own" | "team";
  leadsByStatus: Count[];
  /** Every lead ever received, whatever its status. The conversion denominator. */
  totalLeads: number;
  /**
   * Leads still worth working: `new` and `contacted`.
   *
   * Distinct from totalLeads, which includes qualified and disqualified ones. The
   * dashboard tile is labelled "Open leads" and used to show totalLeads, so a lead
   * that had just been disqualified still appeared as open — the one number an agent
   * checks to decide whether they have anything to chase.
   */
  openLeads: number;
  qualifiedLeads: number;
  conversionRate: number; // 0..1
  dealsByStage: StageStat[];
  openPipelineValue: number;
  propertiesByStatus: Count[];
  activitiesLast7Days: number;
  leaderboard: AgentRow[]; // empty for agents
}

export async function getReportData(user: User): Promise<ReportData> {
  const mgr = isTeamLeadOrAbove(user);
  const leadOwn = mgr ? undefined : eq(leads.assignedTo, user.id);
  const dealOwn = mgr ? undefined : eq(deals.assignedTo, user.id);
  const propOwn = mgr ? undefined : eq(properties.assignedAgent, user.id);
  const actOwn = mgr ? undefined : eq(activities.createdBy, user.id);

  // Leads by status
  const leadStatusRows = await db
    .select({ status: leads.status, c: count() })
    .from(leads)
    .where(and(isNull(leads.deletedAt), leadOwn))
    .groupBy(leads.status);
  const leadsByStatus = leadStatusRows.map((r) => ({ label: r.status, value: r.c }));
  const totalLeads = leadsByStatus.reduce((s, r) => s + r.value, 0);
  // Summed by GROUP, so a new status lands in the right bucket without a code change.
  const sumGroup = (...groups: string[]) =>
    leadsByStatus.reduce((n, r) => (groups.includes(statusGroup(r.label)) ? n + r.value : n), 0);
  const openLeads = sumGroup("new", "working");
  const qualifiedLeads = sumGroup("appointment", "closed");
  // Conversion is measured against EVERY lead received, including disqualified ones —
  // rejecting a poor lead is part of the funnel, not something to exclude from it.
  const conversionRate = totalLeads > 0 ? qualifiedLeads / totalLeads : 0;

  // Deals by stage (count + value)
  const stageRows = await db
    .select({
      label: dealStages.name,
      isTerminal: dealStages.isTerminal,
      sortOrder: dealStages.sortOrder,
      c: count(deals.id),
      v: sum(deals.value),
    })
    .from(dealStages)
    .leftJoin(deals, and(eq(deals.stageId, dealStages.id), isNull(deals.deletedAt), dealOwn))
    .where(isNull(dealStages.deletedAt))
    .groupBy(dealStages.id, dealStages.name, dealStages.isTerminal, dealStages.sortOrder)
    .orderBy(dealStages.sortOrder);
  const dealsByStage: StageStat[] = stageRows.map((r) => ({
    label: r.label,
    count: r.c,
    value: Number(r.v ?? 0),
    isTerminal: r.isTerminal,
  }));
  const openPipelineValue = dealsByStage.filter((s) => !s.isTerminal).reduce((s, r) => s + r.value, 0);

  // Properties by status
  const propRows = await db
    .select({ status: properties.status, c: count() })
    .from(properties)
    .where(and(isNull(properties.deletedAt), propOwn))
    .groupBy(properties.status);
  const propertiesByStatus = propRows.map((r) => ({ label: r.status, value: r.c }));

  // Activities in last 7 days
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const [actRow] = await db
    .select({ c: count() })
    .from(activities)
    .where(and(isNull(activities.deletedAt), gte(activities.occurredAt, weekAgo), actOwn));
  const activitiesLast7Days = actRow?.c ?? 0;

  // Leaderboard (team leads/admins only)
  let leaderboard: AgentRow[] = [];
  if (mgr) {
    const agentRows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.active, true), isNull(users.deletedAt)))
      .orderBy(users.name);

    // Three GROUP BY queries for the whole leaderboard, not three per agent.
    // The original ran 3 queries per user - 15 sequential round trips at five staff,
    // 30 at ten - which is what made /reports slow.
    const [leadCounts, contactCounts, wonValues] = await Promise.all([
      db
        .select({ id: leads.assignedTo, c: count() })
        .from(leads)
        .where(isNull(leads.deletedAt))
        .groupBy(leads.assignedTo),
      db
        .select({ id: contacts.assignedTo, c: count() })
        .from(contacts)
        .where(isNull(contacts.deletedAt))
        .groupBy(contacts.assignedTo),
      db
        .select({ id: deals.assignedTo, v: sum(deals.value) })
        .from(deals)
        .innerJoin(dealStages, eq(deals.stageId, dealStages.id))
        // Match on the terminal flag, not the stage NAME. deal_stages is editable
        // without a deploy, so renaming "Closed Won" used to silently zero every
        // agent's won value with no error anywhere.
        .where(and(eq(dealStages.isTerminal, true), eq(dealStages.isWon, true), isNull(deals.deletedAt)))
        .groupBy(deals.assignedTo),
    ]);

    const leadMap = new Map(leadCounts.map((r) => [r.id, Number(r.c)]));
    const contactMap = new Map(contactCounts.map((r) => [r.id, Number(r.c)]));
    const wonMap = new Map(wonValues.map((r) => [r.id, Number(r.v ?? 0)]));

    leaderboard = agentRows.map((a) => ({
      name: a.name,
      leads: leadMap.get(a.id) ?? 0,
      contacts: contactMap.get(a.id) ?? 0,
      wonValue: wonMap.get(a.id) ?? 0,
    }));
    leaderboard.sort((x, y) => y.wonValue - x.wonValue);
  }

  return {
    scope: mgr ? "team" : "own",
    leadsByStatus,
    totalLeads,
    openLeads,
    qualifiedLeads,
    conversionRate,
    dealsByStage,
    openPipelineValue,
    propertiesByStatus,
    activitiesLast7Days,
    leaderboard,
  };
}

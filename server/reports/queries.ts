/** Role-scoped reporting aggregates. Agents see their own book; managers/admins see all. */
import { and, count, eq, gte, isNull, sum } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, contacts, deals, dealStages, properties, activities, users, type User } from "@/lib/db/schema";
import { isManagerOrAbove } from "@/lib/auth";

export interface Count { label: string; value: number }
export interface StageStat { label: string; count: number; value: number; isTerminal: boolean }
export interface AgentRow { name: string; leads: number; contacts: number; wonValue: number }

export interface ReportData {
  scope: "own" | "team";
  leadsByStatus: Count[];
  totalLeads: number;
  qualifiedLeads: number;
  conversionRate: number; // 0..1
  dealsByStage: StageStat[];
  openPipelineValue: number;
  propertiesByStatus: Count[];
  activitiesLast7Days: number;
  leaderboard: AgentRow[]; // empty for agents
}

export async function getReportData(user: User): Promise<ReportData> {
  const mgr = isManagerOrAbove(user);
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
  const qualifiedLeads = leadsByStatus.find((r) => r.label === "qualified")?.value ?? 0;
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

  // Leaderboard (managers/admins only)
  let leaderboard: AgentRow[] = [];
  if (mgr) {
    const agentRows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.active, true), isNull(users.deletedAt)))
      .orderBy(users.name);

    leaderboard = await Promise.all(
      agentRows.map(async (a) => {
        const [l] = await db.select({ c: count() }).from(leads).where(and(eq(leads.assignedTo, a.id), isNull(leads.deletedAt)));
        const [c] = await db.select({ c: count() }).from(contacts).where(and(eq(contacts.assignedTo, a.id), isNull(contacts.deletedAt)));
        const [w] = await db
          .select({ v: sum(deals.value) })
          .from(deals)
          .innerJoin(dealStages, eq(deals.stageId, dealStages.id))
          .where(and(eq(deals.assignedTo, a.id), eq(dealStages.name, "Closed Won"), isNull(deals.deletedAt)));
        return { name: a.name, leads: l?.c ?? 0, contacts: c?.c ?? 0, wonValue: Number(w?.v ?? 0) };
      }),
    );
    leaderboard.sort((x, y) => y.wonValue - x.wonValue);
  }

  return {
    scope: mgr ? "team" : "own",
    leadsByStatus,
    totalLeads,
    qualifiedLeads,
    conversionRate,
    dealsByStage,
    openPipelineValue,
    propertiesByStatus,
    activitiesLast7Days,
    leaderboard,
  };
}

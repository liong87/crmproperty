import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leadFormSources, projects, type LeadFormSource } from "@/lib/db/schema";

export interface LeadFormSourceRow extends LeadFormSource {
  projectName: string | null;
}

export async function listLeadFormSources(): Promise<LeadFormSourceRow[]> {
  const rows = await db
    .select({ src: leadFormSources, projectName: projects.name })
    .from(leadFormSources)
    .leftJoin(projects, eq(leadFormSources.projectId, projects.id))
    .where(isNull(leadFormSources.deletedAt))
    .orderBy(asc(leadFormSources.label));
  return rows.map((r) => ({ ...r.src, projectName: r.projectName }));
}

export async function getLeadFormSourceById(id: string): Promise<LeadFormSource | null> {
  const [row] = await db
    .select()
    .from(leadFormSources)
    .where(and(eq(leadFormSources.id, id), isNull(leadFormSources.deletedAt)));
  return row ?? null;
}

/**
 * One search across every record type a person can be found under.
 *
 * The problem it solves: to find a customer by phone the user had to already know
 * whether that person was a LEAD, a CONTACT, or only reachable through an
 * APPOINTMENT, and then visit the matching page — three searches, three URLs, and no
 * result at all from Pipeline, Dashboard, Inbox or Reports, which had no search box.
 *
 * RBAC is applied per record type with the SAME `ownershipFilter` the list pages use,
 * so global search can never widen what somebody can see. An agent searching a
 * colleague's client gets nothing back, exactly as on /leads.
 */
import { and, eq, ilike, isNull, or, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, contacts, properties, projects, type User } from "@/lib/db/schema";
import { ownershipFilter } from "@/lib/auth";
import { visibleUserIds } from "@/server/users/hierarchy";

export type SearchKind = "lead" | "contact" | "property" | "project";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  /** One line of context: phone, area, status — whatever identifies the record. */
  subtitle: string;
  href: string;
}

const PER_KIND = 5;

/** Digits-only phone matching, so "012-345 6789" finds "+60123456789". */
const digitsClause = (column: ReturnType<typeof sql.raw>, q: string) => {
  const digits = q.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length < 4) return undefined;
  return sql`regexp_replace(${column}, '\\D', '', 'g') like ${`%${digits}%`}`;
};

export async function globalSearch(user: User, rawQuery: string): Promise<SearchHit[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const teamIds = user.role === "team_lead" ? await visibleUserIds(user) : undefined;

  const [leadRows, contactRows, propertyRows, projectRows] = await Promise.all([
    db
      .select({ id: leads.id, name: leads.name, phone: leads.phone, status: leads.status })
      .from(leads)
      .where(
        and(
          isNull(leads.deletedAt),
          ownershipFilter(user, leads.assignedTo, teamIds),
          or(
            ilike(leads.name, like),
            ilike(leads.phone, like),
            ilike(leads.email, like),
            digitsClause(sql.raw('"leads"."phone"'), q),
          ),
        ),
      )
      .orderBy(desc(leads.createdAt))
      .limit(PER_KIND),
    db
      .select({ id: contacts.id, name: contacts.name, phone: contacts.phone })
      .from(contacts)
      .where(
        and(
          isNull(contacts.deletedAt),
          ownershipFilter(user, contacts.assignedTo, teamIds),
          or(
            ilike(contacts.name, like),
            ilike(contacts.phone, like),
            ilike(contacts.email, like),
            digitsClause(sql.raw('"contacts"."phone"'), q),
          ),
        ),
      )
      .orderBy(desc(contacts.createdAt))
      .limit(PER_KIND),
    db
      .select({ id: properties.id, title: properties.title, area: properties.area, status: properties.status })
      .from(properties)
      .where(
        and(
          isNull(properties.deletedAt),
          or(ilike(properties.title, like), ilike(properties.area, like), ilike(properties.ownerName, like)),
        ),
      )
      .orderBy(desc(properties.createdAt))
      .limit(PER_KIND),
    db
      .select({ id: projects.id, name: projects.name, area: projects.area, developer: projects.developer })
      .from(projects)
      .where(and(isNull(projects.deletedAt), or(ilike(projects.name, like), ilike(projects.area, like))))
      .orderBy(desc(projects.createdAt))
      .limit(PER_KIND),
  ]);

  return [
    ...leadRows.map((r): SearchHit => ({
      kind: "lead",
      id: r.id,
      title: r.name,
      subtitle: [r.phone, r.status].filter(Boolean).join(" · "),
      href: `/leads/${r.id}`,
    })),
    ...contactRows.map((r): SearchHit => ({
      kind: "contact",
      id: r.id,
      title: r.name,
      subtitle: r.phone ?? "",
      href: `/contacts/${r.id}`,
    })),
    ...propertyRows.map((r): SearchHit => ({
      kind: "property",
      id: r.id,
      title: r.title,
      subtitle: [r.area, r.status].filter(Boolean).join(" · "),
      href: `/properties/${r.id}`,
    })),
    ...projectRows.map((r): SearchHit => ({
      kind: "project",
      id: r.id,
      title: r.name,
      subtitle: [r.developer, r.area].filter(Boolean).join(" · "),
      href: `/projects/${r.id}`,
    })),
  ];
}

/**
 * Meta Lead Ads intake.
 *
 * The flow, which is unlike every other webhook here:
 *
 *   1. Meta POSTs a receipt containing a `leadgen_id` — and no lead data.
 *   2. We call the Graph API for the answers.
 *   3. We look up which project this form maps to.
 *   4. The result goes through the same `createLeadFromIntake` pipeline as everything
 *      else, so dedup, round-robin assignment, consent and agent notification behave
 *      identically whether a lead came from Facebook, a website form or a CSV.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leadFormSources, activities } from "@/lib/db/schema";
import { metaLeadAds, LeadAdsTransientError } from "@/lib/leadads";
import { monitoring } from "@/lib/monitoring";
import { createLeadFromIntake } from "./intake";
import { mapMetaLead, type MetaMapping } from "./meta-map";

/** One `entry[].changes[].value` from a Meta leadgen webhook. */
export interface MetaLeadgenChange {
  leadgen_id?: string;
  form_id?: string;
  page_id?: string;
  ad_id?: string;
  created_time?: number;
}

export interface MetaIntakeSummary {
  received: number;
  created: number;
  deduped: number;
  skipped: number;
}

/**
 * Pull the leadgen changes out of a webhook body.
 *
 * Meta batches: one delivery can carry several entries, each with several changes, and
 * fields other than `leadgen` share the same envelope. Anything that is not a leadgen
 * change with an id is ignored rather than treated as an error.
 */
export function extractLeadgenChanges(body: unknown): MetaLeadgenChange[] {
  const out: MetaLeadgenChange[] = [];
  const entries = (body as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const c = change as { field?: string; value?: MetaLeadgenChange };
      if (c?.field !== "leadgen") continue;
      if (!c.value?.leadgen_id) continue;
      out.push(c.value);
    }
  }
  return out;
}

async function findMapping(formId: string | null): Promise<MetaMapping | null> {
  if (!formId) return null;
  const [row] = await db
    .select()
    .from(leadFormSources)
    .where(
      and(
        eq(leadFormSources.provider, "meta"),
        eq(leadFormSources.externalFormId, formId),
        eq(leadFormSources.active, true),
        isNull(leadFormSources.deletedAt),
      ),
    );
  return row
    ? {
        projectId: row.projectId,
        defaultInterest: row.defaultInterest,
        label: row.label,
        fieldMap: row.fieldMap ?? null,
      }
    : null;
}

/**
 * Process every leadgen change in one webhook delivery.
 *
 * Throws `LeadAdsTransientError` if the Graph API is unreachable or the token is bad,
 * so the caller can answer 5xx and let Meta retry — Meta retries for up to 36 hours,
 * which is long enough for somebody to fix a token without losing the lead.
 *
 * A lead that cannot be turned into a valid record (no usable phone number, say) is
 * counted as skipped rather than thrown, because retrying will never fix it and a
 * permanent 5xx would hold up every other lead in the batch.
 */
export async function ingestMetaLeadgen(changes: MetaLeadgenChange[]): Promise<MetaIntakeSummary> {
  const summary: MetaIntakeSummary = { received: changes.length, created: 0, deduped: 0, skipped: 0 };

  for (const change of changes) {
    const leadgenId = change.leadgen_id!;

    // Transient failures propagate: Meta should retry rather than lose the lead.
    const record = await metaLeadAds.fetchLead(leadgenId);
    if (!record) {
      monitoring.captureMessage("Meta leadgen not found", { leadgenId });
      summary.skipped++;
      continue;
    }

    const mapping = await findMapping(record.formId ?? change.form_id ?? null);
    if (!mapping) {
      // Deliberately NOT a failure. Dropping a paid lead because nobody filled in a
      // mapping would be far worse than filing it without a project.
      monitoring.captureMessage("Meta lead form is not mapped to a project", {
        formId: record.formId ?? change.form_id ?? "unknown",
      });
    }

    const mapped = mapMetaLead(record, mapping);
    const { extraAnswers, ...payload } = mapped;

    const result = await createLeadFromIntake(payload, "webhook");
    if (!result.success) {
      monitoring.captureMessage("Meta lead rejected by intake", {
        leadgenId,
        error: result.error,
      });
      summary.skipped++;
      continue;
    }

    if (result.data.deduped) summary.deduped++;
    else summary.created++;

    // Custom questions ("when are you looking to move?") have no column of their own.
    // Losing them would waste the most useful part of a well-built lead form, so they
    // go on the timeline where the agent making the call will actually read them.
    const extras = Object.entries(extraAnswers);
    if (extras.length > 0) {
      try {
        await db.insert(activities).values({
          entityType: "leads",
          entityId: result.data.leadId,
          type: "note",
          body: `Form answers:\n${extras.map(([k, v]) => `• ${k.replace(/_/g, " ")}: ${v}`).join("\n")}`,
        });
      } catch (err) {
        // The lead is already saved; losing the extras is not worth failing the batch.
        monitoring.captureException(err, { where: "ingestMetaLeadgen.extras" });
      }
    }
  }

  return summary;
}

export { LeadAdsTransientError };

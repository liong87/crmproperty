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
import { leadFormSources, activities, captureEvents } from "@/lib/db/schema";
import { metaLeadAds, LeadAdsTransientError } from "@/lib/leadads";
import { getMetaCredentials } from "@/server/lead-sources/credentials";
import { ownerOfExternalPage } from "@/server/capture/ownership";
import { decryptSecret } from "@/lib/crypto/secret-box";
import type { AdPlatformCredentials } from "@/lib/leadads";
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

interface PageRoute {
  cred: AdPlatformCredentials;
  /** The agent whose connection produced this lead. Null for the legacy shared page. */
  ownerUserId: string | null;
}

/**
 * Whose Page is this, and with what token.
 *
 * Per-user first: the Page id on the webhook is matched against the connections agents
 * made themselves, and the lead is then assigned to that agent rather than dropped into
 * round-robin. That is the entire point of per-user capture — an agent's own ad spend
 * produces leads in their own queue.
 *
 * The agency-wide connection remains as a fallback so a Page connected before Brief 5
 * keeps working. It has no owner, so those leads assign as they always did.
 */
async function routeFor(pageId: string | null): Promise<PageRoute | null> {
  if (pageId) {
    const owned = await ownerOfExternalPage("facebook", pageId);
    if (owned) {
      try {
        return {
          cred: { accountId: owned.page.externalPageId, token: await decryptSecret(owned.page.accessToken) },
          ownerUserId: owned.account.ownerUserId,
        };
      } catch (err) {
        /*
         * A stored token we cannot decrypt means ENCRYPTION_KEY changed. Falling
         * through to the shared connection keeps leads arriving, but it must be loud —
         * otherwise the agent's connection silently stops being the one in use and
         * their leads quietly start landing in round-robin.
         */
        monitoring.captureException(err, { where: "routeFor:decrypt", pageId });
      }
    }
  }
  const shared = await getMetaCredentials();
  return shared ? { cred: shared, ownerUserId: null } : null;
}

/**
 * Claim a delivery, or discover it has already been handled.
 *
 * Meta redelivers. Without this, a retry after a slow response creates the lead twice,
 * and the second copy looks like a genuine second enquiry. The unique index on
 * `leadgen_id` is what makes the claim atomic — two Workers racing the same retry, and
 * exactly one insert wins.
 *
 * Returns the row id when this delivery is ours to process, or null when somebody
 * already has it.
 */
async function claim(change: MetaLeadgenChange): Promise<string | null> {
  try {
    const [row] = await db
      .insert(captureEvents)
      .values({
        leadgenId: change.leadgen_id!,
        externalPageId: change.page_id ?? null,
        formId: change.form_id ?? null,
        rawPayload: JSON.stringify(change),
        status: "received",
      })
      .onConflictDoNothing({ target: captureEvents.leadgenId })
      .returning({ id: captureEvents.id });
    return row?.id ?? null;
  } catch (err) {
    /*
     * Never let bookkeeping lose a lead. If the audit insert fails for any reason
     * other than the duplicate it is designed to catch, process the lead anyway and
     * accept the small risk of a double rather than the certainty of a miss.
     */
    monitoring.captureException(err, { where: "claim", leadgenId: change.leadgen_id });
    return "unrecorded";
  }
}

async function settle(
  eventId: string,
  status: string,
  extra: { leadId?: string; error?: string } = {},
): Promise<void> {
  if (eventId === "unrecorded") return;
  try {
    await db
      .update(captureEvents)
      .set({
        status,
        ...(extra.leadId ? { leadId: extra.leadId } : {}),
        ...(extra.error ? { error: extra.error.slice(0, 2000) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(captureEvents.id, eventId));
  } catch (err) {
    monitoring.captureException(err, { where: "settle", eventId });
  }
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

    // Idempotency BEFORE any Graph call. A redelivery must cost nothing and, more
    // importantly, must not create a second lead.
    const eventId = await claim(change);
    if (!eventId) {
      summary.deduped++;
      continue;
    }

    /*
     * Resolved per delivery, not once per batch: one webhook body can carry changes
     * for several Pages, and with per-user capture those Pages belong to different
     * agents with different tokens.
     *
     * Missing credentials are TRANSIENT. A webhook that answered 200 with no token
     * would tell Meta the lead was accepted, and Meta does not send it twice — so a
     * disconnected Page would quietly bin every lead the agency paid for. Throwing
     * makes Meta retry for up to 36 hours, which is long enough for somebody to
     * reconnect.
     */
    const route = await routeFor(change.page_id ?? null);
    if (!route) {
      await settle(eventId, "failed", { error: "No Facebook connection for this page." });
      throw new LeadAdsTransientError(
        `No Facebook connection for page ${change.page_id ?? "unknown"}, so lead answers cannot be fetched.`,
      );
    }

    let record;
    try {
      record = await metaLeadAds.fetchLead(route.cred, leadgenId);
    } catch (err) {
      // Also transient — the token may be expiring or Graph may be down. Record the
      // attempt, then let it propagate so Meta retries.
      await settle(eventId, "failed", { error: (err as Error).message });
      throw err;
    }

    if (!record) {
      monitoring.captureMessage("Meta leadgen not found", { leadgenId });
      await settle(eventId, "failed", { error: "Graph API has no such lead." });
      summary.skipped++;
      continue;
    }
    await settle(eventId, "fetched");

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

    // The agent who connected the Page gets the lead. Passing null keeps the existing
    // round-robin, which is right for the legacy agency-wide connection.
    const result = await createLeadFromIntake(payload, "webhook", route.ownerUserId);
    if (!result.success) {
      monitoring.captureMessage("Meta lead rejected by intake", { leadgenId, error: result.error });
      await settle(eventId, "failed", { error: result.error });
      summary.skipped++;
      continue;
    }

    if (result.data.deduped) summary.deduped++;
    else summary.created++;
    await settle(eventId, result.data.deduped ? "duplicate" : "created", { leadId: result.data.leadId });

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

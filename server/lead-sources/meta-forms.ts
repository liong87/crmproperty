"use server";
/**
 * Facebook lead forms, from inside the CRM.
 *
 * Two actions, both admin/manager only:
 *
 *   importMetaForms   read the Page's existing forms and create a mapping row for any
 *                     we do not have, so mapping a campaign to a project becomes
 *                     picking from a list instead of pasting an id out of Meta.
 *   createMetaForm    build a new form ON FACEBOOK and map it in one step.
 *
 * Imported forms arrive UNMAPPED (no project). That is deliberate: guessing which
 * project "Aug Launch FB 2" means would put paid leads in the wrong funnel, and a
 * wrong project is worse than a blank one because nobody goes back to check it.
 */
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { leadFormSources, type LeadFormSource } from "@/lib/db/schema";
import { requireDbUser, assertRole, AuthorizationError } from "@/lib/auth";
import { INTEREST } from "@/lib/constants";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import { metaLeadForms, LeadAdsTransientError, type RemoteFormQuestion } from "@/lib/leadads";
import { cleanFieldMap, MAPPABLE_FIELDS, type LeadFieldMap } from "@/lib/lead-forms/field-map";
import { getLeadFormSourceById } from "./queries";
import type { ActionResult } from "@/types";

export interface ImportSummary {
  /** Forms Meta knows about. */
  found: number;
  /** Rows we created — forms we had never seen. */
  imported: number;
  /** Already mapped, left exactly as they were. */
  existing: number;
}

export async function importMetaForms(): Promise<ActionResult<ImportSummary>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");

    if (!metaLeadForms.isConfigured()) {
      return fail(
        "Facebook is not connected yet. Set META_PAGE_ID and META_PAGE_ACCESS_TOKEN, then try again.",
      );
    }

    const remote = await metaLeadForms.listForms();
    if (remote.length === 0) {
      return ok({ found: 0, imported: 0, existing: 0 });
    }

    // One query for every id rather than one per form.
    const ids = remote.map((f) => f.id);
    const known = await db
      .select({ externalFormId: leadFormSources.externalFormId })
      .from(leadFormSources)
      .where(
        and(
          eq(leadFormSources.provider, "meta"),
          inArray(leadFormSources.externalFormId, ids),
          isNull(leadFormSources.deletedAt),
        ),
      );
    const seen = new Set(known.map((k) => k.externalFormId));
    const fresh = remote.filter((f) => !seen.has(f.id));

    if (fresh.length > 0) {
      await db.insert(leadFormSources).values(
        fresh.map((f) => ({
          provider: "meta",
          externalFormId: f.id,
          // Meta's own name for it, truncated to what the column holds.
          label: f.name.slice(0, 255),
          projectId: null,
          active: true,
          notes: `Imported from Facebook${f.status ? ` · ${f.status}` : ""}`,
        })),
      );
    }

    revalidatePath("/leads-capture");
    return ok({ found: remote.length, imported: fresh.length, existing: remote.length - fresh.length });
  } catch (err) {
    return handle(err, "importMetaForms");
  }
}

const questionSchema = z.union([
  z.object({ type: z.enum(["FULL_NAME", "EMAIL", "PHONE"]) }),
  z.object({
    type: z.literal("CUSTOM"),
    key: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, "Custom field keys are lowercase letters, digits and underscores."),
    label: z.string().min(1).max(255),
    options: z.array(z.string().min(1).max(120)).max(10).optional(),
  }),
]);

const createSchema = z.object({
  name: z.string().min(1).max(255),
  questions: z.array(questionSchema).min(1).max(15),
  privacyPolicyUrl: z.string().url("The privacy policy must be a full URL, including https://."),
  followUpUrl: z.string().url().optional().or(z.literal("")),
  introHeadline: z.string().max(60).optional().or(z.literal("")),
  introBody: z.string().max(500).optional().or(z.literal("")),
  projectId: z.string().uuid().optional().nullable(),
  defaultInterest: z.enum(INTEREST).optional().nullable(),
});

export async function createMetaForm(input: unknown): Promise<ActionResult<LeadFormSource>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    const d = createSchema.parse(input);

    if (!metaLeadForms.isConfigured()) {
      return fail(
        "Facebook is not connected yet. Set META_PAGE_ID and META_PAGE_ACCESS_TOKEN, then try again.",
      );
    }

    // A phone number is what makes a property lead workable, and Meta pre-fills it, so
    // there is no cost to insisting on it — a form without one produces leads nobody
    // can act on.
    const hasPhone = d.questions.some((q) => q.type === "PHONE");
    if (!hasPhone) return fail("Add the Phone question — a lead with no number cannot be followed up.");

    const created = await metaLeadForms.createForm({
      name: d.name,
      questions: d.questions,
      privacyPolicyUrl: d.privacyPolicyUrl,
      followUpUrl: d.followUpUrl || undefined,
      introHeadline: d.introHeadline || undefined,
      introBody: d.introBody || undefined,
    });

    // The form now exists on Facebook whatever happens next, so a failure here must
    // not read as "nothing happened" — the mapping is recoverable, the form is not.
    try {
      const [row] = await db
        .insert(leadFormSources)
        .values({
          provider: "meta",
          externalFormId: created.id,
          label: d.name.slice(0, 255),
          projectId: d.projectId ?? null,
          defaultInterest: d.defaultInterest ?? null,
          active: true,
          notes: "Created from the CRM",
        })
        .returning();
      revalidatePath("/leads-capture");
      return ok(row!);
    } catch (dbErr) {
      monitoring.captureException(dbErr, { where: "createMetaForm:mapping", formId: created.id });
      return fail(
        `The form was created on Facebook (id ${created.id}) but saving the mapping here failed. ` +
          `Use "Import forms from Facebook" to pick it up.`,
      );
    }
  } catch (err) {
    return handle(err, "createMetaForm");
  }
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail("You do not have permission to change lead sources.");
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  // Graph failures already carry Meta's own wording, which is more useful than ours.
  if (err instanceof LeadAdsTransientError) return fail(`Facebook says: ${err.message}`);
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}


/**
 * The questions on one mapped form, read live from the platform.
 *
 * Live rather than stored on purpose: a form's questions are fixed the moment it is
 * created, so a cached copy can only ever go stale in one direction — showing
 * questions for a form somebody archived and rebuilt. One Graph call when the dialog
 * opens is cheap and always right.
 */
export async function loadFormQuestions(sourceId: string): Promise<ActionResult<RemoteFormQuestion[]>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    z.string().uuid().parse(sourceId);

    const source = await getLeadFormSourceById(sourceId);
    if (!source) return fail("Mapping not found.");
    if (source.provider !== "meta") {
      return fail("Only Facebook forms can list their questions from here.");
    }
    if (!metaLeadForms.isConfigured()) {
      return fail("Facebook is not connected. Set META_PAGE_ID and META_PAGE_ACCESS_TOKEN.");
    }

    return ok(await metaLeadForms.listQuestions(source.externalFormId));
  } catch (err) {
    return handle(err, "loadFormQuestions");
  }
}

const fieldMapSchema = z.object({
  id: z.string().uuid(),
  fieldMap: z.record(z.string(), z.string()).default({}),
});

export async function saveFieldMap(input: unknown): Promise<ActionResult<LeadFieldMap>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    const d = fieldMapSchema.parse(input);

    const source = await getLeadFormSourceById(d.id);
    if (!source) return fail("Mapping not found.");

    const map = cleanFieldMap(d.fieldMap);

    // Mapping the same question onto two fields is always a mistake, and it produces a
    // lead whose name is their phone number. Catch it here rather than in the data.
    const used = new Map<string, string>();
    for (const f of MAPPABLE_FIELDS) {
      const q = map[f.key];
      if (!q) continue;
      const already = used.get(q);
      if (already) return fail(`"${q}" is mapped to both ${already} and ${f.label}. Pick one.`);
      used.set(q, f.label);
    }

    // Empty means "go back to guessing", which is a real choice and has to be storable.
    await db
      .update(leadFormSources)
      .set({ fieldMap: Object.keys(map).length > 0 ? map : null })
      .where(eq(leadFormSources.id, d.id));

    revalidatePath("/leads-capture");
    return ok(map);
  } catch (err) {
    return handle(err, "saveFieldMap");
  }
}

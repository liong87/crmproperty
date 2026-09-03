"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { capturePages, captureAccounts, leadFormSources } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { subscribePageToLeadgen, unsubscribePage } from "@/lib/capture/meta-graph";
import { metaLeadForms } from "@/lib/leadads";
import { monitoring } from "@/lib/monitoring";
import { ok, fail } from "@/lib/action-result";
import type { ActionResult } from "@/types";
import {
  CaptureAuthError,
  CaptureNotFoundError,
  listMyPages,
  requireMyAccount,
  requireMyPage,
} from "./ownership";

/**
 * Turn a thrown ownership error into the message the user sees.
 *
 * "Not found" for somebody else's id, never "forbidden": a 403 confirms the row exists
 * and therefore tells an agent that a given connection belongs to a colleague.
 */
function asFailure(err: unknown): ActionResult<never> {
  if (err instanceof CaptureNotFoundError) return fail("That connection does not exist.");
  if (err instanceof CaptureAuthError) return fail("You must be signed in.");
  monitoring.captureException(err, { where: "capture:action" });
  return fail((err as Error).message || "Something went wrong.");
}

/**
 * Choose which Pages under one connection feed the CRM.
 *
 * `subscribed` is only ever written true after Meta CONFIRMS the subscription. A row
 * marked subscribed on optimism would show the agent a working connection that
 * receives no webhook at all — the failure would surface weeks later as "we stopped
 * getting leads" with nothing in the CRM contradicting it.
 *
 * Partial success is reported honestly rather than rolled back: a Page that did
 * subscribe should stay subscribed, and the agent needs to know which one did not.
 */
export async function setPageSubscriptions(
  accountId: string,
  pageIds: string[],
): Promise<ActionResult<{ subscribed: number; failed: string[] }>> {
  try {
    await requireMyAccount(accountId); // Ownership. Throws NotFound for anyone else's.

    const rows = await db
      .select()
      .from(capturePages)
      .where(and(eq(capturePages.accountId, accountId), isNull(capturePages.deletedAt)));

    const wanted = new Set(pageIds);
    const failed: string[] = [];
    let subscribed = 0;

    for (const page of rows) {
      const shouldBeOn = wanted.has(page.id);
      if (shouldBeOn === page.subscribed) continue;

      let token: string;
      try {
        token = await decryptSecret(page.accessToken);
      } catch (err) {
        // A token we cannot decrypt means the encryption key changed. Reconnecting is
        // the only fix, and saying so beats a generic failure.
        monitoring.captureException(err, { where: "capture:setPageSubscriptions:decrypt", pageId: page.id });
        failed.push(`${page.name} (stored token unreadable — reconnect Facebook)`);
        continue;
      }

      try {
        if (shouldBeOn) {
          await subscribePageToLeadgen(page.externalPageId, token);
          subscribed += 1;
        } else {
          await unsubscribePage(page.externalPageId, token);
        }
        await db
          .update(capturePages)
          .set({ subscribed: shouldBeOn, updatedAt: new Date() })
          .where(eq(capturePages.id, page.id));
      } catch (err) {
        monitoring.captureException(err, { where: "capture:setPageSubscriptions", pageId: page.id });
        failed.push(`${page.name}: ${(err as Error).message}`);
      }
    }

    revalidatePath("/leads-capture");
    return ok({ subscribed, failed });
  } catch (err) {
    return asFailure(err);
  }
}

/**
 * Disconnect one Facebook account.
 *
 * Meta is told first. A soft-deleted row with a live subscription on Meta's side keeps
 * webhooks arriving for a connection the CRM believes is gone, and those deliveries
 * then fail the ownership lookup and pile up as unexplained errors. If Meta refuses,
 * the local rows are still removed — the user asked to disconnect and must not be stuck
 * — but the failure is recorded.
 */
export async function disconnectAccount(accountId: string): Promise<ActionResult<null>> {
  try {
    const account = await requireMyAccount(accountId);

    /*
     * Only a PAGE has a webhook subscription to remove. An ad account is read on
     * demand and has nothing registered at Meta, so calling subscribed_apps for one
     * fails with a confusing permissions error — and that error would then look like
     * the disconnect itself had failed.
     */
    const rows = account.provider !== "facebook" ? [] : await db
      .select()
      .from(capturePages)
      .where(
        and(
          eq(capturePages.accountId, accountId),
          eq(capturePages.subscribed, true),
          isNull(capturePages.deletedAt),
        ),
      );

    for (const page of rows) {
      try {
        await unsubscribePage(page.externalPageId, await decryptSecret(page.accessToken));
      } catch (err) {
        monitoring.captureException(err, { where: "capture:disconnect:unsubscribe", pageId: page.id });
      }
    }

    const now = new Date();
    if (rows.length > 0) {
      await db
        .update(capturePages)
        .set({ subscribed: false, deletedAt: now, updatedAt: now })
        .where(inArray(capturePages.id, rows.map((r) => r.id)));
    }
    await db
      .update(capturePages)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(capturePages.accountId, accountId), isNull(capturePages.deletedAt)));
    await db
      .update(captureAccounts)
      .set({ status: "revoked", deletedAt: now, updatedAt: now })
      .where(eq(captureAccounts.id, accountId));

    revalidatePath("/leads-capture");
    return ok(null);
  } catch (err) {
    return asFailure(err);
  }
}

/** Toggle one Page. Thin wrapper so a single checkbox does not have to send the whole set. */
export async function setPageSubscribed(pageId: string, on: boolean): Promise<ActionResult<null>> {
  try {
    const { page, account } = await requireMyPage(pageId);
    if (page.subscribed === on) return ok(null);

    const token = await decryptSecret(page.accessToken);
    if (on) await subscribePageToLeadgen(page.externalPageId, token);
    else await unsubscribePage(page.externalPageId, token);

    await db
      .update(capturePages)
      .set({ subscribed: on, updatedAt: new Date() })
      .where(and(eq(capturePages.id, page.id), eq(capturePages.accountId, account.id)));

    revalidatePath("/leads-capture");
    return ok(null);
  } catch (err) {
    return asFailure(err);
  }
}
export interface AvailableForm {
  externalFormId: string;
  name: string;
  /** Meta: DRAFT | ACTIVE | ARCHIVED. */
  status: string | null;
  leadsCount: number | null;
  /** Already added to the CRM — shown as "Configured" rather than offered again. */
  configured: boolean;
}

export interface AvailablePage {
  capturePageId: string;
  pageName: string;
  forms: AvailableForm[];
  /** Set when this page could not be read; `forms` is then empty. */
  error?: string;
}

/**
 * Every lead form on the pages the signed-in user has connected, live from Facebook.
 *
 * This is what makes the form picker possible, and it is the whole answer to "why do I
 * have to paste a form id into the backend". The id is Facebook's to know, not the
 * agent's to transcribe — a mistyped one produces a mapping that silently never matches
 * a lead, which is exactly how "met1 campaign" ended up pointing at an app id.
 *
 * Questions are NOT fetched here. That would be one Graph call per form and this list
 * has to open quickly; the picker fetches them when a row is expanded.
 */
export async function listAvailableForms(): Promise<ActionResult<AvailablePage[]>> {
  try {
    const pages = (await listMyPages("facebook")).filter((p) => p.subscribed);
    if (pages.length === 0) {
      return fail("No page is connected yet. Connect Facebook and tick a page first.");
    }

    const known = await db
      .select({ externalFormId: leadFormSources.externalFormId })
      .from(leadFormSources)
      .where(and(eq(leadFormSources.provider, "meta"), isNull(leadFormSources.deletedAt)));
    const configured = new Set(known.map((k) => k.externalFormId));

    const out: AvailablePage[] = [];
    for (const page of pages) {
      try {
        const token = await decryptSecret(page.accessToken);
        const remote = await metaLeadForms.listForms({ accountId: page.externalPageId, token });
        out.push({
          capturePageId: page.id,
          pageName: page.name,
          forms: remote.map((f) => ({
            externalFormId: f.id,
            name: f.name,
            status: f.status,
            leadsCount: f.leadsCount,
            configured: configured.has(f.id),
          })),
        });
      } catch (err) {
        // One unreadable page must not blank the whole picker — the others still work,
        // and the agent needs to see WHICH one failed and why.
        monitoring.captureException(err, { where: "capture:listAvailableForms", pageId: page.id });
        out.push({
          capturePageId: page.id,
          pageName: page.name,
          forms: [],
          error: (err as Error).message,
        });
      }
    }
    return ok(out);
  } catch (err) {
    return asFailure(err);
  }
}

/** The questions on one form, for the expanded row in the picker. */
export async function listFormFields(
  capturePageId: string,
  externalFormId: string,
): Promise<ActionResult<{ key: string; label: string; type: string | null }[]>> {
  try {
    const { page } = await requireMyPage(capturePageId);
    const token = await decryptSecret(page.accessToken);
    const questions = await metaLeadForms.listQuestions(
      { accountId: page.externalPageId, token },
      externalFormId,
    );
    return ok(questions);
  } catch (err) {
    return asFailure(err);
  }
}

/**
 * Add one form from the picker.
 *
 * Deliberately NOT "import everything on the page". A page that has run ads for years
 * carries dozens of dead forms and a row per Messenger auto-form; pulling them all in
 * makes the list unusable and buries the two that matter.
 *
 * The form arrives UNMAPPED (no project). Guessing which project "KL South Sept 2021"
 * means would put paid leads in the wrong funnel, and a wrong project is worse than a
 * blank one because nobody goes back to check it.
 */
export async function addPageForm(
  capturePageId: string,
  externalFormId: string,
): Promise<ActionResult<{ id: string; label: string }>> {
  try {
    const { page } = await requireMyPage(capturePageId);
    const token = await decryptSecret(page.accessToken);
    const cred = { accountId: page.externalPageId, token };

    const remote = await metaLeadForms.listForms(cred);
    const form = remote.find((f) => f.id === externalFormId);
    if (!form) return fail("That form is no longer on the page.");

    const [existing] = await db
      .select({ id: leadFormSources.id })
      .from(leadFormSources)
      .where(
        and(
          eq(leadFormSources.provider, "meta"),
          eq(leadFormSources.externalFormId, externalFormId),
          isNull(leadFormSources.deletedAt),
        ),
      )
      .limit(1);
    if (existing) return fail("That form is already in your CRM.");

    // The question labels, stored so the field-mapping screen and the lead detail view
    // can name a custom answer without another round trip to Facebook.
    let infoFields: string[] = [];
    try {
      infoFields = (await metaLeadForms.listQuestions(cred, externalFormId)).map((q) => q.label);
    } catch (err) {
      // Not fatal: the form still works, the mapping screen just fetches them later.
      monitoring.captureException(err, { where: "capture:addPageForm:questions", externalFormId });
    }

    const [row] = await db
      .insert(leadFormSources)
      .values({
        provider: "meta",
        externalFormId,
        label: form.name.slice(0, 255),
        formName: form.name.slice(0, 255),
        capturePageId: page.id,
        infoFields,
        projectId: null,
        active: true,
        notes: `Added from ${page.name}${form.status ? ` · ${form.status}` : ""}`,
      })
      .returning({ id: leadFormSources.id, label: leadFormSources.label });

    revalidatePath("/leads-capture");
    return ok(row!);
  } catch (err) {
    return asFailure(err);
  }
}

/**
 * Choose which ad accounts feed the report.
 *
 * Deliberately NOT setPageSubscriptions. That one calls Meta to subscribe a Page to
 * the leadgen webhook, which is meaningless for an ad account and would fail with a
 * confusing permissions error. Here `subscribed` means only "include this in the
 * report" — a local flag, no Graph call, nothing to go wrong at Facebook.
 */
export async function setAdAccountSelected(pageId: string, on: boolean): Promise<ActionResult<null>> {
  try {
    const { page, account } = await requireMyPage(pageId);
    if (account.provider !== "meta_ads") return fail("That is not an ad account.");
    await db
      .update(capturePages)
      .set({ subscribed: on, updatedAt: new Date() })
      .where(eq(capturePages.id, page.id));
    revalidatePath("/reports");
    return ok(null);
  } catch (err) {
    return asFailure(err);
  }
}

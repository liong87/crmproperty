import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { captureAccounts, capturePages } from "@/lib/db/schema";
import { getCurrentDbUser } from "@/lib/auth";
import type { CaptureAccount, CapturePage } from "@/lib/db/schema";

/**
 * The one place capture credentials are scoped to their owner.
 *
 * Every read and write of a capture account or page goes through a function in this
 * file. That is deliberate and it is the whole security model for Brief 5: a hand
 * written `and(eq(ownerUserId, me.id))` per query is how these leak, because the day
 * somebody adds an eleventh query and forgets the clause, one agent's Facebook
 * connection is visible to another and nothing fails loudly.
 *
 * TWO RULES THAT ARE NOT NEGOTIABLE:
 *
 * 1. An account belongs to a person, not to the agency. An admin may see THAT an agent
 *    has connected Facebook (that is a users-table fact) but never the row, the token,
 *    or the pages behind it. There is no admin override in this file on purpose — if a
 *    future feature genuinely needs one, it gets its own named function with its own
 *    justification, so the exception is visible in review.
 *
 * 2. Another person's account id is NOT FOUND, never FORBIDDEN. A 403 confirms the id
 *    exists, which tells an agent that a given account belongs to somebody; 404 tells
 *    them nothing. Callers must translate `CaptureNotFoundError` to a 404.
 */

export class CaptureNotFoundError extends Error {
  constructor() {
    // The message is user-facing, so it must not hint that the row exists elsewhere.
    super("That connection does not exist.");
    this.name = "CaptureNotFoundError";
  }
}

export class CaptureAuthError extends Error {
  constructor() {
    super("You must be signed in.");
    this.name = "CaptureAuthError";
  }
}

/** The signed-in user, or a throw. Separate so callers cannot forget the null case. */
export async function requireCaptureUser(): Promise<{ id: string }> {
  const me = await getCurrentDbUser();
  if (!me) throw new CaptureAuthError();
  return { id: me.id };
}

/** Every live account belonging to the signed-in user. Tokens included — server only. */
export async function listMyAccounts(provider?: string): Promise<CaptureAccount[]> {
  const me = await requireCaptureUser();
  return db
    .select()
    .from(captureAccounts)
    .where(
      and(
        eq(captureAccounts.ownerUserId, me.id),
        isNull(captureAccounts.deletedAt),
        ...(provider ? [eq(captureAccounts.provider, provider)] : []),
      ),
    );
}

/**
 * One account by id, IF it belongs to the signed-in user.
 *
 * Throws `CaptureNotFoundError` for an id that does not exist AND for one that belongs
 * to somebody else — the two cases are indistinguishable to the caller by design.
 */
export async function requireMyAccount(accountId: string): Promise<CaptureAccount> {
  const me = await requireCaptureUser();
  const [row] = await db
    .select()
    .from(captureAccounts)
    .where(
      and(
        eq(captureAccounts.id, accountId),
        eq(captureAccounts.ownerUserId, me.id),
        isNull(captureAccounts.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new CaptureNotFoundError();
  return row;
}

/** Every live page under the signed-in user's accounts, for one provider or all. */
export async function listMyPages(provider?: string): Promise<Array<CapturePage & { accountId: string }>> {
  const me = await requireCaptureUser();
  const rows = await db
    .select({ page: capturePages })
    .from(capturePages)
    .innerJoin(captureAccounts, eq(capturePages.accountId, captureAccounts.id))
    .where(
      and(
        eq(captureAccounts.ownerUserId, me.id),
        isNull(captureAccounts.deletedAt),
        isNull(capturePages.deletedAt),
        ...(provider ? [eq(captureAccounts.provider, provider)] : []),
      ),
    );
  return rows.map((r) => r.page);
}

/**
 * One page by id, IF the account above it belongs to the signed-in user.
 *
 * The join to `capture_accounts` is the point: page rows carry no owner column, so a
 * query that filtered only on `capture_pages` would happily return anybody's page.
 */
export async function requireMyPage(pageId: string): Promise<{ page: CapturePage; account: CaptureAccount }> {
  const me = await requireCaptureUser();
  const [row] = await db
    .select({ page: capturePages, account: captureAccounts })
    .from(capturePages)
    .innerJoin(captureAccounts, eq(capturePages.accountId, captureAccounts.id))
    .where(
      and(
        eq(capturePages.id, pageId),
        eq(captureAccounts.ownerUserId, me.id),
        isNull(captureAccounts.deletedAt),
        isNull(capturePages.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new CaptureNotFoundError();
  return row;
}

/**
 * The owner of a page, looked up by the PLATFORM's page id.
 *
 * This is the webhook's entry point, and it is the one caller that is not acting as a
 * signed-in user — Meta is. It therefore takes no session and grants nothing: it only
 * answers "whose page is this, and with what token", so an inbound lead can be routed
 * to the agent whose connection produced it.
 */
export async function ownerOfExternalPage(
  provider: string,
  externalPageId: string,
): Promise<{ page: CapturePage; account: CaptureAccount } | null> {
  const [row] = await db
    .select({ page: capturePages, account: captureAccounts })
    .from(capturePages)
    .innerJoin(captureAccounts, eq(capturePages.accountId, captureAccounts.id))
    .where(
      and(
        eq(capturePages.externalPageId, externalPageId),
        eq(captureAccounts.provider, provider),
        eq(capturePages.subscribed, true),
        isNull(capturePages.deletedAt),
        isNull(captureAccounts.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

import { listMyAccounts, listMyPages } from "./ownership";

/**
 * What the browser is allowed to know about a capture connection.
 *
 * There is no token field here and there must never be one — not encrypted, not
 * truncated, not "just the last four". Anything in one of these objects can end up in
 * the RSC payload, which is HTML, which is in the user's page source. The shape is the
 * enforcement: a caller cannot leak a token it was never handed.
 */
export interface CaptureAccountView {
  id: string;
  provider: string;
  displayName: string;
  status: string;
  /** Null means Meta stated no expiry; a past date means leads have stopped. */
  tokenExpiresAt: Date | null;
  connectedAt: Date;
  pages: CapturePageView[];
}

export interface CapturePageView {
  id: string;
  externalPageId: string;
  name: string;
  subscribed: boolean;
  lastSyncedAt: Date | null;
}

/** Every Facebook connection belonging to the signed-in user, with its pages. */
export async function listMyCaptureAccounts(provider = "facebook"): Promise<CaptureAccountView[]> {
  const [accounts, pages] = await Promise.all([listMyAccounts(provider), listMyPages(provider)]);

  const byAccount = new Map<string, CapturePageView[]>();
  for (const p of pages) {
    const list = byAccount.get(p.accountId) ?? [];
    list.push({
      id: p.id,
      externalPageId: p.externalPageId,
      name: p.name,
      subscribed: p.subscribed,
      lastSyncedAt: p.lastSyncedAt,
    });
    byAccount.set(p.accountId, list);
  }

  return accounts.map((a) => ({
    id: a.id,
    provider: a.provider,
    displayName: a.displayName,
    status: a.status,
    tokenExpiresAt: a.tokenExpiresAt,
    connectedAt: a.createdAt,
    pages: (byAccount.get(a.id) ?? []).sort((x, y) => x.name.localeCompare(y.name)),
  }));
}

export interface AdAccountView {
  id: string;
  externalId: string;
  name: string;
  selected: boolean;
}

/**
 * The signed-in user's Meta ad accounts.
 *
 * Same isolation as everything else in this file: an agent sees their own ad accounts
 * and nobody else's, admins included. Spend is commercially sensitive between agents
 * running their own budgets, so this is not a place to make an exception.
 */
export async function listMyAdAccounts(): Promise<AdAccountView[]> {
  const pages = await listMyPages("meta_ads");
  return pages
    .map((p) => ({ id: p.id, externalId: p.externalPageId, name: p.name, selected: p.subscribed }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface AdConnectionView {
  /** capture_accounts id — what Disconnect acts on. */
  id: string;
  displayName: string;
  accounts: AdAccountView[];
}

/**
 * Ad accounts grouped under the Facebook login that produced them.
 *
 * The grouping exists so the UI can offer Disconnect. Unticking an ad account only
 * excludes it from the report; removing the CONNECTION is a different action on a
 * different object, and a screen that offers only the first leaves no way to undo the
 * second.
 */
export async function listMyAdConnections(): Promise<AdConnectionView[]> {
  const [accounts, pages] = await Promise.all([listMyAccounts("meta_ads"), listMyPages("meta_ads")]);

  const byAccount = new Map<string, AdAccountView[]>();
  for (const p of pages) {
    const list = byAccount.get(p.accountId) ?? [];
    list.push({ id: p.id, externalId: p.externalPageId, name: p.name, selected: p.subscribed });
    byAccount.set(p.accountId, list);
  }

  return accounts.map((a) => ({
    id: a.id,
    displayName: a.displayName,
    accounts: (byAccount.get(a.id) ?? []).sort((x, y) => x.name.localeCompare(y.name)),
  }));
}

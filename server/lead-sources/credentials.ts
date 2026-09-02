import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { connectedPages } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { monitoring } from "@/lib/monitoring";
import type { AdPlatformCredentials } from "@/lib/leadads";

export interface ConnectedPageSummary {
  id: string;
  externalPageId: string;
  name: string;
  scopes: string | null;
  expiresAt: Date | null;
  connectedAt: Date;
}

/**
 * The Facebook Page this agency acts for.
 *
 * Database first, environment second. The env fallback is not legacy baggage: it is
 * what keeps the webhook working while somebody is mid-way through connecting, and it
 * is the escape hatch if the encryption key is ever lost — set the two variables and
 * the system runs while the connection is rebuilt.
 *
 * Returns null rather than throwing. Every caller has a sensible thing to do with
 * "not connected", and a webhook that throws here would tell Meta to retry a lead it
 * can never accept.
 */
export async function getMetaCredentials(): Promise<AdPlatformCredentials | null> {
  const [row] = await db
    .select()
    .from(connectedPages)
    .where(
      and(
        eq(connectedPages.provider, "meta"),
        eq(connectedPages.active, true),
        isNull(connectedPages.deletedAt),
      ),
    )
    .orderBy(desc(connectedPages.createdAt))
    .limit(1);

  if (row) {
    try {
      return { accountId: row.externalPageId, token: await decryptSecret(row.accessToken) };
    } catch (err) {
      /*
       * A stored token we cannot decrypt means the encryption key changed or the row
       * was written before one was set. Falling through to the environment is the
       * right move — it keeps leads arriving — but it must be loud, because otherwise
       * the connected page silently stops being the thing in use.
       */
      monitoring.captureException(err, { where: "getMetaCredentials:decrypt", pageId: row.externalPageId });
    }
  }

  const pageId = process.env.META_PAGE_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  return pageId && token ? { accountId: pageId, token } : null;
}

/** What the UI shows. Never includes the token, encrypted or otherwise. */
export async function getConnectedMetaPage(): Promise<ConnectedPageSummary | null> {
  const [row] = await db
    .select({
      id: connectedPages.id,
      externalPageId: connectedPages.externalPageId,
      name: connectedPages.name,
      scopes: connectedPages.scopes,
      expiresAt: connectedPages.expiresAt,
      connectedAt: connectedPages.createdAt,
    })
    .from(connectedPages)
    .where(
      and(
        eq(connectedPages.provider, "meta"),
        eq(connectedPages.active, true),
        isNull(connectedPages.deletedAt),
      ),
    )
    .orderBy(desc(connectedPages.createdAt))
    .limit(1);
  return row ?? null;
}

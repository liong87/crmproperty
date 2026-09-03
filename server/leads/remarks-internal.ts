/**
 * Remark writes that the SYSTEM performs, not a person.
 *
 * WHY THIS FILE EXISTS, AND WHY IT MUST NOT GAIN A "use server" DIRECTIVE:
 *
 * In Next.js, every exported function in a `"use server"` module becomes a callable
 * RPC endpoint as soon as any Client Component imports anything from that module.
 * Not just the export the component imported — every export in the file. Two client
 * components import `addRemark` from `./remarks`, so everything alongside it in that
 * file is reachable from a browser by anyone with a session.
 *
 * `addSystemRemark` takes a lead id and a status and writes both, with no ownership
 * check, because it is only ever called from server code that has already done one.
 * Living in the actions module made it an unauthenticated endpoint that could set any
 * lead's status to any string and plant a forged entry in an audit trail the product
 * describes as append-only. It is moved here, with no directive, so it is a plain
 * function that only server code can reach.
 *
 * The rule for this codebase: a helper that skips authorization because its caller
 * has already done it belongs in a module with no `"use server"` directive.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leadRemarks, leads } from "@/lib/db/schema";
import { monitoring } from "@/lib/monitoring";

/**
 * A remark written by the system rather than a person.
 *
 * Rendered in the same thread, dimmer and without an author. Crucially it does NOT
 * touch the follow-up counters: an automated note is not somebody ringing a client,
 * and letting it count would make the rate flatter and useless.
 *
 * CALLER MUST HAVE AUTHORIZED THE WRITE. There is no check here.
 */
export async function addSystemRemark(
  leadId: string,
  body: string,
  status?: string,
): Promise<void> {
  try {
    await db.insert(leadRemarks).values({
      leadId,
      userId: null,
      body,
      status: status ?? null,
      kind: "system",
    });
    if (status) await db.update(leads).set({ status }).where(eq(leads.id, leadId));
  } catch (err) {
    monitoring.captureException(err, { where: "addSystemRemark", leadId });
  }
}

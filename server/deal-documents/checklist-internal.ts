import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dealDocuments, documentRequirements } from "@/lib/db/schema";
import { monitoring } from "@/lib/monitoring";

/**
 * Building a new deal's paperwork checklist from its pipeline template.
 *
 * NO "use server" DIRECTIVE HERE, DELIBERATELY. In Next.js every export of a
 * "use server" module becomes a browser-callable endpoint once any Client Component
 * imports from that module — and components/deal-documents/checklist.tsx imports from
 * ./actions. This function takes a deal id and writes to it with no ownership check,
 * because its only caller (createDeal) has already authorized the deal. Sitting in the
 * actions module made it an unauthenticated write: anyone with a session could inject a
 * full checklist into a deal they cannot see.
 *
 * Called from createDeal. Never throws into the caller: a deal that exists without its
 * checklist is recoverable (the items can be added), whereas failing the whole creation
 * because a template row was malformed is not what anybody wants at that moment.
 *
 * CALLER MUST HAVE AUTHORIZED THE DEAL. There is no check here.
 */
export async function instantiateChecklist(dealId: string, pipeline: string): Promise<void> {
  try {
    // Idempotent. A second call would silently double every line, and a checklist
    // showing "Loan approval letter" twice is one nobody trusts or finishes.
    const [existing] = await db
      .select({ id: dealDocuments.id })
      .from(dealDocuments)
      .where(and(eq(dealDocuments.dealId, dealId), isNull(dealDocuments.deletedAt)))
      .limit(1);
    if (existing) return;

    const template = await db
      .select()
      .from(documentRequirements)
      .where(and(eq(documentRequirements.pipeline, pipeline), isNull(documentRequirements.deletedAt)));
    if (template.length === 0) return;

    const now = Date.now();
    await db.insert(dealDocuments).values(
      template.map((t) => ({
        dealId,
        requirementId: t.id,
        label: t.label,
        required: t.required,
        sortOrder: t.sortOrder,
        // A suggested date only. The one that matters — a loan approval's expiry — is
        // printed on the letter and gets typed in when it arrives.
        dueAt: t.dueAfterDays != null ? new Date(now + t.dueAfterDays * 86_400_000) : null,
        // The terms that EXPLAIN the deadline travel with it. A line reading "Loan
        // Approval Letter, due in 60 days" is an instruction without a reason; the
        // reason (the reservation is cancelled and RM1,000 refunded less RM150) lives
        // on the template and is what makes an agent act on the date rather than move
        // it. Copied rather than joined, so a deal whose terms differ can be corrected
        // without editing the template every other agency deal inherits.
        notes: t.notes,
      })),
    );
  } catch (err) {
    monitoring.captureException(err, { where: "instantiateChecklist", dealId, pipeline });
  }
}

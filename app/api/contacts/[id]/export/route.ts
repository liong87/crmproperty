import { NextResponse } from "next/server";
import { requireDbUser } from "@/lib/auth";
import { monitoring } from "@/lib/monitoring";
import { collectContactData } from "@/server/pdpa/service";

export const dynamic = "force-dynamic";

/** GET /api/contacts/[id]/export — full JSON export of a contact's data (PDPA). Admin only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // requireDbUser (not getCurrentDbUser) so deactivated and soft-deleted admins are
  // rejected. This endpoint returns a complete PII bundle, so it must be the
  // strictest check in the codebase, not the loosest.
  let me;
  try {
    me = await requireDbUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (me.role !== "admin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const data = await collectContactData(id);
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: me.email,
    ...data,
  };

  // Durable audit trail: bulk PII leaving the system should never be silent.
  monitoring.captureMessage("PDPA contact export", { contactId: id, by: me.id });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="contact-${id}.json"`,
    },
  });
}

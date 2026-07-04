import { NextResponse } from "next/server";
import { getCurrentDbUser } from "@/lib/auth";
import { collectContactData } from "@/server/pdpa/service";

/** GET /api/contacts/[id]/export — full JSON export of a contact's data (PDPA). Admin only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentDbUser();
  if (!me) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await params;
  const data = await collectContactData(id);
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: me.email,
    ...data,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="contact-${id}.json"`,
    },
  });
}

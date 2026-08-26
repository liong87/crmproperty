import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentDbUser, canView, canEdit } from "@/lib/auth";
import { getDealDetail, listChecklist } from "@/server/deal-documents/queries";
import { listStages } from "@/server/deals/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DealChecklist } from "@/components/deal-documents/checklist";
import { formatMYR, formatBp } from "@/lib/utils";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const { id } = await params;

  const found = await getDealDetail(id);
  if (!found) notFound();
  const { deal, contactName, contactPhone, projectName, propertyTitle } = found;
  if (!canView(me, deal.assignedTo)) redirect("/pipeline");

  const editable = canEdit(me, deal.assignedTo);
  const pipeline = deal.dealType === "project" ? "project" : "resale";
  const [checklist, stages] = await Promise.all([listChecklist(id), listStages(pipeline)]);
  const stage = stages.find((s) => s.id === deal.stageId);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/pipeline" className="text-sm text-muted-foreground hover:underline">
          ← Pipeline
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{contactName}</h1>
          <Badge variant="outline">{deal.dealType === "project" ? "new launch" : deal.dealType}</Badge>
          {stage && <Badge>{stage.name}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {projectName ?? propertyTitle ?? "No project or listing attached"}
          {contactPhone ? ` · ${contactPhone}` : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Paperwork</CardTitle>
        </CardHeader>
        <CardContent>
          <DealChecklist dealId={deal.id} items={checklist} canEdit={editable} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Deal</CardTitle></CardHeader>
        <CardContent className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Detail label="Value" value={formatMYR(deal.value)} />
          <Detail label="Commission" value={formatBp(deal.commissionPct)} />
          <Detail
            label="Expected close"
            value={
              deal.expectedCloseDate
                ? new Intl.DateTimeFormat("en-MY", {
                    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur",
                  }).format(deal.expectedCloseDate)
                : "—"
            }
          />
          <Detail label="Client" value={contactName} />
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

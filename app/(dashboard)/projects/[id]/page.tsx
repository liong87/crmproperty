import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { getProjectWithUnitTypes, listProjectPool } from "@/server/projects/queries";
import { listAssignableAgents } from "@/server/leads/queries";
import { PoolManager } from "@/components/projects/pool-manager";
import { listAppointmentsForProject } from "@/server/appointments/queries";
import { AppointmentList } from "@/components/appointments/appointment-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBp } from "@/lib/utils";
import { projectStatusTone } from "@/lib/status";
import { UnitTypeManager } from "@/components/projects/unit-type-manager";
import { SalesKit } from "@/components/project-resources/sales-kit";
import { listSalesKit } from "@/server/project-resources/queries";
import { ProjectStatusControl } from "@/components/projects/status-control";
import { DeleteProjectButton } from "@/components/projects/delete-button";

const MY_DATE = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const fmtDate = (d: Date | null) => (d ? MY_DATE.format(d) : "—");

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const { id } = await params;
  const found = await getProjectWithUnitTypes(id);
  if (!found) notFound();
  const { project, unitTypes } = found;
  const canEdit = isTeamLeadOrAbove(me);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight">{project.name}</h1>
            <Badge className={projectStatusTone(project.status)}>{project.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {project.developer ? `${project.developer} · ` : ""}{project.area}, {project.state}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <ProjectStatusControl projectId={project.id} status={project.status} />
            <Link href={`/projects/${project.id}/edit`}><Button size="sm" variant="outline">Edit</Button></Link>
            <DeleteProjectButton projectId={project.id} name={project.name} />
          </div>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Unit types</CardTitle></CardHeader>
        <CardContent>
          <UnitTypeManager projectId={project.id} unitTypes={unitTypes} canEdit={canEdit} />
        </CardContent>
      </Card>

      {/*
        Everyone sees the kit; only team leads and admins can change it. This is the
        agency publishing DOWN to its agents — the mirror of the deal checklist, which
        is a buyer's paperwork coming UP into one deal.
      */}
      <Card>
        <CardHeader><CardTitle>Sales kit</CardTitle></CardHeader>
        <CardContent>
          <SalesKit
            projectId={project.id}
            groups={await listSalesKit(project.id)}
            canPublish={canEdit}
          />
        </CardContent>
      </Card>

      {/*
        Team leads and admins only. Who is on a project's rotation, and in what order,
        is a staffing decision — and gating the card here means an agent is never
        sent the membership at all, rather than being shown it without the buttons.
      */}
      {canEdit && (
        <Card>
          <CardHeader><CardTitle>Lead pool</CardTitle></CardHeader>
          <CardContent>
            <PoolManager
              projectId={project.id}
              pool={await listProjectPool(project.id)}
              agents={await listAssignableAgents()}
              canEdit={canEdit}
              passOnAfterDays={project.passOnAfterDays}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Appointments</CardTitle></CardHeader>
        <CardContent>
          <AppointmentList
            items={await listAppointmentsForProject(me, project.id)}
            empty="No appointments booked at this gallery."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Detail label="Property type" value={project.propertyType ?? "—"} />
          <Detail label="Tenure" value={project.tenure ?? "—"} />
          <Detail label="Title type" value={project.titleType ?? "—"} />
          <Detail label="Total units" value={project.totalUnits != null ? String(project.totalUnits) : "—"} />
          <Detail label="Launch" value={fmtDate(project.launchAt)} />
          <Detail label="Expected VP" value={fmtDate(project.expectedVpAt)} />
          <Detail label="Bumi quota" value={project.bumiQuotaPct != null ? `${project.bumiQuotaPct}%` : "—"} />
          <Detail label="Bumi discount" value={formatBp(project.bumiDiscountBp)} />
          <Detail label="Developer commission" value={formatBp(project.developerCommissionBp)} />
          <Detail label="Address" value={project.address ?? "—"} />
          <Detail label="Sales gallery" value={project.galleryAddress ?? "—"} />
        </CardContent>
      </Card>

      {(project.rebatePackage || project.notes) && (
        <Card>
          <CardHeader><CardTitle>Package &amp; notes</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {project.rebatePackage && (
              <div>
                <p className="text-xs text-muted-foreground">Rebate package</p>
                <p className="whitespace-pre-wrap">{project.rebatePackage}</p>
              </div>
            )}
            {project.notes && (
              <div>
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap">{project.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
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

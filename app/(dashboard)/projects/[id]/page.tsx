import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentDbUser, isManagerOrAbove } from "@/lib/auth";
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
  const canEdit = isManagerOrAbove(me);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{project.name}</h1>
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
            <DeleteProjectButton projectId={project.id} />
          </div>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Unit types</CardTitle></CardHeader>
        <CardContent>
          <UnitTypeManager projectId={project.id} unitTypes={unitTypes} canEdit={canEdit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Lead pool</CardTitle></CardHeader>
        <CardContent>
          <PoolManager
            projectId={project.id}
            pool={await listProjectPool(project.id)}
            agents={canEdit ? await listAssignableAgents() : []}
            canEdit={canEdit}
            passOnAfterDays={project.passOnAfterDays}
          />
        </CardContent>
      </Card>

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

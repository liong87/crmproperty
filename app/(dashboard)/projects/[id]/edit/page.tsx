import { notFound, redirect } from "next/navigation";
import { getCurrentDbUser, isManagerOrAbove } from "@/lib/auth";
import { getProjectById } from "@/server/projects/queries";
import { ProjectForm, type ProjectFormValues } from "@/components/projects/project-form";
import { bpToPercent } from "@/lib/utils";

/** An instant back to the "YYYY-MM-DD" a date input expects, in Malaysia time. */
function isoToDateInput(d: Date | null): string {
  if (!d) return "";
  const my = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return my.toISOString().slice(0, 10);
}

const bpToPct = (bp: number | null) => { const p = bpToPercent(bp); return p == null ? "" : String(p); };
const numToStr = (n: number | null) => (n == null ? "" : String(n));

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const { id } = await params;
  if (!isManagerOrAbove(me)) redirect(`/projects/${id}`);

  const project = await getProjectById(id);
  if (!project) notFound();

  const defaults: Partial<ProjectFormValues> = {
    name: project.name,
    developer: project.developer ?? "",
    propertyType: project.propertyType ?? "",
    state: project.state,
    area: project.area,
    address: project.address ?? "",
    galleryAddress: project.galleryAddress ?? "",
    tenure: project.tenure ?? "",
    titleType: project.titleType ?? "",
    launchDate: isoToDateInput(project.launchAt),
    expectedVpDate: isoToDateInput(project.expectedVpAt),
    totalUnits: numToStr(project.totalUnits),
    bumiQuotaPct: numToStr(project.bumiQuotaPct),
    bumiDiscountPct: bpToPct(project.bumiDiscountBp),
    rebatePackage: project.rebatePackage ?? "",
    developerCommissionPct: bpToPct(project.developerCommissionBp),
    passOnAfterDays: numToStr(project.passOnAfterDays),
    status: project.status,
    notes: project.notes ?? "",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Edit Project</h1>
      <ProjectForm mode="edit" projectId={project.id} defaults={defaults} />
    </div>
  );
}

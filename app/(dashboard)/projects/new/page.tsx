import { redirect } from "next/navigation";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { ProjectForm } from "@/components/projects/project-form";

export default async function NewProjectPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  // Projects are agency inventory, not an agent's listing. Team leads and admins only.
  if (!isTeamLeadOrAbove(me)) redirect("/projects");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">New project</h1>
      <ProjectForm mode="create" />
    </div>
  );
}

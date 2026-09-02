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
      <h1 className="text-xl font-semibold">New Project</h1>
      <ProjectForm mode="create" />
    </div>
  );
}

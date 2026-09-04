import { redirect } from "next/navigation";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { CsvImport } from "@/components/leads/csv-import";

export default async function ImportLeadsPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  // Only team leads and admins may spread an import across the team. The server
  // enforces this too — this just decides whether the option is shown.
  const canDistribute = isTeamLeadOrAbove(me);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Import leads</h1>
        <p className="text-sm text-muted-foreground">Bulk-add leads from a CSV file. Duplicates are merged by phone or email.</p>
      </div>
      <CsvImport canDistribute={canDistribute} />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getCurrentDbUser, isManagerOrAbove } from "@/lib/auth";
import { CsvImport } from "@/components/leads/csv-import";

export default async function ImportLeadsPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  // Only managers and admins may spread an import across the team. The server
  // enforces this too — this just decides whether the option is shown.
  const canDistribute = isManagerOrAbove(me);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Import leads</h1>
        <p className="text-sm text-muted-foreground">Bulk-add leads from a CSV file. Duplicates are merged by phone or email.</p>
      </div>
      <CsvImport canDistribute={canDistribute} />
    </div>
  );
}

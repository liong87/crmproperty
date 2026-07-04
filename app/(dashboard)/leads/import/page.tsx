import { redirect } from "next/navigation";
import { getCurrentDbUser } from "@/lib/auth";
import { CsvImport } from "@/components/leads/csv-import";

export default async function ImportLeadsPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Import leads</h1>
        <p className="text-sm text-muted-foreground">Bulk-add leads from a CSV file. Duplicates are merged by phone or email.</p>
      </div>
      <CsvImport />
    </div>
  );
}

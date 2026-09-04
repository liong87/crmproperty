"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { changeProjectStatus } from "@/server/projects/actions";
import { PROJECT_STATUS } from "@/lib/constants";
import { Select } from "@/components/ui/select";
import { FormAlert } from "@/components/ui/alert";

export function ProjectStatusControl({ projectId, status }: { projectId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onChange(next: string) {
    if (next === status) return;
    setError(null);
    start(async () => {
      const res = await changeProjectStatus(projectId, next as (typeof PROJECT_STATUS)[number]);
      if (!res.success) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div>
      <Select aria-label="Project status" className="h-9 w-40" value={status} disabled={pending} onChange={(e) => onChange(e.target.value)}>
        {PROJECT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      {error && <FormAlert className="mt-1">{error}</FormAlert>}
    </div>
  );
}

"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { changePropertyStatus } from "@/server/properties/actions";
import { PROPERTY_STATUS } from "@/lib/constants";
import { Select } from "@/components/ui/select";

export function StatusControl({ propertyId, status }: { propertyId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onChange(next: string) {
    if (next === status) return;
    setError(null);
    start(async () => {
      const res = await changePropertyStatus(propertyId, next as (typeof PROPERTY_STATUS)[number]);
      if (!res.success) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div>
      <Select className="h-9 w-40" value={status} disabled={pending} onChange={(e) => onChange(e.target.value)}>
        {PROPERTY_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

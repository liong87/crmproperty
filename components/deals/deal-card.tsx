"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { moveDealStage } from "@/server/deals/actions";
import { Select } from "@/components/ui/select";
import { formatMYR } from "@/lib/utils";

export interface DealCardData {
  id: string;
  contactId: string;
  contactName: string;
  propertyTitle: string | null;
  value: number | null;
  stageId: string;
}

export function DealCard({ card, stages }: { card: DealCardData; stages: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onMove(stageId: string) {
    if (stageId === card.stageId) return;
    setError(null);
    start(async () => {
      const res = await moveDealStage(card.id, stageId);
      if (!res.success) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border bg-background p-3 text-sm shadow-sm">
      <Link href={`/contacts/${card.contactId}`} className="font-medium hover:underline">{card.contactName}</Link>
      <div className="text-muted-foreground">{card.propertyTitle ?? "No property"}</div>
      <div className="mt-1 font-medium">{formatMYR(card.value)}</div>
      <Select
        className="mt-2 h-9"
        value={card.stageId}
        disabled={pending}
        onChange={(e) => onMove(e.target.value)}
        aria-label="Move stage"
      >
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { moveDealStage } from "@/server/deals/actions";
import { Select } from "@/components/ui/select";
import { FormAlert } from "@/components/ui/alert";
import { formatMYR } from "@/lib/utils";

export interface DealCardData {
  id: string;
  contactId: string;
  contactName: string;
  subjectTitle: string | null;
  value: number | null;
  stageId: string;
}

/**
 * One deal on the board.
 *
 * Every control here names its record. A board of twelve cards offered twelve controls
 * called "Move stage" and twelve links called "Paperwork": identical accessible names,
 * so anyone listing the page's controls got a wall of duplicates with nothing to tell
 * them apart.
 */
export function DealCard({
  card, stages, stageName,
}: {
  card: DealCardData;
  stages: { id: string; name: string }[];
  /** The column this card is in, so the control can say where the deal is now. */
  stageName?: string;
}) {
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
      {/* The client and the deal are different destinations — one is the person, the
          other is the record of the sale. Both are wanted from a card, so both are
          offered, and both say whose. */}
      <Link href={`/contacts/${card.contactId}`} className="font-medium hover:underline">
        {card.contactName}
      </Link>
      <div className="text-muted-foreground">{card.subjectTitle ?? "No listing or project"}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="font-medium">{formatMYR(card.value)}</span>
        <Link href={`/deals/${card.id}`} className="text-xs text-primary underline underline-offset-2">
          Deal
          <span className="sr-only"> for {card.contactName}</span>
        </Link>
      </div>
      <Select
        className="mt-2 h-9"
        value={card.stageId}
        disabled={pending}
        onChange={(e) => onMove(e.target.value)}
        aria-label={`Stage for ${card.contactName}'s deal`}
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {/* The selected option describes where the deal IS; the rest describe where
                it would go. A list where every option reads the same as the column
                heading gives no clue that choosing one moves anything. */}
            {s.id === card.stageId ? (stageName ?? s.name) : `Move to ${s.name}`}
          </option>
        ))}
      </Select>
      {error && <FormAlert className="mt-2 px-2 py-1.5 text-xs">{error}</FormAlert>}
    </div>
  );
}

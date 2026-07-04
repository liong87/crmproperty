"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { createDeal } from "@/server/deals/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateDealButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [valueRM, setValueRM] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await createDeal({
        contactId,
        value: valueRM ? Math.round(Number(valueRM) * 100) : null,
      });
      if (!res.success) return setError(res.error);
      router.push("/pipeline");
      router.refresh();
    });
  }

  if (!open) return <Button onClick={() => setOpen(true)}>Create Deal</Button>;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1.5">
        <Label htmlFor="dealValue">Deal value (RM)</Label>
        <Input id="dealValue" type="number" min="0" value={valueRM} onChange={(e) => setValueRM(e.target.value)} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>{pending ? "Creating…" : "Create"}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

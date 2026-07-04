"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { sendWhatsAppAndLog } from "@/server/activities/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function WhatsAppButton({
  entityType, entityId, toPhone, defaultMessage,
}: {
  entityType: string; entityId: string; toPhone: string; defaultMessage?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [msg, setMsg] = React.useState(defaultMessage ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}>WhatsApp</Button>;

  function send() {
    setError(null);
    start(async () => {
      const res = await sendWhatsAppAndLog({ entityType, entityId, toPhone, message: msg });
      if (!res.success) return setError(res.error);
      window.open(res.data.url, "_blank", "noopener");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message…" />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={send} disabled={pending || !msg}>{pending ? "Opening…" : "Open WhatsApp"}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

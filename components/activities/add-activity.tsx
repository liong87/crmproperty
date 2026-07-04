"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { logActivity } from "@/server/activities/actions";
import { ACTIVITY_TYPE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AddActivity({ entityType, entityId }: { entityType: string; entityId: string }) {
  const router = useRouter();
  const [type, setType] = React.useState<string>("note");
  const [body, setBody] = React.useState("");
  const [followUp, setFollowUp] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await logActivity({
        entityType,
        entityId,
        type,
        body: body || null,
        followUpAt: followUp ? new Date(followUp).toISOString() : null,
      });
      if (!res.success) return setError(res.error);
      setBody(""); setFollowUp(""); setType("note");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="actType">Type</Label>
          <Select id="actType" value={type} onChange={(e) => setType(e.target.value)}>
            {ACTIVITY_TYPE.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="followUp">Follow-up reminder (optional)</Label>
          <Input id="followUp" type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="actBody">Notes</Label>
        <Textarea id="actBody" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened?" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={submit} disabled={pending || (!body && !followUp)}>{pending ? "Logging…" : "Log activity"}</Button>
    </div>
  );
}

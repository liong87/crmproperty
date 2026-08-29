"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { createDeal } from "@/server/deals/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/**
 * Create a deal against a contact.
 *
 * The project picker is what decides which PIPELINE the deal joins: choose one and it
 * is a project deal starting at Booked; leave it blank and it is a resale deal starting
 * at New. Without this the button could only ever produce resale deals, so a booked
 * developer unit landed in the resale pipeline and the funnel and the pipeline
 * disagreed about the same sale.
 *
 * It is pre-selected from the originating lead's project, because by the time somebody
 * is a contact with a deal, which launch they came in on is already known — asking
 * again invites a wrong answer.
 */
export function CreateDealButton({
  contactId,
  projects,
  defaultProjectId,
}: {
  contactId: string;
  projects: { id: string; name: string }[];
  defaultProjectId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [valueRM, setValueRM] = React.useState("");
  const [projectId, setProjectId] = React.useState(defaultProjectId ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await createDeal({
        contactId,
        projectId: projectId || null,
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
        <Label htmlFor="dealProject">Project</Label>
        <Select id="dealProject" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Resale or rental — no project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <p className="text-xs text-muted-foreground">
          {projectId
            ? "New launch deal. Starts at Booked."
            : "Resale deal. Starts at New."}
        </p>
      </div>
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

"use client";
import * as React from "react";
import { hardDeleteContact } from "@/server/pdpa/actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

/** Admin-only PDPA controls: export JSON + right-to-erasure hard delete. */
export function PdpaPanel({ contactId }: { contactId: string }) {
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function onDelete() {
    setError(null);
    start(async () => {
      const res = await hardDeleteContact(contactId);
      // On success the action redirects; only failures return here.
      if (res && !res.success) setError(res.error);
    });
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader><CardTitle className="text-destructive">PDPA — Personal Data</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <a href={`/api/contacts/${contactId}/export`} className="underline" target="_blank" rel="noopener">
            Export all data (JSON)
          </a>
        </div>
        <div className="space-y-2 rounded-md border border-destructive/40 p-3">
          <p className="text-muted-foreground">
            Erasure permanently deletes this contact, its originating lead, deals, activities, documents,
            and message logs — overriding soft delete. This cannot be undone.
          </p>
          <p>Type <span className="font-mono font-semibold">DELETE</span> to confirm:</p>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-10 w-40 rounded-md border border-input bg-background px-3 text-sm"
          />
          {error && <p className="text-destructive">{error}</p>}
          <div>
            <Button variant="destructive" disabled={pending || confirm !== "DELETE"} onClick={onDelete}>
              {pending ? "Deleting…" : "Permanently delete"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

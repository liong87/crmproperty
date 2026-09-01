"use client";
/**
 * A project's sales kit, as an agent sees it.
 *
 * Read-only for agents by design — this replaces a shared spreadsheet of Drive links,
 * and the value of replacing it is that there is exactly one current price list.
 * Managers and admins get the publishing controls inline rather than on a separate
 * admin screen, because the person who notices the price list is out of date is the
 * person looking at it.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  addResource, removeResource, getResourceFileUrl,
  createResourceUploadUrl, confirmResourceUpload,
} from "@/server/project-resources/actions";
import { CATEGORY_TITLES, RESOURCE_CATEGORIES, type ResourceCategory } from "@/lib/sales-kit";
import type { KitGroup } from "@/server/project-resources/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SalesKit({
  projectId, groups, canPublish,
}: {
  projectId: string;
  groups: KitGroup[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const [adding, setAdding] = React.useState(false);
  const [category, setCategory] = React.useState<ResourceCategory>("price-list");
  const [label, setLabel] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [value, setValue] = React.useState("");

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  /**
   * Upload straight to object storage, then tell the server what landed.
   *
   * The file never passes through the server: a brochure is tens of megabytes and a
   * Worker gets 10 ms of CPU on the free plan, which is not enough to relay one.
   */
  async function uploadDirect(itemId: string, file: File): Promise<{ success: boolean; error?: string }> {
    if (!file.type) {
      return { success: false, error: "Your browser did not report a type for that file. Rename it with a proper extension and try again." };
    }

    const started = await createResourceUploadUrl({
      id: itemId, filename: file.name, contentType: file.type, size: file.size,
    });
    if (!started.success) return started;

    const put = await fetch(started.data.url, {
      method: "PUT",
      body: file,
      // Must match the type signed into the URL, or storage refuses the write.
      headers: { "Content-Type": file.type },
    });
    if (!put.ok) {
      return {
        success: false,
        error: `Storage rejected the upload (${put.status}). If this is the first one, check the bucket's CORS rule allows PUT from this origin.`,
      };
    }

    return confirmResourceUpload({
      id: itemId, key: started.data.key, filename: file.name, contentType: file.type, size: file.size,
    });
  }

  async function openFile(id: string) {
    setError(null);
    const res = await getResourceFileUrl(id);
    if (!res.success) return setError(res.error);
    window.open(res.data.url, "_blank", "noopener,noreferrer");
  }

  const isEmpty = groups.length === 0;

  return (
    <div className="space-y-4">
      {isEmpty && (
        <p className="text-sm text-muted-foreground">
          Nothing published yet.{" "}
          {canPublish
            ? "Add the price list, brochure and blank forms so agents stop asking for them."
            : "Your manager has not published the kit for this project yet."}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.category} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </h3>
          <ul className="space-y-2">
            {group.items.map((item) => (
              <li key={item.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{item.label}</p>

                    {item.filename && (
                      <button
                        type="button"
                        onClick={() => openFile(item.id)}
                        className="mt-0.5 text-xs text-primary underline underline-offset-2"
                      >
                        {item.filename}
                      </button>
                    )}

                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block break-all text-xs text-primary underline underline-offset-2"
                      >
                        {item.url}
                      </a>
                    )}

                    {item.value && <p className="mt-0.5 text-xs">{item.value}</p>}

                    {item.notes && (
                      <p className="mt-1 max-w-prose text-xs text-muted-foreground">{item.notes}</p>
                    )}

                    {!item.filename && !item.url && !item.value && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Nothing attached yet.
                      </p>
                    )}
                  </div>

                  {canPublish && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="cursor-pointer text-xs text-primary underline underline-offset-2">
                        {item.filename ? "Replace file" : "Attach file"}
                        <input
                          type="file"
                          className="hidden"
                          disabled={pending}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            run(() => uploadDirect(item.id, f));
                          }}
                        />
                      </label>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(() => removeResource(item.id))}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {canPublish && !adding && (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          Add an item
        </Button>
      )}

      {canPublish && adding && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Section</Label>
              <select
                className="h-9 w-52 rounded-md border border-input bg-background px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value as ResourceCategory)}
              >
                {RESOURCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_TITLES[c]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                className="h-9 w-60"
                placeholder="P1 Selling Price List"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Link (optional)</Label>
              <Input
                className="h-9 w-72"
                placeholder="https://maps.app.goo.gl/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Or a value (optional)</Label>
              <Input
                className="h-9 w-60"
                placeholder="HDA a/c 5141 2200 1234"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            A link, a value, or neither — add the item, then attach a file to it.
          </p>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={pending || !label.trim()}
              onClick={() =>
                run(async () => {
                  const res = await addResource({
                    projectId,
                    category,
                    label,
                    url: url.trim() || null,
                    value: value.trim() || null,
                  });
                  if (res.success) {
                    setLabel(""); setUrl(""); setValue(""); setAdding(false);
                  }
                  return res;
                })
              }
            >
              Add
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setAdding(false); setError(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

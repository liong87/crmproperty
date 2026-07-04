"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { uploadPropertyImage, deletePropertyImage, type PropertyImage } from "@/server/properties/images";
import { Button } from "@/components/ui/button";

export function ImageManager({
  propertyId,
  images,
  canEdit,
}: {
  propertyId: string;
  images: PropertyImage[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("propertyId", propertyId);
    fd.set("file", file);
    start(async () => {
      const res = await uploadPropertyImage(fd);
      if (!res.success) setError(res.error);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  function onDelete(id: string) {
    setError(null);
    start(async () => {
      const res = await deletePropertyImage(id);
      if (!res.success) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((img) => (
          <div key={img.id} className="group relative overflow-hidden rounded-md border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={img.filename} className="h-32 w-full object-cover" />
            {canEdit && (
              <button
                type="button"
                onClick={() => onDelete(img.id)}
                disabled={pending}
                className="absolute right-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-xs text-destructive shadow"
              >
                Delete
              </button>
            )}
          </div>
        ))}
        {images.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No images yet.</p>}
      </div>

      {canEdit && (
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFile}
            disabled={pending}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-2 file:text-sm"
          />
          {pending && <p className="text-xs text-muted-foreground">Uploading…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">JPEG, PNG or WebP · max 8 MB.</p>
        </div>
      )}
    </div>
  );
}

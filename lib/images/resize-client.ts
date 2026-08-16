/**
 * Downscale a photograph in the browser before uploading it.
 *
 * Why in the browser rather than on the server: the app runs on Cloudflare Workers,
 * where `sharp` (a native Node module) is unavailable. But client-side is the better
 * place regardless — it shrinks the *upload*, which is the part an agent standing in
 * a condo lobby on 4G actually waits for. A 4 MB photograph becomes roughly 300 KB
 * before it leaves the phone, so the upload is over ten times faster and the storage
 * saving comes free with it.
 *
 * Always falls back to the original file. A photograph that uploads at full size is a
 * minor cost; a photograph an agent cannot upload at all is a real one.
 */

/** Longest edge, in pixels. Comfortably more than any listing page displays. */
const MAX_EDGE = 1600;
/** WebP quality. 0.82 is the point where compression artefacts stop being visible. */
const QUALITY = 0.82;
/** Below this, resizing is not worth the risk of touching the file. */
const SKIP_BELOW_BYTES = 400 * 1024;

export interface ResizeOutcome {
  file: File;
  /** False when the original was returned unchanged. */
  resized: boolean;
  originalBytes: number;
  finalBytes: number;
}

function canResize(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof createImageBitmap === "function" &&
    typeof document !== "undefined"
  );
}

function swapExtension(name: string, ext: string): string {
  return name.replace(/\.[^.]+$/, "") + ext;
}

/**
 * Resize `file` if it is worth resizing.
 *
 * Returns the original untouched when: the browser lacks the APIs, the file is
 * already small, it is not an image, or anything at all goes wrong.
 */
export async function resizeImageForUpload(file: File): Promise<ResizeOutcome> {
  const unchanged: ResizeOutcome = {
    file,
    resized: false,
    originalBytes: file.size,
    finalBytes: file.size,
  };

  if (!canResize()) return unchanged;
  if (!file.type.startsWith("image/")) return unchanged;
  if (file.size <= SKIP_BELOW_BYTES) return unchanged;

  try {
    // `from-image` applies the EXIF orientation flag. Without it, photographs taken
    // in portrait on a phone arrive rotated 90 degrees — the camera records the
    // rotation as metadata rather than rotating the pixels.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return unchanged;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY),
    );
    if (!blob) return unchanged;

    // Re-encoding can occasionally produce a LARGER file — an already-optimised
    // image, or a screenshot with flat colour that PNG handles better. Keep whichever
    // is smaller rather than assuming the new one wins.
    if (blob.size >= file.size) return unchanged;

    const resizedFile = new File([blob], swapExtension(file.name, ".webp"), {
      type: "image/webp",
      lastModified: Date.now(),
    });

    return {
      file: resizedFile,
      resized: true,
      originalBytes: file.size,
      finalBytes: resizedFile.size,
    };
  } catch {
    // Corrupt file, exotic format, out of memory on an old phone — upload the
    // original and let the server's own validation decide.
    return unchanged;
  }
}

/** "4.2 MB → 310 KB" for the upload progress line. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

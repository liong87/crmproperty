"use client";

import { Printer } from "lucide-react";

/**
 * Print / Save as PDF.
 *
 * `window.print()` and a real print stylesheet, rather than a PDF library. The
 * browser's own "Save as PDF" is what people reach for anyway, it produces selectable
 * text at full resolution, and it costs nothing to run on a Worker.
 *
 * Specifically NOT jsPDF + html2canvas, which screenshots the DOM into a raster: text
 * stops being selectable, it prints blurry, and the file is several megabytes. It looks
 * like the easy option and gives the worst result of the three.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground print:hidden"
    >
      <Printer className="h-3.5 w-3.5" aria-hidden />
      Print / Save as PDF
    </button>
  );
}

import { FieldMapDialog } from "./field-map-dialog";
import type { LeadFormSourceRow } from "@/server/lead-sources/queries";
import { Badge } from "@/components/ui/badge";

/**
 * The Facebook forms we know about, each with its project and its field mapping.
 *
 * Separate from the general mapping table because these are the ones that can be
 * inspected against the live form — the other providers have no equivalent.
 */
export function MetaFormList({ sources }: { sources: LeadFormSourceRow[] }) {
  if (sources.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No Facebook forms yet. Import the ones on your Page, or create a new one.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {sources.map((s) => (
        <li key={s.id} className="p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{s.label}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{s.externalFormId}</span>
                {s.projectName
                  ? <Badge variant="secondary">{s.projectName}</Badge>
                  : <Badge variant="outline">No project</Badge>}
                {!s.active && <Badge variant="outline">Paused</Badge>}
              </p>
            </div>
            <FieldMapDialog sourceId={s.id} label={s.label} current={s.fieldMap ?? null} />
          </div>
        </li>
      ))}
    </ul>
  );
}

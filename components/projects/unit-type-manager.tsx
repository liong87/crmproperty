"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { createUnitType, updateUnitType, deleteUnitType } from "@/server/projects/actions";
import type { ProjectUnitType } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMYR, pricePerSqft } from "@/lib/utils";

interface Draft {
  label: string; builtUpSqft: string; bedrooms: string; bathrooms: string; carParks: string;
  listPriceRM: string; nettPriceRM: string; totalUnits: string;
}

const emptyDraft: Draft = {
  label: "", builtUpSqft: "", bedrooms: "", bathrooms: "", carParks: "",
  listPriceRM: "", nettPriceRM: "", totalUnits: "",
};

const num = (s: string) => (s === "" ? null : Number(s));
const rmToCents = (s: string) => (s === "" ? null : Math.round(Number(s) * 100));
const centsToRM = (c: number | null) => (c == null ? "" : String(c / 100));
const str = (n: number | null) => (n == null ? "" : String(n));

/** Fill a draft from a saved row, so editing starts from what is actually stored. */
const draftFrom = (u: ProjectUnitType): Draft => ({
  label: u.label,
  builtUpSqft: str(u.builtUpSqft),
  bedrooms: str(u.bedrooms),
  bathrooms: str(u.bathrooms),
  carParks: str(u.carParks),
  listPriceRM: centsToRM(u.listPrice),
  nettPriceRM: centsToRM(u.nettPrice),
  totalUnits: str(u.totalUnits),
});

/**
 * Unit types for a project. This is the level the agency actually quotes at —
 * "Type B, 1,050 sqft, from RM 620k" — and what a lead's budget is matched against.
 * The specific unit is recorded on the booking, not here.
 *
 * Every field is editable after creation. Developers revise layouts, sizes and
 * price lists between phases; a type that could only be deleted and retyped would
 * lose its id, and with it any lead or booking pointing at it.
 */
export function UnitTypeManager({
  projectId, unitTypes, canEdit,
}: {
  projectId: string;
  unitTypes: ProjectUnitType[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function set<K extends keyof Draft>(k: K, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  /** Shared by add and edit — the same two fields are mandatory either way. */
  function invalid(d: Draft): string | null {
    if (!d.label.trim()) return "A label is required, e.g. Type A.";
    if (d.listPriceRM === "") return "A list price is required.";
    return null;
  }

  function startAdd() {
    setError(null);
    setEditingId(null);
    setDraft(emptyDraft);
    setAdding(true);
  }

  function startEdit(u: ProjectUnitType) {
    setError(null);
    setAdding(false);
    setDraft(draftFrom(u));
    setEditingId(u.id);
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setDraft(emptyDraft);
    setError(null);
  }

  function onAdd() {
    const problem = invalid(draft);
    setError(problem);
    if (problem) return;
    start(async () => {
      const res = await createUnitType({
        projectId,
        label: draft.label.trim(),
        builtUpSqft: num(draft.builtUpSqft),
        bedrooms: num(draft.bedrooms),
        bathrooms: num(draft.bathrooms),
        carParks: num(draft.carParks),
        listPrice: rmToCents(draft.listPriceRM),
        nettPrice: rmToCents(draft.nettPriceRM),
        totalUnits: num(draft.totalUnits),
        sortOrder: unitTypes.length,
      });
      if (!res.success) return setError(res.error);
      cancel();
      router.refresh();
    });
  }

  function onSave(id: string) {
    const problem = invalid(draft);
    setError(problem);
    if (problem) return;
    start(async () => {
      // Every field is sent, including nulls — a cleared box means "remove this",
      // not "leave it alone". Omitting a key is what keeps the stored value.
      const res = await updateUnitType({
        id,
        label: draft.label.trim(),
        builtUpSqft: num(draft.builtUpSqft),
        bedrooms: num(draft.bedrooms),
        bathrooms: num(draft.bathrooms),
        carParks: num(draft.carParks),
        listPrice: rmToCents(draft.listPriceRM),
        nettPrice: rmToCents(draft.nettPriceRM),
        totalUnits: num(draft.totalUnits),
      });
      if (!res.success) return setError(res.error);
      cancel();
      router.refresh();
    });
  }

  function onRemove(id: string) {
    setError(null);
    start(async () => {
      const res = await deleteUnitType(id);
      if (!res.success) return setError(res.error);
      if (editingId === id) cancel();
      router.refresh();
    });
  }

  const fields = (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <DraftField label="Label"><Input placeholder="Type A" value={draft.label} onChange={(e) => set("label", e.target.value)} /></DraftField>
        <DraftField label="Built-up (sqft)"><Input type="number" min="0" value={draft.builtUpSqft} onChange={(e) => set("builtUpSqft", e.target.value)} /></DraftField>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <DraftField label="Bedrooms"><Input type="number" min="0" value={draft.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} /></DraftField>
        <DraftField label="Bathrooms"><Input type="number" min="0" value={draft.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} /></DraftField>
        <DraftField label="Car parks"><Input type="number" min="0" value={draft.carParks} onChange={(e) => set("carParks", e.target.value)} /></DraftField>
        <DraftField label="Units of this type"><Input type="number" min="0" value={draft.totalUnits} onChange={(e) => set("totalUnits", e.target.value)} /></DraftField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <DraftField label="List price (RM)"><Input type="number" min="0" value={draft.listPriceRM} onChange={(e) => set("listPriceRM", e.target.value)} /></DraftField>
        <DraftField label="Nett price after rebate (RM)"><Input type="number" min="0" value={draft.nettPriceRM} onChange={(e) => set("nettPriceRM", e.target.value)} /></DraftField>
      </div>
    </>
  );

  return (
    <div className="space-y-3">
      {unitTypes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No unit types yet. Add the types the developer is selling — that is what agents quote from.
        </p>
      )}

      <div className="space-y-2">
        {unitTypes.map((u) => (
          <div key={u.id} className="rounded-lg border p-3">
            {editingId === u.id ? (
              <div className="space-y-3">
                {fields}
                <div className="flex gap-2">
                  <Button size="sm" disabled={pending} onClick={() => onSave(u.id)}>{pending ? "Saving…" : "Save"}</Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={cancel}>Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{u.label}</div>
                    <div className="text-sm text-muted-foreground">
                      {u.builtUpSqft ?? "—"} sqft · {u.bedrooms ?? "—"} bd · {u.bathrooms ?? "—"} ba
                      {u.carParks != null && ` · ${u.carParks} parking`}
                      {u.totalUnits != null && ` · ${u.totalUnits} units`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold">{formatMYR(u.nettPrice ?? u.listPrice)}</div>
                    {u.nettPrice != null && u.nettPrice !== u.listPrice && (
                      <div className="text-xs text-muted-foreground line-through">{formatMYR(u.listPrice)}</div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {pricePerSqft(u.nettPrice ?? u.listPrice, u.builtUpSqft)} / sqft
                    </div>
                  </div>
                </div>
                {canEdit && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => startEdit(u)}>Edit</Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => onRemove(u.id)}>Remove</Button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {canEdit && !adding && editingId === null && (
        <Button size="sm" variant="outline" onClick={startAdd}>Add unit type</Button>
      )}

      {canEdit && adding && (
        <div className="space-y-3 rounded-lg border border-dashed p-3">
          {fields}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={onAdd}>{pending ? "Adding…" : "Add"}</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={cancel}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DraftField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

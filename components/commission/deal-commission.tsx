"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  createDealCommission, updateCommissionStage, deleteDealCommission,
} from "@/server/commission/actions";
import type { DealCommissionFull } from "@/server/commission/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatMYR, formatBp } from "@/lib/utils";

const dateValue = (d: Date | string | null) =>
  d ? new Date(d).toISOString().slice(0, 10) : "";

/**
 * A deal's commission: what it is worth, when it is released, and who it is split with.
 *
 * The figures are read-only once built. They are a SNAPSHOT of the scheme, and quietly
 * editable amounts on a commission statement is how disputes start — to change them you
 * remove the commission and rebuild it, which is deliberate friction.
 *
 * The dates ARE editable, because invoicing and payment happen on their own schedule
 * and that is the whole point of tracking them.
 */
export function DealCommissionPanel({
  dealId, data, schemes, dealValue, canEdit,
}: {
  dealId: string;
  data: DealCommissionFull | null;
  schemes: { id: string; name: string; isDefault: boolean }[];
  dealValue: number | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [schemeId, setSchemeId] = React.useState(
    schemes.find((s) => s.isDefault)?.id ?? schemes[0]?.id ?? "",
  );
  const [baseRM, setBaseRM] = React.useState(dealValue ? String(dealValue / 100) : "");

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  if (!data) {
    if (!canEdit) {
      return <p className="text-sm text-muted-foreground">No commission recorded.</p>;
    }
    if (schemes.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          No commission scheme configured yet. A manager can create one under
          Settings → Commission.
        </p>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          No commission on this deal yet. Build one from a scheme — the rates are copied
          onto the deal, so changing the scheme later will not alter it.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Scheme</Label>
            <Select className="h-9 w-52" value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
              {schemes.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.isDefault ? " (default)" : ""}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sale price (RM)</Label>
            <Input
              className="h-9 w-40"
              type="number"
              min="0"
              value={baseRM}
              onChange={(e) => setBaseRM(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            disabled={pending || !schemeId}
            onClick={() =>
              run(() =>
                createDealCommission({
                  dealId,
                  schemeId,
                  baseAmount: baseRM ? Math.round(Number(baseRM) * 100) : undefined,
                }),
              )
            }
          >
            {pending ? "Calculating…" : "Calculate commission"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  const { commission, stages, splits } = data;
  const received = stages.filter((s) => s.receivedAt).reduce((a, s) => a + s.amount, 0);
  const invoiced = stages
    .filter((s) => s.invoicedAt && !s.receivedAt)
    .reduce((a, s) => a + s.amount, 0);
  const outstanding = commission.grossAmount - received;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Gross commission" value={formatMYR(commission.grossAmount)} strong />
        <Figure label="Received" value={formatMYR(received)} />
        <Figure label="Invoiced, unpaid" value={formatMYR(invoiced)} />
        <Figure label="Outstanding" value={formatMYR(outstanding)} />
      </div>

      <p className="text-xs text-muted-foreground">
        {formatMYR(commission.baseAmount)} × {formatBp(commission.developerBp)} ·
        scheme “{commission.schemeName}”
        {commission.schemeId === null && " (since deleted)"}
      </p>

      <div>
        <h3 className="mb-1.5 text-sm font-semibold">Release stages</h3>
        <Table>
          <THead>
            <TR><TH>Stage</TH><TH>Share</TH><TH>Amount</TH><TH>Expected</TH><TH>Invoiced</TH><TH>Received</TH></TR>
          </THead>
          <TBody>
            {stages.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.label}</TD>
                <TD className="text-muted-foreground tnum">{formatBp(s.releaseBp)}</TD>
                <TD className="tnum">{formatMYR(s.amount)}</TD>
                <TD>
                  <DateCell
                    value={s.expectedAt}
                    disabled={!canEdit || pending}
                    onChange={(v) => run(() => updateCommissionStage({ id: s.id, expectedAt: v }))}
                  />
                </TD>
                <TD>
                  <DateCell
                    value={s.invoicedAt}
                    disabled={!canEdit || pending}
                    onChange={(v) => run(() => updateCommissionStage({ id: s.id, invoicedAt: v }))}
                  />
                </TD>
                <TD>
                  <DateCell
                    value={s.receivedAt}
                    disabled={!canEdit || pending}
                    onChange={(v) => run(() => updateCommissionStage({ id: s.id, receivedAt: v }))}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <div>
        <h3 className="mb-1.5 text-sm font-semibold">Split</h3>
        <Table>
          <THead>
            <TR><TH>Party</TH><TH>Who</TH><TH>Share</TH><TH>Amount</TH></TR>
          </THead>
          <TBody>
            {splits.map((s) => (
              <TR key={s.id}>
                <TD><Badge variant="outline">{s.party}</Badge></TD>
                <TD className="font-medium">{s.label}</TD>
                <TD className="text-muted-foreground tnum">{formatBp(s.shareBp)}</TD>
                <TD className="tnum">{formatMYR(s.amount)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {canEdit && (
        <div className="flex items-center gap-2 border-t pt-3">
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => deleteDealCommission(dealId))}
          >
            Remove and rebuild
          </Button>
          <span className="text-xs text-muted-foreground">
            Use this if the price or the split was wrong. The figures cannot be edited in
            place on purpose.
          </span>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 tnum ${strong ? "text-lg font-semibold" : "text-base"}`}>{value}</div>
    </div>
  );
}

function DateCell({
  value, disabled, onChange,
}: {
  value: Date | string | null;
  disabled: boolean;
  onChange: (v: string | null) => void;
}) {
  return (
    <Input
      className="h-8 w-36"
      type="date"
      defaultValue={dateValue(value)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}

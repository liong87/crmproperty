import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className="[&_tr]:border-b" {...p} />;
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className="[&_tr:last-child]:border-0" {...p} />;
// className is merged rather than spread over: TH and TD already do this, and a
// caller passing one here would otherwise silently drop the row borders.
export const TR = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("border-b transition-colors hover:bg-muted/50", className)} {...p} />
);
export const TH = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("h-10 px-3 text-left align-middle font-medium text-muted-foreground", className)} {...p} />
);
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("p-3 align-middle", className)} {...p} />
);

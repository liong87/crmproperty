import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon, title, hint, action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <p className="font-medium">{title}</p>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

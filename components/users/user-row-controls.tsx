"use client";
import * as React from "react";
import { setUserRole, setUserActive } from "@/server/users/actions";
import { USER_ROLE } from "@/lib/constants";
import { Button } from "@/components/ui/button";

type Role = (typeof USER_ROLE)[number];

export function UserRowControls({
  userId,
  role,
  active,
  disabled,
}: {
  userId: string;
  role: Role;
  active: boolean;
  disabled?: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [localRole, setLocalRole] = React.useState<Role>(role);
  const [localActive, setLocalActive] = React.useState(active);

  function onRoleChange(next: Role) {
    setError(null);
    setLocalRole(next);
    startTransition(async () => {
      const res = await setUserRole({ userId, role: next });
      if (!res.success) {
        setError(res.error);
        setLocalRole(role); // revert
      }
    });
  }

  function onToggleActive() {
    setError(null);
    const next = !localActive;
    setLocalActive(next);
    startTransition(async () => {
      const res = await setUserActive({ userId, active: next });
      if (!res.success) {
        setError(res.error);
        setLocalActive(!next); // revert
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={localRole}
        disabled={disabled || pending}
        onChange={(e) => onRoleChange(e.target.value as Role)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
        aria-label="Role"
      >
        {USER_ROLE.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        variant={localActive ? "outline" : "secondary"}
        disabled={disabled || pending}
        onClick={onToggleActive}
      >
        {localActive ? "Deactivate" : "Activate"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

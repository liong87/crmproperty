import { redirect } from "next/navigation";
import { getCurrentDbUser, isAdmin, isManagerOrAbove } from "@/lib/auth";
import { listUsers } from "@/server/users/actions";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserRowControls } from "@/components/users/user-row-controls";
import { USER_ROLE } from "@/lib/constants";

type Role = (typeof USER_ROLE)[number];

export default async function UsersPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  if (!isManagerOrAbove(me)) redirect("/dashboard"); // agents can't see user management

  const res = await listUsers({ pageSize: 100 });
  const users = res.success ? res.data.items : [];
  const canManage = isAdmin(me);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">
          {canManage ? "Manage roles and access for your team." : "Read-only view. Ask an admin to change roles."}
        </p>
      </div>

      {!res.success && <p className="text-sm text-destructive">{res.error}</p>}

      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Email</TH>
            <TH>Status</TH>
            <TH>{canManage ? "Manage" : "Role"}</TH>
          </TR>
        </THead>
        <TBody>
          {users.map((u) => (
            <TR key={u.id}>
              <TD className="font-medium">{u.name}</TD>
              <TD className="text-muted-foreground">{u.email}</TD>
              <TD>
                <Badge variant={u.active ? "secondary" : "outline"}>{u.active ? "active" : "inactive"}</Badge>
              </TD>
              <TD>
                {canManage ? (
                  <UserRowControls
                    userId={u.id}
                    role={u.role as Role}
                    active={u.active}
                    disabled={u.id === me.id}
                  />
                ) : (
                  <Badge>{u.role}</Badge>
                )}
              </TD>
            </TR>
          ))}
          {users.length === 0 && (
            <TR>
              <TD colSpan={4} className="text-center text-muted-foreground">No users yet.</TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}

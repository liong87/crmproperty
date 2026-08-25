import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { getCurrentDbUser } from "@/lib/auth";
import { listGroupedAppointments, listAppointmentBoard } from "@/server/appointments/queries";
import { AppointmentList } from "@/components/appointments/appointment-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; project?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const sp = await searchParams;
  // The board is the default: it answers "what is stuck?", which is the question a
  // manager opens this page to ask. The diary answers "what is next?".
  const view = sp.view === "schedule" ? "schedule" : "board";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Appointments</h1>
          <p className="text-sm text-muted-foreground">
            {view === "board" ? "Every appointment by stage." : "Your diary, soonest first."}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          <ViewTab href="/appointments" label="Board" active={view === "board"} />
          <ViewTab href="/appointments?view=schedule" label="Schedule" active={view === "schedule"} />
        </div>
      </div>

      {view === "board" ? (
        <BoardView me={me} projectId={sp.project} />
      ) : (
        <ScheduleView me={me} />
      )}
    </div>
  );
}

function ViewTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

async function BoardView({
  me, projectId,
}: {
  me: NonNullable<Awaited<ReturnType<typeof getCurrentDbUser>>>;
  projectId?: string;
}) {
  const board = await listAppointmentBoard(me, { projectId });
  const total = board.columns.reduce((s, c) => s + c.items.length, 0);

  if (total === 0 && !projectId) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No appointments yet"
        hint="Book one from a lead or a contact and it will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          No-show rate <span className="font-semibold text-foreground tabular-nums">{pct(board.noShowRate)}</span>
        </span>
        {board.projectFilters.length > 0 && (
          <div className="flex flex-wrap gap-1 text-sm">
            <FilterChip href="/appointments" label="All" active={!projectId} />
            {board.projectFilters.map((p) => (
              <FilterChip
                key={p.id}
                href={`/appointments?project=${p.id}`}
                label={p.name}
                active={projectId === p.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Mobile-first: columns scroll horizontally, matching /pipeline. */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {board.columns.map((col) => (
          <div key={col.key} className="w-80 shrink-0 rounded-lg bg-muted/40 p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-medium">{col.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{col.items.length}</span>
            </div>
            {col.items.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                Empty
              </div>
            ) : (
              <AppointmentList items={col.items} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary",
      )}
    >
      {label}
    </Link>
  );
}

async function ScheduleView({
  me,
}: {
  me: NonNullable<Awaited<ReturnType<typeof getCurrentDbUser>>>;
}) {
  const g = await listGroupedAppointments(me);
  const total = g.overdue.length + g.today.length + g.tomorrow.length + g.upcoming.length;

  if (total === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No appointments scheduled"
        hint="Book one from a lead or a contact and it will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {g.overdue.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Needs writing up</CardTitle></CardHeader>
          <CardContent><AppointmentList items={g.overdue} /></CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Today</CardTitle></CardHeader>
        <CardContent><AppointmentList items={g.today} empty="Nothing else today." /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Tomorrow</CardTitle></CardHeader>
        <CardContent><AppointmentList items={g.tomorrow} empty="Nothing tomorrow." /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Later</CardTitle></CardHeader>
        <CardContent><AppointmentList items={g.upcoming} empty="Nothing further ahead." /></CardContent>
      </Card>
    </div>
  );
}

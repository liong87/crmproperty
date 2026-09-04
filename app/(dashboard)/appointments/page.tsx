import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { getCurrentDbUser } from "@/lib/auth";
import { listGroupedAppointments, listAppointmentBoard } from "@/server/appointments/queries";
import { AppointmentList } from "@/components/appointments/appointment-list";
import { AppointmentBoard } from "@/components/appointments/appointment-board";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { Segmented } from "@/components/ui/segmented";
import { QueueSearch } from "@/components/leads/queue-search";
import { getFollowUpRate } from "@/server/leads/working";
import { Suspense } from "react";
import { cn } from "@/lib/utils";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; project?: string; q?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const sp = await searchParams;
  // The board is the default: it answers "what is stuck?", which is the question a
  // manager opens this page to ask. The diary answers "what is next?".
  const view =
    sp.view === "schedule" ? "schedule"
    : sp.view === "completed" ? "completed"
    : "ongoing";
  const search = sp.q?.trim() || undefined;

  const [counts, rate] = await Promise.all([
    listAppointmentBoard(me, { search }).then((b) => ({
      ongoing: b.ongoingCount, completed: b.completedCount,
    })),
    getFollowUpRate(me, 7),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Appointments"
        count={counts.ongoing}
        actions={
          <div className="rounded-2xl border border-gray-100 bg-card px-4 py-2.5 dark:border-gray-800">
            {/* text-muted-foreground, not gray-400: a 4px-tall uppercase label at
                2.8:1 on the card was the least legible text in the app. */}
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Followed up · {rate.days} days
            </p>
            <p className="mt-0.5 text-sm">
              <span className="text-lg font-bold tabular-nums text-primary">
                {rate.pct == null ? "—" : `${Math.round(rate.pct * 100)}%`}
              </span>{" "}
              <span className="tabular-nums text-muted-foreground">
                {rate.followed}/{rate.total} touched
              </span>
            </p>
          </div>
        }
      >
        ongoing {counts.ongoing === 1 ? "appointment" : "appointments"} waiting to be closed.
      </PageTitle>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          items={[
            { href: "/appointments", label: "Ongoing", count: counts.ongoing, active: view === "ongoing" },
            { href: "/appointments?view=completed", label: "Completed", count: counts.completed, active: view === "completed" },
            { href: "/appointments?view=schedule", label: "Schedule", active: view === "schedule" },
          ]}
        />
        {view !== "schedule" && (
          <Suspense fallback={<div className="h-10 min-w-[15rem] flex-1" />}>
            <QueueSearch placeholder="Search name, phone, product, remarks…" />
          </Suspense>
        )}
      </div>

      {view === "schedule"
        ? <ScheduleView me={me} />
        : <BoardView me={me} projectId={sp.project} view={view} search={search} />}
    </div>
  );
}


async function BoardView({
  me, projectId, view, search,
}: {
  me: NonNullable<Awaited<ReturnType<typeof getCurrentDbUser>>>;
  projectId?: string;
  view: "ongoing" | "completed";
  search?: string;
}) {
  const board = await listAppointmentBoard(me, { projectId, view, search });
  const total = board.columns.reduce((s, c) => s + c.items.length, 0);

  if (total === 0 && !projectId) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No appointments yet"
        /* "Schedule", not "book", everywhere in this area. Booked already means
           something else here — it is the funnel stage for a client who has booked a
           UNIT — so using it for the diary would make the two impossible to tell apart. */
        hint="Schedule one from a lead or a contact and it will appear here."
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
      <AppointmentBoard columns={board.columns} meId={me.id} />
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
        hint="Schedule one from a lead or a contact and it will appear here."
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

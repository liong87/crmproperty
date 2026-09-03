/**
 * The skeleton every dashboard page falls back to while its data loads.
 *
 * There was no loading.tsx anywhere in the app. The dashboard awaits eight queries in
 * one Promise.all before rendering a single pixel, and the inbox fetches two hundred
 * follow-ups — so on 4G between viewings, tapping a nav item produced a page that sat
 * there looking identical to the one you left. Agents read that as a dropped tap and
 * tap again, which is how you get double-submits.
 *
 * Deliberately generic rather than per-page: a rough shape that appears instantly beats
 * an exact shape that needs maintaining on nine screens, and the only job here is to
 * say "something is happening".
 */
function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} />;
}

export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      {/* Screen readers get words; everyone else gets the shapes below. */}
      <span className="sr-only">Loading…</span>

      <div className="space-y-2">
        <Bar className="h-7 w-48" />
        <Bar className="h-4 w-64" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Bar key={i} className="h-24" />
        ))}
      </div>

      <Bar className="h-56" />

      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Bar key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}

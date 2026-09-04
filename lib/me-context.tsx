"use client";
import * as React from "react";

/**
 * The signed-in user's id, available to any Client Component under the dashboard shell.
 *
 * WHY A CONTEXT RATHER THAN A PROP:
 *
 * Marking your own name with "(You)" is needed on the leads table, both appointment
 * views, the reports breakdowns and anywhere else a colleague's name can appear. Those
 * components are reached from a dozen pages, several of them nested — `AppointmentList`
 * alone is rendered from five. Threading `meId` through every one of those call sites
 * would mean editing pages that have nothing else to do with this, and any page whose
 * author forgot the prop would silently stop marking your name, which is worse than not
 * having the feature: the reader would trust the absence of "(You)" and be wrong.
 *
 * The id is not a secret — it is the viewer's own — and it is already in the layout,
 * which every dashboard page passes through.
 *
 * `useMeId` returns null outside the provider rather than throwing, so a component
 * rendered in a test or a stray route degrades to plain names instead of a blank page.
 */
const MeContext = React.createContext<string | null>(null);

export function MeProvider({ id, children }: { id: string; children: React.ReactNode }) {
  return <MeContext.Provider value={id}>{children}</MeContext.Provider>;
}

export function useMeId(): string | null {
  return React.useContext(MeContext);
}

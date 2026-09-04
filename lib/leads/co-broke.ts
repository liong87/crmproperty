/**
 * Who is the setter and who is the closer on a new appointment.
 *
 * Pulled out of `scheduleAppointment` as a pure function because it is the one piece
 * of the internal co-broke that is easy to get subtly wrong and impossible to notice:
 * the two ids it picks decide who gets paid, and every wrong answer still produces a
 * perfectly valid-looking appointment.
 *
 * The rule:
 *
 *   - Normally the owner is the setter and there is no closer. That is how every
 *     appointment in this system worked before hand-offs existed, and it must keep
 *     working that way for the overwhelming majority of leads.
 *   - On a lead a colleague HANDED OVER, the agent who sourced it is the setter and
 *     the agent working it now is the closer — the pair `deal_commission_splits`
 *     already pays out on.
 *   - A closer named on the form always wins. A hand-off describes how the lead
 *     arrived; it does not decide who is presenting on the day.
 */
export interface Split {
  setterId: string;
  closerId: string | null;
}

export function resolveSplit(args: {
  /** `leads.setter_id` — set only when the lead was handed over. */
  sourcedBy: string | null;
  /** The agent working the client now. */
  owner: string | null;
  /** A closer chosen explicitly on the booking form, already validated. */
  explicitCloser: string | null;
  /** Whoever is booking, as the last resort for an unowned client. */
  fallback: string;
}): Split {
  const { sourcedBy, owner, explicitCloser, fallback } = args;

  const setterId = sourcedBy ?? owner ?? fallback;

  // Only a genuine hand-off implies a closer: `sourcedBy === owner` would mean the
  // lead came back to the person who sourced it, and crediting them as both halves of
  // a split is a way to pay one person twice for one deal.
  const impliedCloser = sourcedBy && owner && owner !== sourcedBy ? owner : null;

  return { setterId, closerId: explicitCloser ?? impliedCloser };
}

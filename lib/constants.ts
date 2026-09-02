// All user-facing strings live here for future i18n (BM / 中文).
export const APP_NAME = "PropertyAgent CRM";

/**
 * Lead status — a CALL OUTCOME, not a lifecycle stage.
 *
 * "Contacted" told you somebody had touched the lead and nothing about what happened.
 * "No pick up" and "call another time" are different problems needing different next
 * actions, and an agent knows which one applies the moment they hang up.
 *
 * Every status carries a STAGE GROUP, and every query keys off the group rather than
 * the name. That separation is what makes this list safe to edit later: the six places
 * that ask "is this lead dead, skip it" — the pass-on rotation, the stale-chase sweep,
 * intake dedupe, duplicate detection and property matching — would otherwise each need
 * to know all nine names, and would silently start including dead leads the first time
 * somebody added a tenth.
 */
export const LEAD_STAGE_GROUP = ["new", "working", "appointment", "closed", "dead"] as const;
export type LeadStageGroup = (typeof LEAD_STAGE_GROUP)[number];

export const LEAD_STATUS_META = [
  { value: "new", label: "New", group: "new" },
  { value: "no-pick-up", label: "No Pick Up", group: "working" },
  { value: "not-reachable", label: "Not Reachable", group: "working" },
  { value: "follow-up", label: "Follow Up", group: "working" },
  { value: "call-another-time", label: "Call Another Time", group: "working" },
  { value: "appointment", label: "Appointment", group: "appointment" },
  { value: "closed", label: "Closed", group: "closed" },
  { value: "not-searching", label: "Not Searching", group: "dead" },
  { value: "unmatched-req", label: "Unmatched Requirement", group: "dead" },
  { value: "blocked", label: "Blocked", group: "dead" },
] as const satisfies ReadonlyArray<{ value: string; label: string; group: LeadStageGroup }>;

export const LEAD_STATUS = LEAD_STATUS_META.map((s) => s.value) as unknown as readonly [
  "new", "no-pick-up", "not-reachable", "follow-up", "call-another-time",
  "appointment", "closed", "not-searching", "unmatched-req", "blocked",
];

const GROUP_OF = new Map<string, LeadStageGroup>(
  LEAD_STATUS_META.map((s) => [s.value, s.group]),
);

export const statusGroup = (status: string): LeadStageGroup => GROUP_OF.get(status) ?? "new";
export const statusLabel = (status: string): string =>
  LEAD_STATUS_META.find((s) => s.value === status)?.label ?? status;

const byGroup = (...groups: LeadStageGroup[]): string[] =>
  LEAD_STATUS_META.filter((s) => groups.includes(s.group)).map((s) => s.value);

/** Still worth working: nobody has given up and nothing is booked or won. */
export const OPEN_STATUSES = byGroup("new", "working");
/** Everything an agent should still see in a queue — open, plus booked. */
export const ACTIVE_STATUSES = byGroup("new", "working", "appointment");
/**
 * Finished with, one way or another. Every "skip this lead" query uses THIS, so adding
 * a tenth status can never quietly reopen a dead lead to the chase list.
 */
export const DEAD_STATUSES = byGroup("dead");
export const isDeadStatus = (status: string): boolean => statusGroup(status) === "dead";
export const INTEREST = ["buy", "rent", "sell", "invest"] as const;
export const LEAD_SOURCE = ["api", "webhook", "manual", "import"] as const;
export const USER_ROLE = ["admin", "team_lead", "agent"] as const;
export const LISTING_TYPE = ["sale", "rent"] as const;
export const PROPERTY_TYPE = [
  "condo", "serviced-apartment", "terrace", "semi-d", "bungalow", "land", "shop", "office",
] as const;
export const TENURE = ["freehold", "leasehold"] as const;
export const TITLE_TYPE = ["individual", "strata", "master"] as const;
export const FURNISHING = ["unfurnished", "partial", "full"] as const;
export const PROPERTY_STATUS = ["active", "pending", "sold", "rented", "withdrawn"] as const;
// "viewing" is retained for rows written before appointments existed.
export const ACTIVITY_TYPE = ["call", "email", "viewing", "appointment", "note", "whatsapp"] as const;
export const ENTITY_TYPE = ["leads", "contacts", "deals", "properties"] as const;

// Appointments. These live here rather than in server/appointments/actions.ts because
// a "use server" module may only export async functions — exporting a const array from
// one breaks the page that imports it, at runtime rather than at build.
//
// The vocabulary is project sales, and it is the same vocabulary for a resale viewing:
// somebody either turned up or they did not, and either booked or did not.
// "showed-up" replaced "completed" and "booked" replaced "offer-made" in migration 0006.
export const APPOINTMENT_STATUS = ["scheduled", "showed-up", "no-show", "cancelled"] as const;
export const APPOINTMENT_OUTCOME = ["booked", "interested", "not-interested", "undecided"] as const;

export const DEFAULT_PAGE_SIZE = 25;

export const UI_STRINGS = {
  qualifyLead: "Qualify",
  newLead: "New Lead",
  saveError: "Something went wrong. Please try again.",
} as const;

export const MALAYSIAN_STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
  "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor",
  "Terengganu", "Kuala Lumpur", "Labuan", "Putrajaya",
] as const;

/* ---------- new launch / project sales ---------- */
// upcoming = not open for booking yet; open = selling; closing = last units;
// closed = fully sold or the agency's appointment with the developer has ended.
export const PROJECT_STATUS = ["upcoming", "open", "closing", "closed"] as const;

/**
 * Deal pipelines. A project deal begins where the appointment board ends — at the
 * booking — so the two never count the same event twice.
 */
export const DEAL_PIPELINE = ["project", "resale"] as const;
export const DEAL_TYPE = ["project", "resale", "rental"] as const;

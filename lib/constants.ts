// All user-facing strings live here for future i18n (BM / 中文).
export const APP_NAME = "PropertyAgent CRM";

export const LEAD_STATUS = ["new", "contacted", "qualified", "disqualified"] as const;
export const INTEREST = ["buy", "rent", "sell", "invest"] as const;
export const LEAD_SOURCE = ["api", "webhook", "manual", "import"] as const;
export const USER_ROLE = ["admin", "manager", "agent"] as const;
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

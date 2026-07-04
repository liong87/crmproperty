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
export const ACTIVITY_TYPE = ["call", "email", "viewing", "note", "whatsapp"] as const;
export const ENTITY_TYPE = ["leads", "contacts", "deals", "properties"] as const;

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

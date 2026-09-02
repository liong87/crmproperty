/**
 * Drizzle schema — single source of truth for the database.
 *
 * Rules (see prompt_crm_v2.md):
 *  - All PKs: UUID v4 (gen_random_uuid()).
 *  - All timestamps: timestamptz in UTC.
 *  - Every table: created_at, updated_at, deleted_at (soft delete).
 *  - updated_at uses $onUpdate — it does NOT auto-update on its own.
 *  - FKs declared with references() + onDelete.
 *  - Indexes on every FK and commonly queried column.
 *  - Standard PostgreSQL only — no Neon-proprietary features.
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  bigint,
  date,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { LeadFieldMap } from "@/lib/lead-forms/field-map";

/* ---------- shared column helpers ---------- */
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);

/* ---------- users (internal staff) ---------- */
export const users = pgTable(
  "users",
  {
    id: id(),
    externalAuthId: varchar("external_auth_id", { length: 255 }).notNull().unique(), // Clerk user id
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }).notNull().unique(),
    phone: varchar("phone", { length: 20 }), // E.164
    role: varchar("role", { length: 20 }).notNull().default("agent"), // admin | team_lead | agent
    teamId: uuid("team_id"),
    /**
     * Which Team Lead this person reports to. Null for admins and for a Team Lead who
     * reports to nobody.
     *
     * A self-reference rather than a teams table: the agency is one office with a
     * handful of people, and "who is my lead" is the only question anybody asks of the
     * structure. A teams table would add a join and an admin screen to store the same
     * one fact. Depth is not enforced in the schema, but every query walks ONE level —
     * see server/users/hierarchy.ts for why a deep tree is not wanted here.
     */
    teamLeadId: uuid("team_lead_id").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    externalAuthIdx: index("users_external_auth_idx").on(t.externalAuthId),
    teamIdx: index("users_team_idx").on(t.teamId),
    teamLeadIdx: index("users_team_lead_idx").on(t.teamLeadId),
    roleIdx: index("users_role_idx").on(t.role),
  }),
);

/* ---------- leads (raw inquiries) ---------- */
export const leads = pgTable(
  "leads",
  {
    id: id(),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(), // E.164
    email: varchar("email", { length: 320 }),
    source: varchar("source", { length: 20 }).notNull(), // api | webhook | manual | import
    sourceDetail: varchar("source_detail", { length: 255 }), // landing page / form name
    utmSource: varchar("utm_source", { length: 255 }),
    utmMedium: varchar("utm_medium", { length: 255 }),
    utmCampaign: varchar("utm_campaign", { length: 255 }),
    /**
     * The level below campaign, in standard UTM terms so every channel fits:
     *   utmContent = ad set   (Meta adset_name, Google ad group)
     *   utmTerm    = ad       (Meta ad_name, Google creative)
     *
     * Campaign alone cannot answer "which ad set do we pause", which is the decision
     * the spend report exists to inform.
     */
    utmContent: varchar("utm_content", { length: 255 }),
    utmTerm: varchar("utm_term", { length: 255 }),
    referrer: text("referrer"),
    interest: varchar("interest", { length: 20 }), // buy | rent | sell | invest
    budgetMin: bigint("budget_min", { mode: "number" }), // MYR integer cents
    budgetMax: bigint("budget_max", { mode: "number" }),
    preferredAreas: text("preferred_areas"), // comma/JSON list of areas
    /**
     * A CALL OUTCOME. See LEAD_STATUS_META for the list and each one's stage group;
     * every query keys off the group, never off a name.
     * 30 chars because "unmatched-req" and friends do not fit the old 20.
     */
    status: varchar("status", { length: 30 }).notNull().default("new"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    consentGivenAt: timestamp("consent_given_at", { withTimezone: true }),
    consentSource: varchar("consent_source", { length: 255 }),
    convertedToContactId: uuid("converted_to_contact_id"), // FK added in relations to avoid cycle
    /**
     * The new-launch project this enquiry came in for, when it came in for one.
     * Null for resale and general enquiries. This is the top of the project funnel:
     * without it, leads cannot be counted per launch or per campaign.
     * FK declared in migration 0007; `projects` is defined later in this file.
     */
    projectId: uuid("project_id"),
    /**
     * When the CURRENT owner got it. Reset on every reassignment, so the pass-on
     * sweep measures "how long has this person sat on it", not "how old is the lead".
     */
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    /**
     * Denormalised follow-up counters, maintained by the remark thread.
     *
     * Only a MANUAL remark moves these. System entries must not inflate the follow-up
     * rate, or the number stops meaning "somebody spoke to this person" — which is the
     * only thing it is for.
     */
    /**
     * Freeform lead info: the answers a capture form asked that have no column here —
     * "wants a corner lot, viewing weekends only".
     *
     * Deliberately NARROWER than the competitor's single blob. Interest, budget and
     * preferred areas are structured fields on this table precisely so they can be
     * filtered and matched on; this is only for what does not fit them.
     */
    info: text("info"),
    /**
     * How many times this lead has been handed to somebody new.
     *
     * A high count with no progress is the signal that a lead is being passed around
     * rather than worked — which no other field on this table can tell you, because
     * each reassignment overwrites the last.
     */
    recycleCount: integer("recycle_count").notNull().default(0),
    lastFollowUpAt: timestamp("last_follow_up_at", { withTimezone: true }),
    followUpCount: integer("follow_up_count").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    phoneIdx: index("leads_phone_idx").on(t.phone),
    emailIdx: index("leads_email_idx").on(t.email),
    statusIdx: index("leads_status_idx").on(t.status),
    assignedIdx: index("leads_assigned_idx").on(t.assignedTo),
    sourceIdx: index("leads_source_idx").on(t.source),
    convertedIdx: index("leads_converted_idx").on(t.convertedToContactId),
    projectIdx: index("leads_project_idx").on(t.projectId),
    // Every list query is ORDER BY created_at DESC ... WHERE deleted_at IS NULL.
    // A partial index on the live rows serves the filter and the sort together.
    liveCreatedIdx: index("leads_live_created_idx")
      .on(t.createdAt.desc().nullsFirst())
      .where(sql`deleted_at is null`),
  }),
);

/* ---------- contacts (qualified leads) ---------- */
export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    email: varchar("email", { length: 320 }),
    interest: varchar("interest", { length: 20 }),
    budgetMin: bigint("budget_min", { mode: "number" }),
    budgetMax: bigint("budget_max", { mode: "number" }),
    preferredAreas: text("preferred_areas"),
    // SPA-stage fields (optional until needed)
    idType: varchar("id_type", { length: 20 }), // nric | passport | company
    idNumber: varchar("id_number", { length: 100 }),
    nationality: varchar("nationality", { length: 100 }),
    occupation: varchar("occupation", { length: 255 }),
    notes: text("notes"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    // consent carried over from the originating lead
    consentGivenAt: timestamp("consent_given_at", { withTimezone: true }),
    consentSource: varchar("consent_source", { length: 255 }),
    sourceLeadId: uuid("source_lead_id").references(() => leads.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => ({
    phoneIdx: index("contacts_phone_idx").on(t.phone),
    emailIdx: index("contacts_email_idx").on(t.email),
    assignedIdx: index("contacts_assigned_idx").on(t.assignedTo),
    sourceLeadIdx: index("contacts_source_lead_idx").on(t.sourceLeadId),
    liveCreatedIdx: index("contacts_live_created_idx")
      .on(t.createdAt.desc().nullsFirst())
      .where(sql`deleted_at is null`),
  }),
);

/* ---------- properties (listings) ---------- */
export const properties = pgTable(
  "properties",
  {
    id: id(),
    title: varchar("title", { length: 255 }).notNull(),
    listingType: varchar("listing_type", { length: 10 }).notNull(), // sale | rent
    propertyType: varchar("property_type", { length: 30 }).notNull(), // condo | serviced-apartment | terrace | semi-d | bungalow | land | shop | office
    tenure: varchar("tenure", { length: 20 }), // freehold | leasehold
    leaseholdExpiry: integer("leasehold_expiry"), // year, nullable
    bumiLot: boolean("bumi_lot").notNull().default(false),
    titleType: varchar("title_type", { length: 20 }), // individual | strata | master
    state: varchar("state", { length: 100 }).notNull(),
    area: varchar("area", { length: 255 }).notNull(),
    address: text("address"),
    builtUpSqft: integer("built_up_sqft"),
    landSqft: integer("land_sqft"),
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    carParks: integer("car_parks"),
    askingPrice: bigint("asking_price", { mode: "number" }).notNull(), // MYR integer cents
    // price_per_sqft is computed at read time (asking_price / built_up_sqft); not stored to avoid drift
    furnishing: varchar("furnishing", { length: 20 }), // unfurnished | partial | full
    status: varchar("status", { length: 20 }).notNull().default("active"), // active | pending | sold | rented | withdrawn
    ownerName: varchar("owner_name", { length: 255 }),
    ownerPhone: varchar("owner_phone", { length: 20 }),
    assignedAgent: uuid("assigned_agent").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => ({
    statusIdx: index("properties_status_idx").on(t.status),
    stateAreaIdx: index("properties_state_area_idx").on(t.state, t.area),
    listingTypeIdx: index("properties_listing_type_idx").on(t.listingType),
    propertyTypeIdx: index("properties_property_type_idx").on(t.propertyType),
    assignedAgentIdx: index("properties_assigned_agent_idx").on(t.assignedAgent),
    liveCreatedIdx: index("properties_live_created_idx")
      .on(t.createdAt.desc().nullsFirst())
      .where(sql`deleted_at is null`),
  }),
);

/* ---------- deal_stages (editable without deploys) ---------- */
export const dealStages = pgTable(
  "deal_stages",
  {
    id: id(),
    name: varchar("name", { length: 100 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isTerminal: boolean("is_terminal").notNull().default(false),
    // Distinguishes a won terminal stage from a lost one. Reporting must never key
    // off the stage NAME: deal_stages is editable without a deploy, so renaming
    // "Closed Won" silently zeroed every agent's won value with no error anywhere.
    isWon: boolean("is_won").notNull().default(false),
    /**
     * Which mode this stage belongs to: project | resale.
     *
     * A new-launch deal and a resale deal do not pass through the same columns —
     * "Viewing Scheduled" is meaningless on a booked developer unit.
     */
    pipeline: varchar("pipeline", { length: 20 }).notNull().default("resale"),
    ...timestamps,
  },
  (t) => ({
    sortIdx: index("deal_stages_sort_idx").on(t.sortOrder),
    pipelineIdx: index("deal_stages_pipeline_idx").on(t.pipeline, t.sortOrder),
  }),
);

/* ---------- deals (require a contact, never a lead) ---------- */
export const deals = pgTable(
  "deals",
  {
    id: id(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    /**
     * The project, for a new-launch deal. Set alongside `dealType = 'project'`.
     * Unlike appointments this is not exclusive with `propertyId` — a resale deal has
     * a property, a project deal has a project, and neither is required.
     */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    /**
     * project | resale | rental. Chooses the pipeline the deal moves through, and
     * later chooses which commission model applies to it.
     */
    dealType: varchar("deal_type", { length: 20 }).notNull().default("resale"),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => dealStages.id, { onDelete: "restrict" }),
    value: bigint("value", { mode: "number" }), // MYR integer cents
    expectedCloseDate: timestamp("expected_close_date", { withTimezone: true }),
    commissionPct: integer("commission_pct"), // basis points (e.g. 250 = 2.50%) to stay integer
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => ({
    contactIdx: index("deals_contact_idx").on(t.contactId),
    propertyIdx: index("deals_property_idx").on(t.propertyId),
    projectIdx: index("deals_project_idx").on(t.projectId),
    typeIdx: index("deals_type_idx").on(t.dealType),
    stageIdx: index("deals_stage_idx").on(t.stageId),
    assignedIdx: index("deals_assigned_idx").on(t.assignedTo),
  }),
);

/* ---------- activities (polymorphic) ---------- */
export const activities = pgTable(
  "activities",
  {
    id: id(),
    entityType: varchar("entity_type", { length: 20 }).notNull(), // leads | contacts | deals | properties
    entityId: uuid("entity_id").notNull(),
    type: varchar("type", { length: 20 }).notNull(), // call | email | viewing | note | whatsapp
    body: text("body"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    followUpAt: timestamp("follow_up_at", { withTimezone: true }), // drives reminders
    followUpDoneAt: timestamp("follow_up_done_at", { withTimezone: true }), // reminder completed
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => ({
    entityIdx: index("activities_entity_idx").on(t.entityType, t.entityId),
    followUpIdx: index("activities_follow_up_idx").on(t.followUpAt),
    createdByIdx: index("activities_created_by_idx").on(t.createdBy),
    // Timeline: the entity lookup AND the ordering in one index.
    timelineIdx: index("activities_timeline_idx").on(
      t.entityType,
      t.entityId,
      t.occurredAt.desc().nullsFirst(),
    ),
    // Open follow-ups only. The existing follow_up_at index cannot serve the
    // IS NULL test on follow_up_done_at, which every reminders page performs.
    openFollowUpIdx: index("activities_open_follow_up_idx")
      .on(t.followUpAt)
      .where(sql`follow_up_at is not null and follow_up_done_at is null and deleted_at is null`),
  }),
);

/* ---------- documents (files by storage_key, never full URL) ---------- */
export const documents = pgTable(
  "documents",
  {
    id: id(),
    entityType: varchar("entity_type", { length: 20 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    storageKey: text("storage_key").notNull(), // NOT a full/provider URL
    filename: varchar("filename", { length: 512 }).notNull(),
    mimeType: varchar("mime_type", { length: 127 }).notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => ({
    entityIdx: index("documents_entity_idx").on(t.entityType, t.entityId),
    uploadedByIdx: index("documents_uploaded_by_idx").on(t.uploadedBy),
  }),
);

/* ---------- message_log (WhatsApp/email audit) ---------- */
export const messageLog = pgTable(
  "message_log",
  {
    id: id(),
    channel: varchar("channel", { length: 20 }).notNull(), // whatsapp | email
    entityType: varchar("entity_type", { length: 20 }),
    entityId: uuid("entity_id"),
    toAddress: varchar("to_address", { length: 320 }).notNull(), // E.164 or email
    templateId: uuid("template_id"), // FK added below
    body: text("body"),
    status: varchar("status", { length: 20 }).notNull().default("queued"), // queued | sent | delivered | failed
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    sentBy: uuid("sent_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => ({
    entityIdx: index("message_log_entity_idx").on(t.entityType, t.entityId),
    statusIdx: index("message_log_status_idx").on(t.status),
    sentByIdx: index("message_log_sent_by_idx").on(t.sentBy),
  }),
);

/* ---------- message_templates (editable without deploys) ---------- */
export const messageTemplates = pgTable(
  "message_templates",
  {
    id: id(),
    key: varchar("key", { length: 100 }).notNull().unique(), // e.g. sendPropertyDetails
    channel: varchar("channel", { length: 20 }).notNull(), // whatsapp | email
    subject: varchar("subject", { length: 512 }), // email only
    body: text("body").notNull(), // supports {{placeholders}}
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    keyIdx: index("message_templates_key_idx").on(t.key),
  }),
);

/* ---------- assignment_counter (round-robin persisted in DB, NOT memory) ---------- */
export const assignmentCounter = pgTable("assignment_counter", {
  id: varchar("id", { length: 50 }).primaryKey(), // e.g. "lead_round_robin"
  lastIndex: integer("last_index").notNull().default(0),
  ...timestamps,
});

/* ---------- new launch / project sales ---------- */

/**
 * A developer project sold off-plan (new launch).
 *
 * Deliberately NOT modelled as a `properties` row. A resale listing has one owner,
 * one unit and one asking price; a project has none of those. It has unit TYPES with
 * indicative prices, and the specific unit is only pinned down at booking.
 *
 * We do not mirror the developer's unit availability. It changes hourly and they are
 * the source of truth — a stale copy is worse than none. See ROADMAP.md,
 * "Inventory depth", for the reasoning and for what would change that.
 */
export const projects = pgTable(
  "projects",
  {
    id: id(),
    name: varchar("name", { length: 255 }).notNull(),
    developer: varchar("developer", { length: 255 }),
    propertyType: varchar("property_type", { length: 30 }), // condo | serviced-apartment | ...
    state: varchar("state", { length: 100 }).notNull(),
    area: varchar("area", { length: 255 }).notNull(),
    address: text("address"),
    /** Sales gallery — where appointments happen. Used by the scheduler in phase 1.2. */
    galleryAddress: text("gallery_address"),
    tenure: varchar("tenure", { length: 20 }), // freehold | leasehold
    titleType: varchar("title_type", { length: 20 }), // individual | strata | master
    launchAt: timestamp("launch_at", { withTimezone: true }),
    /** Expected vacant possession. */
    expectedVpAt: timestamp("expected_vp_at", { withTimezone: true }),
    totalUnits: integer("total_units"),
    /** Bumi allocation as a whole percentage of units (0-100). */
    bumiQuotaPct: integer("bumi_quota_pct"),
    /** Bumi discount in basis points (700 = 7.00%) — integer, like every other rate. */
    bumiDiscountBp: integer("bumi_discount_bp"),
    /** Free text: "10% early bird, free legal fees, free S&P". */
    rebatePackage: text("rebate_package"),
    /** What the developer pays us, in basis points (250 = 2.50%). Drives phase 3.1. */
    developerCommissionBp: integer("developer_commission_bp"),
    /**
     * Pass a lead to the next person in this project's pool if its owner has logged
     * nothing for this many days. Null — the default — means never pass on.
     *
     * Deliberately opt-in per project, and deliberately confined to project leads.
     * `server/leads/stale.ts` makes the case that automatic transfer is wrong for
     * resale, where the client relationship IS the agent's asset; that argument does
     * not hold for a launch, where the pool are interchangeable setters working the
     * developer's campaign and passing leads on is the working model. Resale leads
     * are surfaced, never confiscated.
     */
    passOnAfterDays: integer("pass_on_after_days"),
    /** upcoming | open | closing | closed */
    status: varchar("status", { length: 20 }).notNull().default("open"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    statusIdx: index("projects_status_idx").on(t.status),
    stateAreaIdx: index("projects_state_area_idx").on(t.state, t.area),
    // Every list query is ORDER BY created_at DESC ... WHERE deleted_at IS NULL.
    liveCreatedIdx: index("projects_live_created_idx")
      .on(t.createdAt.desc().nullsFirst())
      .where(sql`deleted_at is null`),
  }),
);

/**
 * A unit type within a project — "Type B, 1,050 sqft, 3R2B, from RM 620k".
 *
 * This is what an agent actually quotes, and what a lead's budget is matched
 * against. Prices are MYR integer cents like everywhere else.
 */
export const projectUnitTypes = pgTable(
  "project_unit_types",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 100 }).notNull(), // "Type A"
    description: text("description"),
    builtUpSqft: integer("built_up_sqft"),
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    carParks: integer("car_parks"),
    /** Developer list price, MYR integer cents. */
    listPrice: bigint("list_price", { mode: "number" }).notNull(),
    /** Typical price after the rebate package, MYR integer cents. Nullable. */
    nettPrice: bigint("nett_price", { mode: "number" }),
    totalUnits: integer("total_units"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index("project_unit_types_project_idx").on(t.projectId),
    sortIdx: index("project_unit_types_sort_idx").on(t.projectId, t.sortOrder),
  }),
);

/**
 * One item in a project's SALES KIT — the material the agency publishes DOWN to its
 * agents. The mirror image of `deal_documents`, which is the paperwork a buyer sends
 * UP into one deal. The same form appears on both sides and they are not the same
 * object: the blank "Sales Form" every agent downloads lives here, one per project;
 * the copy a specific buyer signed lives on that buyer's deal, with a deadline.
 *
 * A kit is not only files, which is why there are three payload columns of which
 * exactly one is set. The previous agency's spreadsheet held a price-list PDF, a
 * Google Maps pin for the showroom and an HDA account number side by side — a table
 * that could only hold uploads would quietly lose two thirds of a kit, and the
 * missing third is the part an agent needs while standing in front of a buyer.
 */
export const projectResources = pgTable(
  "project_resources",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** price-list | legal | marketing | forms | panel | logistics */
    category: varchar("category", { length: 30 }).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    /** An uploaded file. The row holds the pointer; the bytes live in object storage. */
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    /** An external link — a Drive folder, a Google Maps pin for the showroom. */
    url: text("url"),
    /** A plain fact — an HDA account number, a panel banker's direct line. */
    value: text("value"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Who last published or changed this item. A price list nobody owns goes stale. */
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => ({
    // Every read is "this project's kit, grouped by category, in order".
    projectIdx: index("project_resources_project_idx").on(t.projectId, t.category, t.sortOrder),
  }),
);

/* ---------- lead form sources (ad platform → project mapping) ---------- */

/**
 * Maps an external lead form to what it means to us.
 *
 * A Meta lead form knows its own id and nothing about our business. Somebody has to
 * say "form 8123… is the Skyline Residence campaign", and that somebody should be an
 * admin in a screen, not a developer in a deploy — new campaigns launch weekly and a
 * code change per campaign is how a CRM stops being used.
 *
 * `projectId` is the payload: it is what puts an inbound Meta lead into the right
 * funnel. Unmapped forms still create leads — dropping a paid lead because nobody
 * filled in a mapping would be far worse — they just arrive without a project.
 */
export const leadFormSources = pgTable(
  "lead_form_sources",
  {
    id: id(),
    /** meta | tally | typeform | googleads | generic */
    provider: varchar("provider", { length: 20 }).notNull(),
    /** The provider's own form id. Unique per provider. */
    externalFormId: varchar("external_form_id", { length: 255 }).notNull(),
    /** What a human calls it: "Skyline Residence — August launch". */
    label: varchar("label", { length: 255 }).notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** Applied when the form itself does not ask. */
    defaultInterest: varchar("default_interest", { length: 20 }),
    /** Off means leads still arrive, but this mapping is not applied. */
    active: boolean("active").notNull().default(true),
    /**
     * Which question on the form answers which of our fields. Null means "guess",
     * which is the right default: Meta's standard questions have predictable keys and
     * the heuristics get them right. This is the override for the forms that ask in
     * Malay, or ask twice, or call the phone field something nobody expected.
     */
    fieldMap: jsonb("field_map").$type<LeadFieldMap>(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    lookupIdx: index("lead_form_sources_lookup_idx").on(t.provider, t.externalFormId),
    projectIdx: index("lead_form_sources_project_idx").on(t.projectId),
  }),
);

/* ---------- lead remarks ---------- */

/**
 * The remark thread on a lead. APPEND ONLY.
 *
 * A lead is worked over weeks and every call is a separate fact, so a single remark
 * field that gets overwritten destroys the history an agent needs — and the evidence
 * behind the follow-up rate. Nothing here is ever edited or deleted; there is no edit
 * affordance in the UI and no update action in the server layer.
 *
 * `status` records the outcome applied WITH this remark. Status changes and remarks are
 * written together, deliberately: it is not possible to move a lead without saying why,
 * which is what keeps the history complete enough to trust.
 */
export const leadRemarks = pgTable(
  "lead_remarks",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    /** Null for system entries — nobody typed them. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** May be empty when only the status changed. */
    body: text("body"),
    /** The status applied with this remark, if any. */
    status: varchar("status", { length: 30 }),
    /** manual | system. Only `manual` counts as a follow-up. */
    kind: varchar("kind", { length: 10 }).notNull().default("manual"),
    ...timestamps,
  },
  (t) => ({
    // Every read is "this lead's thread, newest first".
    leadIdx: index("lead_remarks_lead_idx").on(t.leadId, t.createdAt),
    userIdx: index("lead_remarks_user_idx").on(t.userId),
  }),
);

/* ---------- connected ad-platform pages ---------- */

/**
 * A Facebook Page this agency has connected, and the token that lets us act for it.
 *
 * Exists so connecting is a button rather than a deploy. Before this, the Page id and
 * token were environment variables, which meant a wrangler command to change and a
 * redeploy to take effect — fine for a developer, useless for the person who actually
 * runs the ads.
 *
 * `accessToken` is CIPHERTEXT, not a token. It is encrypted with lib/crypto/secret-box
 * before it is written and decrypted only where it is used. A database dump therefore
 * does not hand anyone the ability to read the agency's leads.
 */
export const connectedPages = pgTable(
  "connected_pages",
  {
    id: id(),
    /** meta — the only one today, but the token/expiry shape is not Meta-specific. */
    provider: varchar("provider", { length: 20 }).notNull(),
    /** The platform's own id for the page. */
    externalPageId: varchar("external_page_id", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    /** AES-GCM ciphertext of the page access token. Never a bare token. */
    accessToken: text("access_token").notNull(),
    /** What the token was granted, so a missing permission is diagnosable. */
    scopes: text("scopes"),
    /** Null means the platform reports no expiry, which is the goal for a page token. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    /*
     * One live connection per page. Scoped to deleted_at IS NULL so a page can be
     * disconnected and reconnected later without colliding with its own history.
     */
    uniquePage: uniqueIndex("connected_pages_unique")
      .on(t.provider, t.externalPageId)
      .where(sql`deleted_at is null`),
  }),
);

/* ---------- project lead pools and assignment history ---------- */

/**
 * Who works a project's leads, and in what order.
 *
 * A single global rotation is wrong once projects exist: an agent who does not sell
 * Skyline should not be handed Skyline leads, and the developer's campaign budget
 * should reach the people actually working it. A project with no pool falls back to
 * the global rotation, so nothing breaks the day a project is created.
 */
export const projectPoolMembers = pgTable(
  "project_pool_members",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Rotation order. Ties break on createdAt, so the sequence is deterministic. */
    sortOrder: integer("sort_order").notNull().default(0),
    /** Off means "still on the team, not taking new leads this week". */
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index("project_pool_members_project_idx").on(t.projectId),
    userIdx: index("project_pool_members_user_idx").on(t.userId),
    orderIdx: index("project_pool_members_order_idx").on(t.projectId, t.sortOrder),
  }),
);

/**
 * Every change of hands, append-only.
 *
 * The `leads` row says who holds it now. This says who held it before, who moved it
 * and why — which is what a commission dispute turns on, and what "passed out /
 * passed in" reporting is built from. Deriving that later from a mutable column is
 * impossible, which is why it is written at the time.
 */
export const leadAssignments = pgTable(
  "lead_assignments",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    /** Null on the first assignment — it came from nobody. */
    fromUserId: uuid("from_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Null means it was left unassigned (no eligible agent). */
    toUserId: uuid("to_user_id").references(() => users.id, { onDelete: "set null" }),
    /** round-robin | pool | manual | import | sla-pass-on */
    reason: varchar("reason", { length: 20 }).notNull(),
    note: text("note"),
    /** Null when no person did it — an automated sweep. */
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => ({
    leadIdx: index("lead_assignments_lead_idx").on(t.leadId),
    toIdx: index("lead_assignments_to_idx").on(t.toUserId),
    fromIdx: index("lead_assignments_from_idx").on(t.fromUserId),
  }),
);

/* ---------- deal document checklists ---------- */

/**
 * The checklist template for a pipeline — what paperwork a deal of this kind needs.
 *
 * Rows rather than a hardcoded list, for the same reason `deal_stages` are rows: the
 * paperwork a developer demands varies by project and changes between launches, and a
 * code change per variation is how a checklist stops being maintained.
 */
export const documentRequirements = pgTable(
  "document_requirements",
  {
    id: id(),
    /** project | resale — matches deal_stages.pipeline. */
    pipeline: varchar("pipeline", { length: 20 }).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    /** A deal cannot sensibly complete without it. Advisory — nothing is blocked. */
    required: boolean("required").notNull().default(true),
    /**
     * Suggested deadline, in days from the deal being created. A starting point only:
     * the date that actually matters (a loan approval's expiry) is printed on the
     * document, so `deal_documents.due_at` is editable per deal.
     */
    dueAfterDays: integer("due_after_days"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    pipelineIdx: index("document_requirements_pipeline_idx").on(t.pipeline, t.sortOrder),
  }),
);

/**
 * One checklist line on one deal.
 *
 * Instantiated from the template when the deal is created, and editable afterwards —
 * items can be added ad hoc, because no template survives contact with a real developer.
 *
 * `documentId` links the uploaded file once there is one. An item can be marked done
 * without a file (the agent saw the original) and a file can be attached before the item
 * is ticked, so the two are deliberately independent.
 */
export const dealDocuments = pgTable(
  "deal_documents",
  {
    id: id(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    /** Null for an item added by hand rather than from the template. */
    requirementId: uuid("requirement_id").references(() => documentRequirements.id, {
      onDelete: "set null",
    }),
    label: varchar("label", { length: 255 }).notNull(),
    required: boolean("required").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    /** The deadline that matters. Editable — a loan approval expires on its own date. */
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
    /** The uploaded file, when one has been attached. */
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    dealIdx: index("deal_documents_deal_idx").on(t.dealId, t.sortOrder),
    // "What is due or overdue and not yet done" — the only query that needs to be fast.
    dueIdx: index("deal_documents_due_idx")
      .on(t.dueAt)
      .where(sql`completed_at is null and deleted_at is null`),
  }),
);

/* ---------- appointments (gallery visits and property viewings) ---------- */
/**
 * A scheduled property viewing.
 *
 * Its own table rather than an `activities` row, because a viewing has structure an
 * activity does not: it links a CLIENT and a PROPERTY together, it has a future
 * scheduled time distinct from when it was logged, and it has an outcome that
 * matters to the pipeline. Activities remain the free-form timeline; this is the
 * appointment.
 *
 * The client is either a lead or a contact — agents show properties to people who
 * have not been qualified yet, and refusing to schedule until they are would just
 * push the diary back into WhatsApp. Exactly one of the two is set; enforced by a
 * CHECK constraint in the migration rather than in application code.
 */
export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    // Exactly one SUBJECT: a resale property, or a new-launch project whose sales
    // gallery the client is visiting. CHECK constraint in migration 0006.
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    // Exactly one CLIENT. CHECK constraint in migration 0005.
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    /**
     * The SETTER — the agent who owns the client and booked this. Ownership filters
     * key on this column, which is why it keeps its original name.
     */
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    /**
     * The CLOSER — who runs the presentation. Often the setter, frequently not.
     * Recorded at the time rather than inferred later, because commission splits on it.
     */
    closerId: uuid("closer_id").references(() => users.id, { onDelete: "set null" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    // scheduled | showed-up | no-show | cancelled
    status: varchar("status", { length: 20 }).notNull().default("scheduled"),
    // Recorded afterwards: booked | interested | not-interested | undecided
    outcome: varchar("outcome", { length: 20 }),
    /** One line shown in list and board views: "Rang out, will retry." */
    remark: varchar("remark", { length: 500 }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    propertyIdx: index("appointments_property_idx").on(t.propertyId),
    projectIdx: index("appointments_project_idx").on(t.projectId),
    contactIdx: index("appointments_contact_idx").on(t.contactId),
    leadIdx: index("appointments_lead_idx").on(t.leadId),
    assignedIdx: index("appointments_assigned_idx").on(t.assignedTo),
    closerIdx: index("appointments_closer_idx").on(t.closerId),
    // Every list query is "upcoming, soonest first, not deleted".
    scheduledIdx: index("appointments_scheduled_idx")
      .on(t.scheduledAt)
      .where(sql`deleted_at is null`),
    // The board reads "everything not yet resolved, soonest first".
    boardIdx: index("appointments_board_idx")
      .on(t.status, t.scheduledAt)
      .where(sql`deleted_at is null`),
  }),
);
/* ---------- campaign_spend (what the agency paid, per campaign per month) ---------- */
/**
 * Monthly advertising spend, entered by hand.
 *
 * There is no API integration here on purpose. Pulling spend from Meta and Google
 * means OAuth against two ad accounts, token refresh, and a mapping from ad-account
 * to agency — weeks of work whose output is a number the principal already knows and
 * can type in sixty seconds a month. If the agency ever runs enough campaigns for
 * typing to hurt, that is the moment to automate it, not before.
 *
 * `campaign` is the campaign NAME, matched against `leads.utm_campaign`. That makes
 * the join fragile in one specific way worth stating plainly: renaming a campaign in
 * Ads Manager mid-month splits its leads across two names, and the spend row will
 * only match one of them. The report surfaces campaigns with leads but no spend, and
 * spend with no leads, precisely so that split is visible rather than silent.
 *
 * `utmSource` scopes the name, because "August Launch" can exist on both Meta and
 * Google and they are different budgets.
 */
export const campaignSpend = pgTable(
  "campaign_spend",
  {
    id: id(),
    campaign: varchar("campaign", { length: 255 }).notNull(),
    /** meta | google | tiktok | ... — matched against leads.utm_source. */
    utmSource: varchar("utm_source", { length: 255 }).notNull(),
    /** First day of the month the spend belongs to. A calendar month, not an instant. */
    month: date("month").notNull(),
    /** MYR integer cents, like every other money column here. */
    amount: bigint("amount", { mode: "number" }).notNull(),
    notes: text("notes"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => ({
    monthIdx: index("campaign_spend_month_idx").on(t.month),
    // One figure per campaign per channel per month. Without this, a double-submitted
    // form silently doubles the reported cost per lead — the failure mode is a wrong
    // number that looks right, which is the worst kind.
    uniqueEntry: uniqueIndex("campaign_spend_unique_idx")
      .on(t.campaign, t.utmSource, t.month)
      .where(sql`deleted_at is null`),
  }),
);

/* ---------- inferred types ---------- */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type DealStage = typeof dealStages.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type MessageLog = typeof messageLog.$inferSelect;
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type DocumentRequirement = typeof documentRequirements.$inferSelect;
export type DealDocument = typeof dealDocuments.$inferSelect;
export type ProjectResource = typeof projectResources.$inferSelect;
export type ProjectPoolMember = typeof projectPoolMembers.$inferSelect;
export type LeadAssignment = typeof leadAssignments.$inferSelect;
export type LeadFormSource = typeof leadFormSources.$inferSelect;
export type NewLeadFormSource = typeof leadFormSources.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectUnitType = typeof projectUnitTypes.$inferSelect;
export type NewProjectUnitType = typeof projectUnitTypes.$inferInsert;
export type CampaignSpend = typeof campaignSpend.$inferSelect;
export type NewCampaignSpend = typeof campaignSpend.$inferInsert;

/* ---------- commission ---------- */

/**
 * Reusable commission configuration. Editable, so an agency can change its split
 * without a deploy — but see `dealCommissions`: a deal snapshots these values, so
 * editing a scheme never rewrites a commission already agreed.
 */
export const commissionSchemes = pgTable(
  "commission_schemes",
  {
    id: id(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    /** Null = use the project's own developerCommissionBp. Basis points. */
    developerBp: integer("developer_bp"),
    /** The split. Must total 10000; enforced by a table constraint. */
    agencyBp: integer("agency_bp").notNull(),
    setterBp: integer("setter_bp").notNull(),
    closerBp: integer("closer_bp").notNull(),
    coBrokeBp: integer("co_broke_bp").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => ({ defaultIdx: index("commission_schemes_default_idx").on(t.isDefault) }),
);

export const commissionSchemeStages = pgTable(
  "commission_scheme_stages",
  {
    id: id(),
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => commissionSchemes.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    /** Share of the gross released here. All stages of a scheme must total 10000. */
    releaseBp: integer("release_bp").notNull(),
    /** Days after booking, for a suggested expected date. Null = no suggestion. */
    dueDays: integer("due_days"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => ({ schemeIdx: index("commission_scheme_stages_scheme_idx").on(t.schemeId, t.sortOrder) }),
);

/**
 * One deal's commission. Every rate here is a SNAPSHOT taken when it was created:
 * editing the scheme afterwards must not silently change what an agent was told they
 * would earn, and `baseAmount` is stored rather than read from the deal because a
 * deal's value can be corrected later.
 */
export const dealCommissions = pgTable(
  "deal_commissions",
  {
    id: id(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    schemeId: uuid("scheme_id").references(() => commissionSchemes.id, { onDelete: "set null" }),
    schemeName: varchar("scheme_name", { length: 120 }).notNull(),
    baseAmount: bigint("base_amount", { mode: "number" }).notNull(),
    developerBp: integer("developer_bp").notNull(),
    grossAmount: bigint("gross_amount", { mode: "number" }).notNull(),
    setterId: uuid("setter_id").references(() => users.id, { onDelete: "set null" }),
    closerId: uuid("closer_id").references(() => users.id, { onDelete: "set null" }),
    coBrokeName: varchar("co_broke_name", { length: 255 }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => ({ dealIdx: index("deal_commissions_deal_idx").on(t.dealId) }),
);

export const dealCommissionStages = pgTable(
  "deal_commission_stages",
  {
    id: id(),
    dealCommissionId: uuid("deal_commission_id")
      .notNull()
      .references(() => dealCommissions.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    releaseBp: integer("release_bp").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    expectedAt: timestamp("expected_at", { withTimezone: true }),
    invoicedAt: timestamp("invoiced_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    parentIdx: index("deal_commission_stages_parent_idx").on(t.dealCommissionId, t.sortOrder),
  }),
);

export const dealCommissionSplits = pgTable(
  "deal_commission_splits",
  {
    id: id(),
    dealCommissionId: uuid("deal_commission_id")
      .notNull()
      .references(() => dealCommissions.id, { onDelete: "cascade" }),
    /** agency | setter | closer | co-broke */
    party: varchar("party", { length: 20 }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    label: varchar("label", { length: 255 }).notNull(),
    shareBp: integer("share_bp").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => ({
    parentIdx: index("deal_commission_splits_parent_idx").on(t.dealCommissionId),
    userIdx: index("deal_commission_splits_user_idx").on(t.userId),
  }),
);

export type CommissionScheme = typeof commissionSchemes.$inferSelect;
export type CommissionSchemeStage = typeof commissionSchemeStages.$inferSelect;
export type DealCommission = typeof dealCommissions.$inferSelect;
export type DealCommissionStage = typeof dealCommissionStages.$inferSelect;
export type DealCommissionSplit = typeof dealCommissionSplits.$inferSelect;

/* ---------- notifications ---------- */

/**
 * In-app notifications, with email as an optional second channel.
 *
 * `dedupeKey` is what stops a nightly job producing the same message every night. It
 * identifies the THING BEING SAID rather than the moment of saying it — a key like
 * `doc-due:<id>:<dueDate>` changes when the deadline moves and not otherwise, so a
 * genuinely new fact notifies again and a repeat does not.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** lead-passed-on | document-due | appointment-reminder | digest | lead-assigned */
    kind: varchar("kind", { length: 40 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    /** Relative, always internal. e.g. /leads/<id> */
    link: varchar("link", { length: 500 }),
    entityType: varchar("entity_type", { length: 20 }),
    entityId: uuid("entity_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** null = not attempted; otherwise skipped | queued | sent | failed */
    emailStatus: varchar("email_status", { length: 20 }),
    emailError: text("email_error"),
    /** Null means "always create" — a one-off, human-triggered event. */
    dedupeKey: varchar("dedupe_key", { length: 200 }),
    ...timestamps,
  },
  (t) => ({
    userIdx: index("notifications_user_idx").on(t.userId, t.createdAt),
  }),
);

export type Notification = typeof notifications.$inferSelect;

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
  bigint,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
    role: varchar("role", { length: 20 }).notNull().default("agent"), // admin | manager | agent
    teamId: uuid("team_id"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    externalAuthIdx: index("users_external_auth_idx").on(t.externalAuthId),
    teamIdx: index("users_team_idx").on(t.teamId),
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
    referrer: text("referrer"),
    interest: varchar("interest", { length: 20 }), // buy | rent | sell | invest
    budgetMin: bigint("budget_min", { mode: "number" }), // MYR integer cents
    budgetMax: bigint("budget_max", { mode: "number" }),
    preferredAreas: text("preferred_areas"), // comma/JSON list of areas
    status: varchar("status", { length: 20 }).notNull().default("new"), // new | contacted | qualified | disqualified
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    consentGivenAt: timestamp("consent_given_at", { withTimezone: true }),
    consentSource: varchar("consent_source", { length: 255 }),
    convertedToContactId: uuid("converted_to_contact_id"), // FK added in relations to avoid cycle
    ...timestamps,
  },
  (t) => ({
    phoneIdx: index("leads_phone_idx").on(t.phone),
    emailIdx: index("leads_email_idx").on(t.email),
    statusIdx: index("leads_status_idx").on(t.status),
    assignedIdx: index("leads_assigned_idx").on(t.assignedTo),
    sourceIdx: index("leads_source_idx").on(t.source),
    convertedIdx: index("leads_converted_idx").on(t.convertedToContactId),
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
    ...timestamps,
  },
  (t) => ({
    sortIdx: index("deal_stages_sort_idx").on(t.sortOrder),
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

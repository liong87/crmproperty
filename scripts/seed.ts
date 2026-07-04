/**
 * Seed realistic Malaysian dev/UAT data.
 * Run: pnpm seed   (requires DATABASE_URL)
 *
 * Idempotent-ish: clears core tables first, then inserts.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import {
  users,
  leads,
  contacts,
  properties,
  dealStages,
  deals,
  activities,
  messageTemplates,
  assignmentCounter,
} from "../lib/db/schema";

async function main() {
  console.log("Seeding PropertyAgent CRM…");

  // --- clear (order respects FKs) ---
  await db.delete(activities);
  await db.delete(deals);
  await db.delete(contacts);
  await db.delete(leads);
  await db.delete(properties);
  await db.delete(dealStages);
  await db.delete(messageTemplates);
  await db.delete(assignmentCounter);
  await db.delete(users);

  // --- users (5-person agency) ---
  const staff = await db
    .insert(users)
    .values([
      { externalAuthId: "seed_admin", name: "Aisyah Rahman", email: "aisyah@agency.my", phone: "+60123000001", role: "admin" },
      { externalAuthId: "seed_manager", name: "Tan Wei Ming", email: "weiming@agency.my", phone: "+60123000002", role: "manager" },
      { externalAuthId: "seed_agent1", name: "Nurul Izzah", email: "nurul@agency.my", phone: "+60123000003", role: "agent" },
      { externalAuthId: "seed_agent2", name: "Ravi Kumar", email: "ravi@agency.my", phone: "+60123000004", role: "agent" },
      { externalAuthId: "seed_agent3", name: "Lim Siew Ling", email: "siewling@agency.my", phone: "+60123000005", role: "agent" },
    ])
    .returning({ id: users.id, role: users.role });

  const agents = staff.filter((s) => s.role === "agent");
  const agentId = (i: number) => agents[i % agents.length]!.id;

  // --- deal stages (seed order) ---
  const stages = await db
    .insert(dealStages)
    .values([
      { name: "New", sortOrder: 1, isTerminal: false },
      { name: "Contacted", sortOrder: 2, isTerminal: false },
      { name: "Viewing Scheduled", sortOrder: 3, isTerminal: false },
      { name: "Negotiation", sortOrder: 4, isTerminal: false },
      { name: "Closed Won", sortOrder: 5, isTerminal: true },
      { name: "Closed Lost", sortOrder: 6, isTerminal: true },
    ])
    .returning({ id: dealStages.id, name: dealStages.name });

  const stageId = (name: string) => stages.find((s) => s.name === name)!.id;

  // --- message templates ---
  await db.insert(messageTemplates).values([
    { key: "sendPropertyDetails", channel: "whatsapp", body: "Hi {{name}}, here are the details for {{propertyTitle}}: {{url}}" },
    { key: "sendFollowUp", channel: "whatsapp", body: "Hi {{name}}, following up on your interest in {{area}} properties. Free for a viewing this week?" },
    { key: "leadConfirmation", channel: "email", subject: "We received your inquiry", body: "Thank you {{name}}, an agent will reach out shortly." },
  ]);

  // --- properties (KL / Selangor / Penang) ---
  const props = await db
    .insert(properties)
    .values([
      { title: "Mont Kiara Condo, KL", listingType: "sale", propertyType: "condo", tenure: "freehold", titleType: "strata", state: "Kuala Lumpur", area: "Mont Kiara", address: "Jalan Kiara 1", builtUpSqft: 1350, bedrooms: 3, bathrooms: 2, carParks: 2, askingPrice: 128000000, furnishing: "partial", status: "active", ownerName: "Mr Chong", ownerPhone: "+60129000001", assignedAgent: agentId(0) },
      { title: "Bangsar South Serviced Apt", listingType: "rent", propertyType: "serviced-apartment", tenure: "leasehold", leaseholdExpiry: 2110, titleType: "strata", state: "Kuala Lumpur", area: "Bangsar South", builtUpSqft: 850, bedrooms: 2, bathrooms: 2, carParks: 1, askingPrice: 320000, furnishing: "full", status: "active", ownerName: "Ms Devi", ownerPhone: "+60129000002", assignedAgent: agentId(1) },
      { title: "Setia Alam Double Storey Terrace", listingType: "sale", propertyType: "terrace", tenure: "freehold", titleType: "individual", state: "Selangor", area: "Setia Alam", builtUpSqft: 2200, landSqft: 1600, bedrooms: 4, bathrooms: 3, carParks: 2, askingPrice: 95000000, furnishing: "unfurnished", status: "active", ownerName: "Encik Zainal", ownerPhone: "+60129000003", assignedAgent: agentId(2) },
      { title: "Tanjung Bungah Semi-D, Penang", listingType: "sale", propertyType: "semi-d", tenure: "freehold", titleType: "individual", bumiLot: false, state: "Penang", area: "Tanjung Bungah", builtUpSqft: 3200, landSqft: 4000, bedrooms: 5, bathrooms: 5, carParks: 3, askingPrice: 285000000, furnishing: "partial", status: "pending", ownerName: "Mr Ooi", ownerPhone: "+60129000004", assignedAgent: agentId(0) },
      { title: "Cheras Shop Lot", listingType: "rent", propertyType: "shop", tenure: "leasehold", leaseholdExpiry: 2085, titleType: "master", state: "Kuala Lumpur", area: "Cheras", builtUpSqft: 1500, askingPrice: 650000, furnishing: "unfurnished", status: "active", ownerName: "Sdn Bhd Holdings", ownerPhone: "+60129000005", assignedAgent: agentId(1) },
    ])
    .returning({ id: properties.id, title: properties.title });

  // --- leads ---
  const leadRows = await db
    .insert(leads)
    .values([
      { name: "Farah Aziz", phone: "+60111000001", email: "farah@example.my", source: "api", sourceDetail: "homepage-form", utmSource: "google", utmMedium: "cpc", utmCampaign: "montkiara", interest: "buy", budgetMin: 100000000, budgetMax: 150000000, preferredAreas: "Mont Kiara, Bangsar", status: "new", assignedTo: agentId(0), consentGivenAt: new Date(), consentSource: "homepage-form" },
      { name: "Daniel Wong", phone: "+60111000002", email: "daniel@example.my", source: "webhook", sourceDetail: "tally", interest: "rent", budgetMin: 250000, budgetMax: 400000, preferredAreas: "Bangsar South", status: "contacted", assignedTo: agentId(1), consentGivenAt: new Date(), consentSource: "tally-form" },
      { name: "Kavitha Nair", phone: "+60111000003", source: "manual", interest: "invest", budgetMin: 80000000, budgetMax: 120000000, preferredAreas: "Setia Alam, Shah Alam", status: "qualified", assignedTo: agentId(2), consentGivenAt: new Date(), consentSource: "phone" },
      { name: "Ahmad Firdaus", phone: "+60111000004", email: "firdaus@example.my", source: "import", sourceDetail: "expo-2026", interest: "buy", budgetMin: 200000000, budgetMax: 350000000, preferredAreas: "Penang", status: "new", assignedTo: agentId(0), consentGivenAt: new Date(), consentSource: "expo-form" },
    ])
    .returning({ id: leads.id, name: leads.name, phone: leads.phone });

  // --- convert one lead -> contact (Kavitha, status qualified) ---
  const kavithaLead = leadRows.find((l) => l.name === "Kavitha Nair")!;
  const [kavithaContact] = await db
    .insert(contacts)
    .values({
      name: "Kavitha Nair",
      phone: "+60111000003",
      interest: "invest",
      budgetMin: 80000000,
      budgetMax: 120000000,
      preferredAreas: "Setia Alam, Shah Alam",
      nationality: "Malaysian",
      occupation: "Business Owner",
      assignedTo: agentId(2),
      consentGivenAt: new Date(),
      consentSource: "phone",
      sourceLeadId: kavithaLead.id,
    })
    .returning({ id: contacts.id });

  await db
    .update(leads)
    .set({ convertedToContactId: kavithaContact!.id })
    .where(eq(leads.id, kavithaLead.id));

  // --- a deal for the converted contact ---
  await db.insert(deals).values({
    contactId: kavithaContact!.id,
    propertyId: props.find((p) => p.title.includes("Setia Alam"))!.id,
    stageId: stageId("Viewing Scheduled"),
    value: 95000000,
    commissionPct: 250, // 2.50%
    assignedTo: agentId(2),
  });

  // --- some activities ---
  await db.insert(activities).values([
    { entityType: "leads", entityId: leadRows[0]!.id, type: "call", body: "Called, interested in Mont Kiara units.", followUpAt: new Date(Date.now() + 2 * 86400000), createdBy: agentId(0) },
    { entityType: "contacts", entityId: kavithaContact!.id, type: "viewing", body: "Scheduled viewing at Setia Alam terrace.", followUpAt: new Date(Date.now() + 3 * 86400000), createdBy: agentId(2) },
  ]);

  // --- init round-robin counter ---
  await db.insert(assignmentCounter).values({ id: "lead_round_robin", lastIndex: 0 });

  console.log(`Seeded: ${staff.length} users, ${props.length} properties, ${leadRows.length} leads, 1 contact, 1 deal.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

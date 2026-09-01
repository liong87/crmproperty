/**
 * Fill one project's sales kit with realistic demo content, so the feature can be
 * seen working end to end.
 *
 * Deliberately uses only LINK and VALUE items, never file attachments: those need R2
 * configured (S3_* in .env), and the point of this script is to show the kit working
 * before that is set up. Attach a file by hand once storage is configured.
 *
 * Run:     pnpm tsx scripts/demo-sales-kit.ts [projectId]
 * Undo:    pnpm tsx scripts/demo-sales-kit.ts [projectId] --remove
 *
 * With no project id it uses the most recently created project.
 *
 * Additive and idempotent: an item whose label already exists on that project is
 * skipped, so re-running does not duplicate the kit. Nothing is ever deleted.
 *
 * The shape mirrors the TIK1 sales kit in references/ — price list, plans, APDL,
 * developer licence, master title, brochure, gallery, HDA account, the blank forms
 * an agent hands a buyer, panel lawyer and banker, and the showroom pin.
 */
import "../lib/load-env";
import { desc, eq, and, isNull } from "drizzle-orm";
import { db } from "../lib/db/client";
import { projects, projectResources } from "../lib/db/schema";

type Item = {
  category: string;
  label: string;
  url?: string;
  value?: string;
  notes?: string;
};

const KIT: Item[] = [
  // Pricing & availability
  { category: "price-list", label: "Selling Price List (current)", url: "https://example.com/REPLACE-WITH-YOUR-LINK", notes: "Supersedes every earlier copy. Check the date before quoting." },
  { category: "price-list", label: "Phase Layout Plan", url: "https://example.com/REPLACE-WITH-YOUR-LINK" },
  { category: "price-list", label: "Offer Package", value: "10% early bird, free legal fees on SPA, free S&P", notes: "Confirm with the developer before promising it — packages change per phase." },

  // Legal & licensing
  { category: "legal", label: "APDL", url: "https://example.com/REPLACE-WITH-YOUR-LINK" },
  { category: "legal", label: "Lesen Pemaju (Developer Licence)", url: "https://example.com/REPLACE-WITH-YOUR-LINK" },
  { category: "legal", label: "Master Title", url: "https://example.com/REPLACE-WITH-YOUR-LINK" },
  { category: "legal", label: "HDA Account", value: "HDA a/c 5141 2200 1234 — Maybank", notes: "Buyer's deposit goes here, never to an agent or the agency." },

  // Marketing material
  { category: "marketing", label: "E-Brochure", url: "https://example.com/REPLACE-WITH-YOUR-LINK" },
  { category: "marketing", label: "Photo Gallery", url: "https://example.com/REPLACE-WITH-YOUR-LINK" },

  // Blank forms — the templates an agent gives a buyer
  { category: "forms", label: "Sales Form (blank)", url: "https://example.com/REPLACE-WITH-YOUR-LINK", notes: "The buyer's completed copy belongs on their deal, not here." },
  { category: "forms", label: "Consent Letter (blank)", url: "https://example.com/REPLACE-WITH-YOUR-LINK" },
  { category: "forms", label: "Cancellation Form (blank)", url: "https://example.com/REPLACE-WITH-YOUR-LINK" },
  { category: "forms", label: "Change Unit Form (blank)", url: "https://example.com/REPLACE-WITH-YOUR-LINK" },
  { category: "forms", label: "BGB Form (blank)", url: "https://example.com/REPLACE-WITH-YOUR-LINK" },

  // Panel lawyer & bankers
  { category: "panel", label: "Panel Lawyer", value: "Chia & Lee — No. 13, Jalan KPKS 5A, Kompleks Perniagaan Kota Syahbandar, 75200 Melaka", notes: "RM1,000 advance disbursement on appointment; refundable less RM150 if the loan fails within 2 months." },
  { category: "panel", label: "Panel Banker — Maybank", value: "Encik Faizal · +60 12-345 6789" },
  { category: "panel", label: "Panel Banker — Public Bank", value: "Ms Tan · +60 12-987 6543" },

  // Showroom & logistics
  { category: "logistics", label: "Showroom Location", url: "https://example.com/REPLACE-WITH-YOUR-SHOWROOM-PIN", notes: "Send this to the buyer the day before the appointment." },
  { category: "logistics", label: "Showroom Hours", value: "Daily 10:00–18:00, closed Tuesdays" },
  { category: "logistics", label: "Lock Unit Instruction", value: "WhatsApp the sales admin with unit no. + buyer name. Hold is 24 hours without a booking form." },
];

async function main() {
  const args = process.argv.slice(2);
  const remove = args.includes("--remove");
  const argId = args.find((a) => !a.startsWith("--"));

  const [project] = argId
    ? await db.select().from(projects).where(and(eq(projects.id, argId), isNull(projects.deletedAt))).limit(1)
    : await db.select().from(projects).where(isNull(projects.deletedAt)).orderBy(desc(projects.createdAt)).limit(1);

  if (!project) {
    console.error("No project found. Create one first at Projects > New, or pass a project id.");
    process.exit(1);
  }

  if (remove) {
    // Soft delete, the same as the Remove button in the app, and matched by label so
    // it only ever touches what this script inserted. Anything you added by hand or
    // edited the label of is left alone.
    let removed = 0;
    for (const item of KIT) {
      const res = await db
        .update(projectResources)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(projectResources.projectId, project.id),
            eq(projectResources.label, item.label),
            isNull(projectResources.deletedAt),
          ),
        )
        .returning({ id: projectResources.id });
      removed += res.length;
    }
    console.log(`Removed ${removed} demo items from "${project.name}".`);
    console.log("Items you added yourself are untouched.");
    process.exit(0);
  }

  console.log(`Filling the sales kit for "${project.name}" (${project.id})...`);

  let inserted = 0;
  let skipped = 0;

  // sortOrder is assigned per category in declaration order, so the kit reads the way
  // it is written above rather than in whatever order rows come back.
  const seen: Record<string, number> = {};

  for (const item of KIT) {
    const existing = await db
      .select({ id: projectResources.id })
      .from(projectResources)
      .where(
        and(
          eq(projectResources.projectId, project.id),
          eq(projectResources.label, item.label),
          isNull(projectResources.deletedAt),
        ),
      )
      .limit(1);

    if (existing.length > 0) { skipped++; continue; }

    seen[item.category] = (seen[item.category] ?? 0) + 1;

    await db.insert(projectResources).values({
      projectId: project.id,
      category: item.category,
      label: item.label,
      url: item.url ?? null,
      value: item.value ?? null,
      notes: item.notes ?? null,
      sortOrder: seen[item.category]!,
    });
    inserted++;
  }

  console.log(`  ${inserted} items added, ${skipped} already present`);
  console.log(`\nOpen it:  /projects/${project.id}`);
  console.log("Links are example.com placeholders — swap them for real ones.");
  console.log("To take the demo content back out:  pnpm demo:sales-kit --remove");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

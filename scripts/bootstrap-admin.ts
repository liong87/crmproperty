/**
 * Create the FIRST admin on an empty database.
 *
 * Why this exists: `syncCurrentUser` links a Clerk identity to a staff row by
 * external id, then by email, and failing both creates the row as
 * `role: "agent", active: false` — a new sign-up who must be approved by an admin.
 * On a fresh database there is no admin to do the approving, so the first person to
 * sign in lands on /pending with no way out. `pnpm seed` was the only escape, and it
 * DELETES every row, so it is not an option against a database that matters.
 *
 * Run BEFORE signing in to a new environment:
 *
 *     pnpm bootstrap:admin you@agency.com "Your Name"
 *
 * Then sign in with that email. syncCurrentUser matches the row by email and adopts
 * it, so the Clerk id is attached on first login and you arrive as an active admin.
 *
 * The address must be VERIFIED at the auth provider for that link to happen — role
 * adoption by email is a privilege boundary, so an unverified address is refused. Use
 * an email you can actually receive on.
 *
 * Deliberately NOT destructive and deliberately narrow:
 *
 *  - It refuses to run once any active user exists. This is a bootstrap, not a
 *    back door for granting yourself admin later — that is what the Users page and
 *    an existing admin are for.
 *  - Re-running it with the same email promotes and reactivates that row rather than
 *    failing, so a half-finished migration can be repeated safely.
 *  - `external_auth_id` is a placeholder until the real Clerk id arrives at first
 *    sign-in. It is prefixed and unique so it can never collide with a real one.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { users } from "../lib/db/schema";
import { maskUrl } from "../lib/load-env";

function usage(message: string): never {
  console.error(`\n${message}\n`);
  console.error(`  Usage: pnpm bootstrap:admin <email> [name]\n`);
  process.exit(1);
}

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const name = (process.argv[3] ?? "").trim() || "Administrator";

  if (!email) usage("An email address is required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) usage(`"${email}" is not an email address.`);

  console.log(`Target: ${maskUrl(process.env.DATABASE_URL)}`);

  // The guard. Counted across ALL non-deleted rows, not just admins: if the agency
  // is already using this database, bootstrapping is the wrong tool.
  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(isNull(users.deletedAt));
  const count = countRows[0]?.count ?? 0;

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)));

  if (count > 0 && !existing) {
    console.error(
      `\nREFUSING TO RUN: this database already has ${count} user(s).\n\n` +
        `  Bootstrapping is only for an empty database. To add or promote somebody\n` +
        `  here, sign in as an existing admin and use the Users page.\n`,
    );
    process.exit(1);
  }

  if (existing) {
    if (existing.role === "admin" && existing.active) {
      console.log(`\n${email} is already an active admin. Nothing to do.\n`);
      return;
    }
    await db
      .update(users)
      .set({ role: "admin", active: true })
      .where(eq(users.id, existing.id));
    console.log(`\nPromoted the existing row for ${email} to an active admin.\n`);
    return;
  }

  const [created] = await db
    .insert(users)
    .values({
      // Replaced with the real Clerk id by syncCurrentUser at first sign-in.
      externalAuthId: `bootstrap:${email}`,
      name,
      email,
      role: "admin",
      active: true,
    })
    .returning({ id: users.id });

  console.log(`\nCreated admin ${name} <${email}>  id ${created!.id}`);
  console.log(`Sign in with that email; the Clerk account links to this row automatically.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

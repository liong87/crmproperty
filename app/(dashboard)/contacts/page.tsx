import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDbUser } from "@/lib/auth";
import { listContactsPaginated } from "@/server/contacts/queries";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn, formatMYR } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Contact } from "lucide-react";

type Params = { q?: string; page?: string };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const { items, total, pageSize } = await listContactsPaginated(me, { search: sp.q, page });
  const pages = Math.max(1, Math.ceil(total / pageSize));

  /*
   * Built with URLSearchParams rather than interpolated. The links used to read
   * `&q=${sp.q}`, so a search for "Tan & Sons" or anything with a `#` was cut off at
   * the special character and page 2 quietly searched for something else.
   */
  const withParams = (over: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged: Params = { ...sp, page: undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return `/contacts${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">Contacts</h1>
      <form className="flex gap-2" action="/contacts">
        <label htmlFor="contact-search" className="sr-only">Search contacts</label>
        <input id="contact-search" name="q" defaultValue={sp.q ?? ""} placeholder="Search name / phone / email"
          className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
        <Button type="submit" size="sm" variant="outline">Search</Button>
        {sp.q && (
          <Link href="/contacts" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Clear</Link>
        )}
      </form>

      {/* The table shell and the empty state used to render together, so an empty result
          showed a headed table with no rows AND a box saying there was nothing. */}
      {items.length === 0 ? (
        sp.q ? (
          <EmptyState
            icon={Contact}
            title="No contacts match that search"
            hint="Try part of a phone number, or clear the search to see everyone."
            action={
              <Link href="/contacts" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Clear search
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={Contact}
            title="No contacts yet"
            hint="A contact is created when you qualify a lead — that is where the client record starts."
            action={
              <Link href="/leads" className={cn(buttonVariants({ size: "sm" }))}>
                Go to leads
              </Link>
            }
          />
        )
      ) : (
        <Table label="Contacts">
          <THead sticky><TR><TH>Name</TH><TH>Phone</TH><TH>Interest</TH><TH>Budget</TH></TR></THead>
          <TBody>
            {items.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium"><Link href={`/contacts/${c.id}`} className="hover:underline">{c.name}</Link></TD>
                <TD className="text-muted-foreground">{c.phone}</TD>
                <TD>{c.interest ?? "—"}</TD>
                <TD>{formatMYR(c.budgetMin)}{c.budgetMax ? ` – ${formatMYR(c.budgetMax)}` : ""}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {pages} · {total} total</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={withParams({ page: String(page - 1) })} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Prev
              </Link>
            )}
            {page < pages && (
              <Link href={withParams({ page: String(page + 1) })} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

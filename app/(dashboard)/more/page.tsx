import { PageTitle } from "@/components/ui/page-title";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Contact, Building2, BarChart3, Users2, Radio, MessageSquareText, Percent, UserCog,
  BookOpen, type LucideIcon,
} from "lucide-react";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";

interface Entry { href: string; label: string; desc: string; icon: LucideIcon }

/**
 * Everything not on the main nav, in one place.
 *
 * Exists for two reasons. On a phone the strip holds six tiles, and the rest has to go
 * somewhere findable. On a desktop it is the answer to "where did that page go" after
 * the nav was trimmed — which is the question a trim always creates, and the reason
 * trims usually get reverted.
 */
export default async function MorePage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const lead = isTeamLeadOrAbove(me);

  const everyday: Entry[] = [
    { href: "/contacts", label: "Contacts", desc: "People who became clients", icon: Contact },
    { href: "/properties", label: "Properties", desc: "Resale and rental listings", icon: Building2 },
    { href: "/reports", label: "Reports", desc: "Funnel, activity and spend", icon: BarChart3 },
    { href: "/help", label: "User guide", desc: "How the CRM works", icon: BookOpen },
  ];

  const forLeads: Entry[] = lead
    ? [
        { href: "/team", label: "My team", desc: "Members and their activity", icon: Users2 },
        { href: "/leads-capture", label: "Leads capture", desc: "Facebook forms and sources", icon: Radio },
        { href: "/templates", label: "Templates", desc: "Reusable WhatsApp and email", icon: MessageSquareText },
        { href: "/settings/commission", label: "Commission", desc: "Schemes, splits and stages", icon: Percent },
        { href: "/users", label: "Users", desc: "Roles, access and reporting lines", icon: UserCog },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageTitle title="More">Everything that is not on the main menu.</PageTitle>

      <Section title="Everyday" entries={everyday} />
      {forLeads.length > 0 && <Section title="For team leads" entries={forLeads} />}
    </div>
  );
}

function Section({ title, entries }: { title: string; entries: Entry[] }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/70">
        {title}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map(({ href, label, desc, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-secondary/40"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{label}</span>
              <span className="block text-sm text-muted-foreground">{desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

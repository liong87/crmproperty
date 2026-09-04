import { redirect } from "next/navigation";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { listAllTemplates } from "@/server/templates/actions";
import { TemplateManager } from "@/components/templates/template-manager";

/**
 * Message templates — team leads and admins only.
 *
 * Templates are the agency's voice to clients. Agents send them; the agency decides
 * what they say. The server actions enforce the same rule, so this redirect is
 * convenience rather than security.
 */
export default async function TemplatesPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  if (!isTeamLeadOrAbove(me)) redirect("/dashboard");

  const templates = await listAllTemplates();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Message templates</h1>
        <p className="text-sm text-muted-foreground">
          Saved messages agents can send with one click. Placeholders are filled in from
          the client&apos;s record.
        </p>
      </div>
      <TemplateManager initial={templates} />
    </div>
  );
}

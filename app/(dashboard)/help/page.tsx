import { redirect } from "next/navigation";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { sectionsFor, type Block } from "@/lib/help/content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { APP_NAME } from "@/lib/constants";

/**
 * The user guide, in the app.
 *
 * Manager-only sections are removed on the SERVER before rendering, so an agent is
 * never sent instructions for a screen they cannot reach — the same rule the rest of
 * the app follows, rather than hiding them with CSS.
 */
export const metadata = { title: "Guide" };

function Note({ tone, text }: { tone: "info" | "warn" | "stop"; text: string }) {
  const tones = {
    info: "border-primary/60 bg-secondary",
    warn: "border-amber-600/60 bg-amber-50 dark:bg-amber-950/30",
    stop: "border-destructive/60 bg-destructive/5",
  } as const;
  return (
    <p className={`rounded-r-md border-l-[3px] py-2 pl-3 pr-3 text-sm ${tones[tone]}`}>
      {text}
    </p>
  );
}

function BlockView({ block, sectionTitle }: { block: Block; sectionTitle: string }) {
  switch (block.kind) {
    case "p":
      return <p className="text-sm leading-relaxed text-muted-foreground">{block.text}</p>;
    case "list":
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
          {block.items.map((t) => <li key={t}>{t}</li>)}
        </ul>
      );
    case "steps":
      return (
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
          {block.items.map((t) => <li key={t}>{t}</li>)}
        </ol>
      );
    case "figure":
      return (
        /*
         * A screenshot of the real screen.
         *
         * A plain <img>, not next/image, and deliberately. Nothing else in this app uses
         * next/image, and the Cloudflare Images binding is not enabled on the account
         * (see the note in wrangler.jsonc) — so the default optimizer endpoint would
         * fail at runtime on Workers and every screenshot would be a broken icon.
         * These are static assets served straight from the edge.
         *
         * `width`/`height` are the capture's true pixel size, so the browser reserves
         * the right box before the file arrives and the guide does not jump as you read
         * it. `loading="lazy"` keeps the fourteen below the fold off the critical path —
         * agents read this on 4G between viewings.
         */
        <figure className="space-y-1.5">
          <div className="overflow-hidden rounded-xl border bg-muted/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/guide/${block.src}`}
              alt={block.caption}
              width={block.w}
              height={block.h}
              loading="lazy"
              decoding="async"
              className="h-auto w-full"
            />
          </div>
          <figcaption className="text-xs italic text-muted-foreground">{block.caption}</figcaption>
        </figure>
      );
    case "note":
      return <Note tone={block.tone} text={block.text} />;
    case "table":
      return (
        // Table already provides its own named, focusable overflow region. The name is
        // section plus first column, not section alone: Status vocabulary holds three
        // tables, and three regions called the same thing are three dead ends.
        <Table label={`${sectionTitle} — ${block.head[0] ?? "reference"}`}>
          <THead>
            <TR>{block.head.map((h) => <TH key={h}>{h}</TH>)}</TR>
          </THead>
          <TBody>
            {block.rows.map((row) => (
              <TR key={row.join("|")}>
                {row.map((cell, i) => (
                  <TD key={i} className={i === 0 ? "font-medium" : "text-muted-foreground"}>
                    {cell}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      );
  }
}

export default async function HelpPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  const sections = sectionsFor(isTeamLeadOrAbove(me));
  const parts = [...new Set(sections.map((s) => s.part))];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">User guide</h1>
        <p className="text-sm text-muted-foreground">
          How to use {APP_NAME}, from a lead arriving to a unit being booked.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Contents</CardTitle></CardHeader>
        <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {parts.map((part) => (
            <div key={part}>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-primary">
                {part}
              </p>
              <ul className="space-y-0.5">
                {sections.filter((s) => s.part === part).map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
                      <span className="tnum mr-1.5 text-primary">{s.n}</span>{s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      {sections.map((s) => (
        <Card key={s.id} id={s.id} className="scroll-mt-4">
          <CardHeader>
            <CardTitle>
              <span className="tnum mr-2 text-primary">{s.n}</span>{s.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {s.blocks.map((b, i) => <BlockView key={i} block={b} sectionTitle={s.title} />)}
          </CardContent>
        </Card>
      ))}

      <p className="pt-2 text-xs text-muted-foreground">
        Questions this guide does not answer should go to your administrator.
      </p>
    </div>
  );
}

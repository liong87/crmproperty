import Link from "next/link";
import {
  Radio, MessageSquareText, Columns3, CalendarCheck, GraduationCap, BarChart3,
  ArrowRight, Check,
} from "lucide-react";
import { AGENCY_NAME, AGENCY_LEGAL_NAME, APP_NAME } from "@/lib/constants";

/**
 * The public page.
 *
 * This is the one screen someone sees before they have an account — a recruit an
 * agent is trying to sign, or a negotiator deciding whether this agency is
 * organised. The old version said "Internal tool for the team" over a Sign in
 * button, which answered neither question.
 *
 * EVERY CLAIM BELOW MAPS TO SOMETHING THAT EXISTS. The feature list is the
 * actual nav: leads capture (server/capture), WhatsApp templates
 * (server/templates), the pipeline, appointments, the Learning Hub
 * (server/learning), reports. Nothing here promises an integration that is not
 * built, because the first person to click through and find it missing is
 * someone who was told this agency has its act together.
 *
 * Dark teal rather than the blue everyone else in this category uses: the
 * palette is already deep teal + amber with a serif display face
 * (app/globals.css, app/layout.tsx), and looking like the competitor is a
 * strange goal for the page whose job is to distinguish you from them.
 */

export const metadata = {
  title: `${AGENCY_NAME} — the CRM behind the agency`,
  description:
    "From first lead to closed sale on one screen: ad leads captured automatically, WhatsApp follow-ups, appointments, commission and team training in the same place.",
};

const FEATURES = [
  {
    icon: Radio,
    title: "Leads arrive by themselves",
    body: "Facebook and Instagram lead forms land in the CRM the moment they are submitted, routed to the agent whose page produced them. Nobody exports a CSV at midnight.",
  },
  {
    icon: MessageSquareText,
    title: "Follow-ups that write themselves",
    body: "Saved WhatsApp templates with the client's name, property and price already filled in. One click from the lead, and what was sent is logged against the record.",
  },
  {
    icon: Columns3,
    title: "One pipeline, not six spreadsheets",
    body: "Every deal on one board with its paperwork checklist and deadlines attached — loan approval expiry included, with the reason for the date next to it.",
  },
  {
    icon: CalendarCheck,
    title: "Appointments with a setter and a closer",
    body: "Built for how presentations actually run: whoever set it and whoever runs it both see it in their own diary, and the no-show rate is a number rather than a feeling.",
  },
  {
    icon: GraduationCap,
    title: "Training in the same platform",
    body: "A team lead uploads a video once and their downline watches it here — not a Drive link that leaks to the whole industry the first time somebody forwards it.",
  },
  {
    icon: BarChart3,
    title: "Numbers the principal can act on",
    body: "Cost per lead by campaign, conversion by source, and who is actually working their leads — from data the CRM already has, not a monthly reporting exercise.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Connect the ad account",
    body: "Sign in with the Facebook login you already use. Pick the pages and forms that matter, map each one to a project, and leads start flowing.",
  },
  {
    n: "02",
    title: "Work the lead the same day",
    body: "New leads land in one queue with the call outcome you record — no pick up, call another time, qualified — and the follow-up scheduled from it.",
  },
  {
    n: "03",
    title: "Close it and get paid",
    body: "Move the deal along the board, tick off the paperwork before a deadline bites, and see the commission split for every party on the deal.",
  },
];

export default function Home() {
  return (
    <div className="min-h-dvh bg-[#07201f] text-white">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#07201f]/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="font-display text-xl font-semibold tracking-tight">
            {AGENCY_NAME}
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-white/70 sm:flex">
            <a href="#how" className="transition-colors hover:text-white">How it works</a>
            <a href="#features" className="transition-colors hover:text-white">Features</a>
            <a href="#team" className="transition-colors hover:text-white">For team leads</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-xl px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:text-white"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-xl bg-[hsl(40_82%_52%)] px-4 py-2 text-sm font-semibold text-[hsl(30_50%_14%)] transition hover:brightness-110"
            >
              Request access
            </Link>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        {/* Two washes rather than a flat panel: the teal lifts the headline off
            the background, the amber keeps the accent present without another
            element competing for attention. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(900px_500px_at_50%_-10%,rgba(45,212,191,0.22),transparent_65%),radial-gradient(600px_400px_at_85%_10%,rgba(234,179,8,0.10),transparent_60%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px]"
        />

        <div className="mx-auto max-w-4xl px-5 pb-20 pt-20 text-center sm:pb-28 sm:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-teal-200">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
            One system for the whole property sale
          </span>

          <h1 className="mt-7 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            The agency runs on this,
            <br />
            <span className="text-teal-300">not on WhatsApp screenshots.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
            {AGENCY_NAME} negotiators work every lead from first enquiry to booked sale on one
            screen — ad leads captured automatically, follow-ups sent in a click, and the
            paperwork, commission and training in the same place.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/sign-up"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(40_82%_52%)] px-7 font-semibold text-[hsl(30_50%_14%)] transition hover:brightness-110 sm:w-auto"
            >
              Request access
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#how"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-7 font-semibold text-white transition hover:bg-white/10 sm:w-auto"
            >
              See how it works
            </a>
          </div>

          <p className="mt-5 text-xs text-white/45">
            For {AGENCY_LEGAL_NAME} negotiators · accounts activated by an administrator
          </p>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="border-t border-white/10 bg-[#061a19]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-300/80">
              How it works
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Three steps, and none of them is data entry
            </h2>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <span className="font-display text-4xl font-semibold text-white/15">{s.n}</span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="features" className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-300/80">
              What is in it
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Built around the way a Malaysian agency actually sells
            </h2>
            <p className="mt-4 text-white/60">
              Not a generic sales CRM with "property" written on it. Setter and closer, project
              sales kits, developer commission splits, PDPA consent on every lead.
            </p>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-[#07201f] p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-400/10 text-teal-300">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- For team leads ---------- */}
      <section id="team" className="border-t border-white/10 bg-[#061a19]">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-300/80">
              For team leads
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              You can see who is working, without asking
            </h2>
            <p className="mt-4 leading-relaxed text-white/60">
              Every call and message an agent logs rolls up to your team screen, next to the leads
              they were given. A quiet week is visible on a Tuesday rather than at the end of the
              month — and a zero is a prompt to ask, never a verdict on its own.
            </p>
            <ul className="mt-7 space-y-3">
              {[
                "Leads routed to the agent whose page produced them",
                "Training videos published to your downline, drafts kept private until you publish",
                "Commission split per deal, snapshotted so a scheme change never rewrites what was agreed",
                "Paperwork deadlines that carry the reason for the date",
              ].map((line) => (
                <li key={line} className="flex gap-3 text-sm text-white/75">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* A restrained mock rather than a screenshot: a real one goes stale the
              next time the funnel card changes, and nobody updates the marketing
              page when they ship. */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-xs uppercase tracking-[0.12em] text-white/40">This month</p>
            <div className="mt-5 space-y-5">
              {[
                { label: "Leads captured", value: "128", meta: "Meta lead forms · 3 campaigns" },
                { label: "Appointments set", value: "41", meta: "32% of leads worked" },
                { label: "Bookings", value: "7", meta: "RM 4.9m gross value" },
              ].map((row) => (
                <div key={row.label} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-white/60">{row.label}</span>
                    <span className="font-display text-2xl font-semibold tabular-nums">{row.value}</span>
                  </div>
                  <p className="mt-1 text-xs text-white/40">{row.meta}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[11px] leading-relaxed text-white/30">
              Illustrative figures, shown to describe the layout.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Closing CTA ---------- */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center sm:py-24">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Already with {AGENCY_NAME}?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/60">
            Sign in and pick up your leads. If you are joining the agency, request access and an
            administrator will activate your account.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(40_82%_52%)] px-7 font-semibold text-[hsl(30_50%_14%)] transition hover:brightness-110 sm:w-auto"
            >
              Log in
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-7 font-semibold text-white transition hover:bg-white/10 sm:w-auto"
            >
              Request access
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-white/10 bg-[#061a19]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {AGENCY_LEGAL_NAME} · powered by {APP_NAME}
          </p>
          <p>Lead data is held under PDPA consent recorded at capture.</p>
        </div>
      </footer>
    </div>
  );
}

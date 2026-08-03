import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  Check,
  Copy,
  Cpu,
  FileSearch,
  History,
  Inbox,
  Link2,
  Lock,
  MessageSquare,
  Minus,
  PenLine,
  ShieldCheck,
  Split,
  Users,
} from "lucide-react";
import { getSession } from "@/server/auth";
import { Badge, ConfidenceChip } from "@/components/ui";
import { Container, CtaLink, GhostLink, Section, SectionHeading } from "./marketing-ui";

export const metadata: Metadata = {
  title: "Kambio — the AI operating system for SME exporters",
  description:
    "Forward a buyer email and Kambio creates the shipment, extracts every field with a confidence score and its source line, and gives your CHA, forwarder and buyer a permissioned room to work in.",
};

const STEPS = [
  {
    icon: Inbox,
    title: "Forward the email",
    body: "Send a buyer enquiry or purchase order to your Kambio address. No integration project, no data migration, no change to how your buyer writes to you.",
  },
  {
    icon: FileSearch,
    title: "Kambio builds the shipment",
    body: "PO number, line items, HS codes, incoterms, amounts and parties are extracted automatically — each field carrying a confidence score and the verbatim source line it came from.",
  },
  {
    icon: Users,
    title: "Bring in the counterparties",
    body: "Your CHA, freight forwarder and buyer get a scoped link into the shipment room. No signup, no licence, no new app — they keep using email and WhatsApp.",
  },
  {
    icon: PenLine,
    title: "You confirm, Kambio relays",
    body: "AI drafts the replies and the relay messages between parties. A human always confirms before anything goes out. Nothing financially consequential is sent by AI.",
  },
];

const FEATURES = [
  {
    icon: Inbox,
    title: "Email-in shipment creation",
    body: "A forwarded buyer email or PO becomes a live shipment record. The inbox stays where your business already runs.",
  },
  {
    icon: FileSearch,
    title: "Extraction with provenance",
    body: "PO number, line items, HS codes, incoterms, amounts and parties — every value shows how confident the model is and the exact line it was read from.",
  },
  {
    icon: Boxes,
    title: "One room per shipment",
    body: "Exporter, CHA, freight forwarder and buyer work against a single shipment record instead of four divergent email threads.",
  },
  {
    icon: Link2,
    title: "Counterparties without accounts",
    body: "A scoped link is all a CHA or a buyer needs. Nobody has to sign up, install anything or learn your software.",
  },
  {
    icon: MessageSquare,
    title: "Drafted replies, human sign-off",
    body: "Kambio writes the response and the relay message. You read it, edit it and send it. The AI never commits on your behalf.",
  },
  {
    icon: History,
    title: "Immutable event log",
    body: "Every state change is recorded as an event that cannot be edited, so the shipment's full history is always reconstructable.",
  },
];

const ROOM_MATRIX: { doc: string; access: boolean[] }[] = [
  { doc: "Purchase order", access: [true, true, false, true] },
  { doc: "Commercial invoice & packing list", access: [true, true, true, true] },
  { doc: "CHA checklist", access: [true, true, false, false] },
  { doc: "Bill of lading", access: [true, false, true, true] },
  { doc: "Internal costing", access: [true, false, false, false] },
];

const PARTIES = ["Exporter", "CHA", "Forwarder", "Buyer"];

const TRUST = [
  {
    icon: ShieldCheck,
    title: "A human confirms everything that matters",
    body: "AI proposes; people decide. Nothing financially consequential — a price, a confirmation, a commitment to a buyer — is sent without a person approving it first.",
  },
  {
    icon: History,
    title: "An audit trail you cannot rewrite",
    body: "Every state change is an immutable event. Who changed what, when, and off which source document is answerable months later without anyone's memory.",
  },
  {
    icon: Lock,
    title: "Access scoped per party",
    body: "Counterparties reach exactly one shipment through a scoped link, and only the documents they are entitled to inside it.",
  },
  {
    icon: Cpu,
    title: "Model-agnostic by design",
    body: "Run Kambio on Anthropic, on OpenAI, or on a model you host yourself. The product does not depend on any single vendor.",
  },
];

export default async function LandingPage() {
  if (await getSession()) redirect("/app");

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <Section className="pt-14 sm:pt-20">
        <Container>
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
            <div>
              <Badge tone="brand" className="rounded-full px-3 py-1 uppercase tracking-[0.18em]">
                For SME exporters
              </Badge>
              <h1 className="mt-6 text-4xl font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                An AI teammate that runs your shipment operations.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
                Forward a buyer email. Kambio creates the shipment, reads every field out of it,
                and opens a permissioned room where your CHA, forwarder and buyer can work — while
                you stay the one who approves what goes out.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <CtaLink href="/signup">Start free</CtaLink>
                <GhostLink href="/demo">Book a demo</GhostLink>
              </div>
              <p className="mt-6 text-xs text-muted">
                Works with the email and WhatsApp threads you already have. No migration.
              </p>
            </div>

            <ExtractionPreview />
          </div>
        </Container>
      </Section>

      {/* ------------------------------------------------------------- problem */}
      <Section className="border-t border-line bg-panel/30">
        <Container>
          <SectionHeading
            eyebrow="The problem"
            title="Right now, you are the integration layer."
            body="The buyer emails. The CHA asks on WhatsApp. The forwarder replies to a different thread. Nothing is connected except a person retyping the same purchase order into three conversations."
          />

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              {
                party: "Buyer",
                channel: "Email",
                line: "Sends the PO, then chases for the invoice, the packing list and the B/L in a thread that has drifted twelve replies deep.",
              },
              {
                party: "CHA",
                channel: "WhatsApp",
                line: "Wants the HS codes and the invoice values again, in a slightly different format, before the checklist can be filed.",
              },
              {
                party: "Freight forwarder",
                channel: "Email",
                line: "Needs weights, ports and dates — and none of it lives anywhere except in your head and three attachments.",
              },
            ].map((c) => (
              <div key={c.party} className="rounded-xl border border-line bg-panel p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{c.party}</h3>
                  <span className="text-[11px] uppercase tracking-wide text-muted">
                    {c.channel}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted">{c.line}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-4 rounded-xl border border-line bg-panel-2 p-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-brand">
              <Copy className="h-4 w-4 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                And in the middle
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              A human copy-paste bridge. The same PO number typed four times, the same HS code
              re-checked in three threads, and one version of the truth that only exists because
              somebody remembers it.
            </p>
          </div>
        </Container>
      </Section>

      {/* --------------------------------------------------------- how it works */}
      <Section id="how-it-works" className="scroll-mt-20 border-t border-line">
        <Container>
          <SectionHeading
            eyebrow="How it works"
            title="Four steps, starting from an email you already received."
            body="Kambio does not ask your buyer or your CHA to change anything. It sits behind the channels you already use and turns them into structure."
          />

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="rounded-xl border border-line bg-panel p-6 transition hover:border-brand-dim/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-brand-dim/30 bg-brand-dim/10 text-brand">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-xs font-semibold tabular-nums tracking-[0.18em] text-brand">
                      STEP {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* ------------------------------------------------------------ features */}
      <Section id="features" className="scroll-mt-20 border-t border-line bg-panel/30">
        <Container>
          <SectionHeading
            eyebrow="Features"
            title="Built for the way export operations actually run."
            body="Not a CRM with a shipping tab. A shipment record that reads its own paperwork and keeps four parties honest about the same set of facts."
          />

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="rounded-xl border border-line bg-panel p-6">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel-2 text-brand">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="mt-4 font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* ------------------------------------------------------- shipment room */}
      <Section id="shipment-room" className="scroll-mt-20 border-t border-line">
        <Container>
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <SectionHeading
                eyebrow="The shipment room"
                title="One room per shipment. Four parties. Four different views."
                body="Every shipment is a permissioned room shared by the exporter, the CHA, the freight forwarder and the buyer. Each party sees only the documents they are entitled to — the CHA's checklist is never visible to the buyer."
              />

              <ul className="mt-8 space-y-4">
                {[
                  {
                    icon: Split,
                    text: "Nobody is bcc'd into a thread they should not be reading. Visibility is a property of the room, not of who remembered to trim the recipients.",
                  },
                  {
                    icon: Link2,
                    text: "Counterparties need no signup. They get a scoped link and keep replying on email or WhatsApp exactly as before.",
                  },
                  {
                    icon: History,
                    text: "Everything that happens in the room lands in the shipment's immutable event log, so the trail survives staff turnover.",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.text} className="flex gap-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      <span className="text-sm leading-relaxed text-muted">{item.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-xl border border-line bg-panel">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h3 className="text-sm font-semibold tracking-tight">Who sees what</h3>
                <span className="text-[11px] text-muted">Example room</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                      <th className="px-4 py-3 text-left font-medium">Document</th>
                      {PARTIES.map((p) => (
                        <th key={p} className="px-3 py-3 text-center font-medium">
                          {p}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROOM_MATRIX.map((row) => (
                      <tr key={row.doc} className="border-b border-line last:border-0">
                        <td className="px-4 py-3 text-muted">{row.doc}</td>
                        {row.access.map((allowed, i) => (
                          <td key={`${row.doc}-${PARTIES[i] ?? i}`} className="px-3 py-3">
                            <span className="flex justify-center">
                              {allowed ? (
                                <Check className="h-4 w-4 text-brand" />
                              ) : (
                                <Minus className="h-4 w-4 text-muted/40" />
                              )}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-muted">
                Illustrative. You decide what each party is entitled to on a shipment.
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* --------------------------------------------------------------- trust */}
      <Section id="trust" className="scroll-mt-20 border-t border-line bg-panel/30">
        <Container>
          <SectionHeading
            eyebrow="Trust & security"
            title="AI drafts. People decide. The record keeps itself."
            body="Export operations carry money and legal exposure. Kambio is built so that automation never becomes an unaccountable actor in your business."
          />

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {TRUST.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.title} className="rounded-xl border border-line bg-panel p-6">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel-2 text-brand">
                      <Icon className="h-4 w-4" />
                    </span>
                    <h3 className="font-semibold tracking-tight">{t.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{t.body}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* ----------------------------------------------------------- final CTA */}
      <Section className="border-t border-line">
        <Container>
          <div className="rounded-2xl border border-line bg-panel px-6 py-12 text-center sm:px-12 sm:py-16">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl">
              Stop being the bridge between your buyer, your CHA and your forwarder.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted">
              Forward one email and see the shipment build itself — fields, sources, confidence and
              all. It takes a few minutes and nothing has to change on your counterparties&rsquo;
              side.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <CtaLink href="/signup">Start free</CtaLink>
              <GhostLink href="/demo">Book a demo</GhostLink>
            </div>
            <p className="mt-8 text-xs text-muted">
              Questions first?{" "}
              <a href="/contact" className="text-brand hover:underline">
                Talk to us
              </a>
              .
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------------- */

/** The hero visual: a raw buyer email on one side, structured fields on the other. */
function ExtractionPreview() {
  const fields = [
    { label: "PO number", value: "PO-4471-SE", confidence: 0.97, source: "Purchase Order No: PO-4471-SE" },
    { label: "Incoterm", value: "CIF", confidence: 0.94, source: "Incoterm: CIF Gothenburg" },
    { label: "HS code", value: "5209.42", confidence: 0.88, source: "Indigo denim 12oz | 5209.42" },
    { label: "Amount", value: "USD 31,200.00", confidence: 0.72, source: "Total: 31200.00" },
  ];

  return (
    <div className="relative">
      <div className="rounded-xl border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <Inbox className="h-3.5 w-3.5 text-muted" />
            <span className="text-xs text-muted">Forwarded buyer email</span>
          </div>
          <Badge tone="brand">Parsed</Badge>
        </div>
        <div className="space-y-1 px-4 py-4 font-mono text-[11px] leading-relaxed text-muted">
          <p className="text-fg">Subject: Purchase Order — denim programme</p>
          <p>Purchase Order No: PO-4471-SE</p>
          <p>Incoterm: CIF Gothenburg</p>
          <p>Indigo denim 12oz | 5209.42 | 6000 | 5.20</p>
          <p>Total: 31200.00</p>
        </div>

        <div className="flex items-center gap-2 border-y border-line bg-panel-2 px-4 py-2.5 text-[11px] text-muted">
          <ArrowRight className="h-3.5 w-3.5 text-brand" />
          Extracted with source and confidence
        </div>

        <div className="divide-y divide-line">
          {fields.map((f) => (
            <div
              key={f.label}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-muted">{f.label}</div>
                <div className="truncate text-sm font-medium tabular-nums">{f.value}</div>
              </div>
              <ConfidenceChip confidence={f.confidence} source={f.source} />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-4 py-3 text-[11px] text-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-brand" />
          Low-confidence fields wait for a human before anything is sent.
        </div>
      </div>
    </div>
  );
}

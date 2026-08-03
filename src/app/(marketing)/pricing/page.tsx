import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { Container, CtaLink, GhostLink, Section, SectionHeading } from "../marketing-ui";

export const metadata: Metadata = {
  title: "Pricing — Kambio",
  description:
    "Three plans for SME exporters: Starter, Growth and Scale. Priced per month with a shipment allowance, unlimited counterparties and no per-seat charge for your CHA, forwarder or buyer.",
};

type Tier = {
  name: string;
  price: string;
  tagline: string;
  allowance: string;
  features: string[];
  cta: { href: string; label: string };
  popular?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Starter",
    price: "$149",
    tagline: "For an exporter running shipments out of one inbox.",
    allowance: "Up to 25 shipments / month",
    features: [
      "Email-in shipment creation",
      "Field extraction with confidence scores and source lines",
      "Permissioned shipment rooms",
      "Scoped links for CHA, forwarder and buyer — no signup for them",
      "AI-drafted replies with human confirmation",
      "Immutable event log on every shipment",
      "3 internal users",
      "Email support",
    ],
    cta: { href: "/signup", label: "Start free" },
  },
  {
    name: "Growth",
    price: "$399",
    tagline: "For a desk where several people share the shipment load.",
    allowance: "Up to 100 shipments / month",
    features: [
      "Everything in Starter",
      "10 internal users",
      "WhatsApp relay alongside email",
      "Per-role document checklists in the shipment room",
      "Full audit trail export",
      "Choice of AI provider — Anthropic or OpenAI",
      "Priority email support",
    ],
    cta: { href: "/signup", label: "Start free" },
    popular: true,
  },
  {
    name: "Scale",
    price: "$899",
    tagline: "For multi-desk operations with compliance obligations.",
    allowance: "Up to 400 shipments / month",
    features: [
      "Everything in Growth",
      "Unlimited internal users",
      "Self-hosted model deployment",
      "Multiple desks and export entities",
      "Guided onboarding and a named support contact",
    ],
    cta: { href: "/demo", label: "Talk to us" },
  },
];

const FAQ = [
  {
    q: "What counts as a shipment?",
    a: "One shipment record — created when you forward a buyer email or PO — regardless of how many documents, messages or counterparties it ends up carrying. A shipment counts once, in the month it was created.",
  },
  {
    q: "Do my CHA, freight forwarder and buyer need licences?",
    a: "No. Counterparties never sign up. They get a scoped link into the shipment room and keep working over email and WhatsApp. You only pay for internal users.",
  },
  {
    q: "Can the AI send something to a buyer on its own?",
    a: "No. Kambio drafts replies and relay messages, but a human always confirms. Nothing financially consequential is sent by AI, on any plan.",
  },
  {
    q: "Which AI model does Kambio use?",
    a: "Kambio is model-agnostic. It runs on Anthropic or OpenAI, and on Scale you can point it at a model you host yourself.",
  },
  {
    q: "What happens if I go over my shipment allowance?",
    a: "Nothing breaks and nothing is blocked mid-shipment. We flag it and move you to the next plan at the start of the following cycle.",
  },
  {
    q: "How do I get my data out?",
    a: "Every state change is an immutable event, so the complete shipment history is exportable — not just the current snapshot.",
  },
];

export default function PricingPage() {
  return (
    <>
      <Section className="pb-8 pt-14 sm:pt-20">
        <Container>
          <SectionHeading
            eyebrow="Pricing"
            title="Priced per shipment desk, not per counterparty."
            body="Your CHA, freight forwarder and buyer never pay and never sign up. You pay for the shipments your team runs."
          />
        </Container>
      </Section>

      <Section className="pt-0">
        <Container>
          <div className="grid gap-5 lg:grid-cols-3">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={cn(
                  "flex flex-col rounded-xl border bg-panel p-6",
                  tier.popular
                    ? "border-brand-dim/60 ring-1 ring-brand-dim/30"
                    : "border-line",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">{tier.name}</h2>
                  {tier.popular ? <Badge tone="brand">Most popular</Badge> : null}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{tier.tagline}</p>

                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tracking-tight tabular-nums">
                    {tier.price}
                  </span>
                  <span className="text-sm text-muted">/ month</span>
                </div>
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-brand">
                  {tier.allowance}
                </p>

                <div className="mt-6">
                  {tier.popular ? (
                    <CtaLink href={tier.cta.href} className="w-full" withArrow={false}>
                      {tier.cta.label}
                    </CtaLink>
                  ) : (
                    <GhostLink href={tier.cta.href} className="w-full">
                      {tier.cta.label}
                    </GhostLink>
                  )}
                </div>

                <ul className="mt-7 space-y-3 border-t border-line pt-6">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      <span className="text-sm leading-relaxed text-muted">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-6 text-xs text-muted">
            Prices in USD, billed monthly. Higher volumes and multi-entity setups are quoted —{" "}
            <Link href="/contact" className="text-brand hover:underline">
              tell us what you run
            </Link>
            .
          </p>
        </Container>
      </Section>

      <Section className="border-t border-line bg-panel/30">
        <Container>
          <SectionHeading eyebrow="FAQ" title="Questions we get before the first shipment." />

          <dl className="mt-12 grid gap-4 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-xl border border-line bg-panel p-6">
                <dt className="font-semibold tracking-tight">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted">{item.a}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <CtaLink href="/signup">Start free</CtaLink>
            <GhostLink href="/demo">Book a demo</GhostLink>
          </div>
        </Container>
      </Section>
    </>
  );
}

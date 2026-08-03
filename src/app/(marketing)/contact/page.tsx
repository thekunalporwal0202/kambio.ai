import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import { Container, Section, SectionHeading } from "../marketing-ui";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact — Kambio",
  description:
    "Talk to the team behind Kambio. Ask about the shipment room, pricing, self-hosted models or anything else before you start.",
};

const CHANNELS = [
  {
    icon: Mail,
    label: "Sales and general",
    value: "hello@kambio.ai",
    href: "mailto:hello@kambio.ai",
    note: "Pricing, plans, whether Kambio fits how your desk runs.",
  },
  {
    icon: LifeBuoy,
    label: "Support",
    value: "support@kambio.ai",
    href: "mailto:support@kambio.ai",
    note: "Already using Kambio and something is off? Start here.",
  },
  {
    icon: ShieldCheck,
    label: "Security and data",
    value: "security@kambio.ai",
    href: "mailto:security@kambio.ai",
    note: "Model hosting, data handling, audit trail and access questions.",
  },
];

export default function ContactPage() {
  return (
    <Section className="pt-14 sm:pt-20">
      <Container>
        <SectionHeading
          eyebrow="Contact"
          title="Tell us what your shipment desk looks like."
          body="We answer with people, not a ticket queue. If your question is about how Kambio would handle your particular buyer, CHA or forwarder, say so — that is the useful conversation."
        />

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14">
          <div className="rounded-xl border border-line bg-panel p-6 sm:p-8">
            <ContactForm />
          </div>

          <div className="space-y-4">
            {CHANNELS.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="rounded-xl border border-line bg-panel p-5">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel-2 text-brand">
                      <Icon className="h-4 w-4" />
                    </span>
                    <h2 className="text-sm font-semibold tracking-tight">{c.label}</h2>
                  </div>
                  <a
                    href={c.href}
                    className="mt-3 block break-all text-sm text-brand hover:underline"
                  >
                    {c.value}
                  </a>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{c.note}</p>
                </div>
              );
            })}

            <div className="rounded-xl border border-line bg-panel-2 p-5">
              <div className="flex items-center gap-2.5">
                <CalendarClock className="h-4 w-4 text-brand" />
                <h2 className="text-sm font-semibold tracking-tight">Would rather see it run?</h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                A demo is faster than a thread. We forward a real purchase order and you watch the
                shipment build itself.
              </p>
              <Link
                href="/demo"
                className="mt-3 inline-block text-sm font-medium text-brand hover:underline"
              >
                Book a demo
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}

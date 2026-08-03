import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section, SectionHeading } from "../marketing-ui";

export const metadata: Metadata = {
  title: "Privacy — Kambio",
  description: "How to reach us about privacy, data processing and where your documents are handled.",
};

export default function PrivacyPage() {
  return (
    <Section className="pt-14 sm:pt-20">
      <Container>
        <SectionHeading
          eyebrow="Privacy"
          title="Privacy and data processing."
          body="Our current privacy notice and data processing agreement are issued on request — we would rather hand you the version that applies to your contract than publish one that does not."
        />

        <div className="mt-10 max-w-2xl space-y-4 text-sm leading-relaxed text-muted">
          <p>
            Shipment documents, extracted fields and the event log belong to your organisation.
            Access inside a shipment room is scoped per party, and counterparties reach only the
            shipment they were given a link to.
          </p>
          <p>
            Kambio is model-agnostic: it can run on Anthropic, on OpenAI, or on a model you host
            yourself, which is the lever most customers care about when they ask where their
            documents are processed.
          </p>
          <p>
            For the full notice, a DPA, or a specific question about how your data is handled,
            email{" "}
            <a href="mailto:security@kambio.ai" className="text-brand hover:underline">
              security@kambio.ai
            </a>{" "}
            or{" "}
            <Link href="/contact" className="text-brand hover:underline">
              use the contact form
            </Link>
            .
          </p>
        </div>
      </Container>
    </Section>
  );
}

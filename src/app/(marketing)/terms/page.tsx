import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section, SectionHeading } from "../marketing-ui";

export const metadata: Metadata = {
  title: "Terms — Kambio",
  description: "How to obtain the terms of service that apply to your Kambio subscription.",
};

export default function TermsPage() {
  return (
    <Section className="pt-14 sm:pt-20">
      <Container>
        <SectionHeading
          eyebrow="Terms"
          title="Terms of service."
          body="The terms that govern your subscription are issued with your plan. Ask us and we will send the current version before you commit to anything."
        />

        <div className="mt-10 max-w-2xl space-y-4 text-sm leading-relaxed text-muted">
          <p>
            One point is worth stating up front, because it is a product decision rather than a
            legal one: Kambio drafts, humans confirm. Nothing financially consequential is sent by
            AI on your behalf, on any plan.
          </p>
          <p>
            For a copy of the current terms, email{" "}
            <a href="mailto:hello@kambio.ai" className="text-brand hover:underline">
              hello@kambio.ai
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

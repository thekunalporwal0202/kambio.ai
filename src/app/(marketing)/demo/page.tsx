import type { Metadata } from "next";
import Link from "next/link";
import { Cpu, FileSearch, History, Inbox, PenLine, Users } from "lucide-react";
import { Container, Section, SectionHeading } from "../marketing-ui";
import { DemoForm } from "./demo-form";

export const metadata: Metadata = {
  title: "Book a demo — Kambio",
  description:
    "Thirty minutes, screen-shared. We forward a real purchase order, build the shipment live, and open the permissioned room the way your CHA, forwarder and buyer would see it.",
};

const AGENDA = [
  {
    icon: Inbox,
    title: "A real email, forwarded live",
    body: "Bring one of your own buyer emails or purchase orders. We start from that, not from a sanitised sample.",
  },
  {
    icon: FileSearch,
    title: "The extraction, field by field",
    body: "PO number, line items, HS codes, incoterms, amounts and parties — with the confidence score and the verbatim source line behind each one.",
  },
  {
    icon: Users,
    title: "The room from four sides",
    body: "We switch between the exporter, CHA, forwarder and buyer views so you can see exactly what each party is and is not shown.",
  },
  {
    icon: PenLine,
    title: "Where the human stays in charge",
    body: "How Kambio drafts a reply, and what confirmation looks like before anything financially consequential leaves your desk.",
  },
  {
    icon: History,
    title: "The audit trail",
    body: "How every state change lands as an immutable event, and what that gives you months later when someone asks who changed what.",
  },
  {
    icon: Cpu,
    title: "Your model, your call",
    body: "Running on Anthropic, OpenAI or a model you host yourself — and what that means for where your documents go.",
  },
];

export default function DemoPage() {
  return (
    <Section className="pt-14 sm:pt-20">
      <Container>
        <SectionHeading
          eyebrow="Book a demo"
          title="Thirty minutes. Your purchase order, not our sample data."
          body="We would rather show you the product working on a document you recognise than walk you through slides. Tell us a bit about your desk and we will send times."
        />

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
          <div className="rounded-xl border border-line bg-panel p-6 sm:p-8">
            <DemoForm />
          </div>

          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              What the demo covers
            </h2>
            <ul className="mt-5 space-y-4">
              {AGENDA.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.title} className="flex gap-3.5">
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-panel-2 text-brand">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight">{item.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{item.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="mt-8 rounded-xl border border-line bg-panel-2 p-4 text-xs leading-relaxed text-muted">
              In a hurry?{" "}
              <Link href="/signup" className="text-brand hover:underline">
                Start free
              </Link>{" "}
              and forward an email yourself — the first shipment takes a few minutes. Or{" "}
              <Link href="/contact" className="text-brand hover:underline">
                send us a question
              </Link>{" "}
              instead.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}

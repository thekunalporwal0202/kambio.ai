import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FileCheck2, Inbox, ShieldCheck } from "lucide-react";
import { getSession } from "@/server/auth";

export default async function Landing() {
  if (await getSession()) redirect("/app");

  const steps = [
    {
      icon: <Inbox className="h-4 w-4" />,
      title: "Forward the email",
      body: "Send a buyer PO or enquiry to your Kambio address. No integration, no migration.",
    },
    {
      icon: <FileCheck2 className="h-4 w-4" />,
      title: "Get structured data",
      body: "Kambio creates the shipment and extracts PO numbers, HS codes, incoterms and amounts — each with a confidence score and the exact source line.",
    },
    {
      icon: <ShieldCheck className="h-4 w-4" />,
      title: "You confirm, AI never commits",
      body: "Kambio drafts the reply and proposes the status change. Nothing financially consequential happens without your tap.",
    },
  ];

  return (
    <main>
      <header className="border-b border-line">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">
            kambio<span className="text-brand">.</span>
          </span>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/login" className="text-muted transition hover:text-fg">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand-dim px-4 py-2 font-semibold text-[#04120c] transition hover:bg-brand"
            >
              Start free
            </Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <p className="mb-5 inline-flex rounded-full border border-line bg-panel px-3 py-1 text-xs uppercase tracking-widest text-brand">
          For SME exporters
        </p>
        <h1 className="max-w-3xl text-5xl font-bold leading-[1.08] tracking-tight">
          An AI teammate that runs your shipment operations.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Every shipment becomes a living workspace. Your buyers, CHA and forwarder keep using
          email and WhatsApp — Kambio structures it into one source of truth, and asks you before
          it does anything that matters.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-dim px-6 py-3 font-semibold text-[#04120c] transition hover:bg-brand"
          >
            Start free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-line px-6 py-3 font-semibold text-muted transition hover:border-brand-dim hover:text-fg"
          >
            Sign in to the demo
          </Link>
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-xl border border-line bg-panel p-5">
              <div className="mb-3 flex items-center gap-2 text-brand">
                {s.icon}
                <span className="text-xs font-semibold tabular-nums">STEP {i + 1}</span>
              </div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-8 text-xs text-muted">
          Kambio MVP · event-sourced shipment ledger · model-agnostic AI · human-in-the-loop by
          default
        </div>
      </footer>
    </main>
  );
}

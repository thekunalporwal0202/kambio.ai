import Link from "next/link";

const features = [
  {
    title: "Conversational AI",
    body: "Chat with a Claude-powered assistant that understands context, follows up, and gets real work done.",
  },
  {
    title: "Streaming responses",
    body: "Answers appear token by token, so you never wait staring at a spinner.",
  },
  {
    title: "Built to extend",
    body: "A clean Next.js + TypeScript foundation ready for auth, billing, tools, and your own workflows.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6">
      <section className="flex flex-col items-center py-24 text-center">
        <span className="mb-6 rounded-full border border-border-soft bg-surface px-4 py-1 text-xs uppercase tracking-widest text-accent">
          Powered by Claude
        </span>
        <h1 className="max-w-2xl text-5xl font-bold leading-tight tracking-tight">
          Change the way you work with{" "}
          <span className="text-accent">Kambio.AI</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-foreground/70">
          An AI assistant platform that answers questions, drafts documents,
          and automates the busywork — so you can focus on what matters.
        </p>
        <div className="mt-10 flex gap-4">
          <Link
            href="/chat"
            className="rounded-xl bg-accent-dim px-6 py-3 font-semibold text-background transition hover:bg-accent"
          >
            Try the assistant
          </Link>
          <a
            href="https://github.com/thekunalporwal0202"
            className="rounded-xl border border-border-soft px-6 py-3 font-semibold text-foreground/80 transition hover:border-accent hover:text-foreground"
          >
            View on GitHub
          </a>
        </div>
      </section>

      <section className="grid gap-6 pb-24 md:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-border-soft bg-surface p-6"
          >
            <h3 className="mb-2 font-semibold text-accent">{f.title}</h3>
            <p className="text-sm leading-relaxed text-foreground/70">
              {f.body}
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}

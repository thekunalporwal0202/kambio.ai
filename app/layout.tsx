import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kambio.AI — Your AI copilot for work",
  description:
    "Kambio.AI is an AI assistant platform powered by Claude. Chat, analyze, and automate your work.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-10 border-b border-border-soft bg-background/80 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              kambio<span className="text-accent">.AI</span>
            </Link>
            <div className="flex items-center gap-6 text-sm text-foreground/70">
              <Link href="/chat" className="hover:text-foreground">
                Chat
              </Link>
              <Link
                href="/chat"
                className="rounded-lg bg-accent-dim px-4 py-2 font-medium text-background hover:bg-accent"
              >
                Get started
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}

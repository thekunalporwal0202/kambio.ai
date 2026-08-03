import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, LayoutGrid, LogOut } from "lucide-react";
import { getSession } from "@/server/auth";
import { signOutAction } from "../auth-actions";
import { ai } from "@/server/ai/gateway";
import { env } from "@/env";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/app" className="text-base font-semibold tracking-tight">
              kambio<span className="text-brand">.</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/app"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted transition hover:bg-panel-2 hover:text-fg"
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Command center
              </Link>
              <Link
                href="/app/analytics"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted transition hover:bg-panel-2 hover:text-fg"
              >
                <BarChart3 className="h-3.5 w-3.5" /> ROI
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {/* Operators should always know which model is answering. */}
            <span
              className="rounded-md border border-line px-2 py-1 text-muted"
              title={`AI provider: ${ai.activeProvider()} · model: ${env.AI_MODEL}`}
            >
              AI: <span className="text-fg">{ai.activeProvider()}</span>
            </span>
            <div className="text-right">
              <div className="font-medium">{session.name}</div>
              <div className="text-muted">{session.orgName}</div>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                title="Sign out"
                className="rounded-lg border border-line p-2 text-muted transition hover:text-fg"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}

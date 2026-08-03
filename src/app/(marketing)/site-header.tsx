"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Route changes should never leave the mobile sheet hanging open.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          kambio<span className="text-brand">.</span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-1.5 text-muted transition hover:bg-panel-2 hover:text-fg"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 text-sm md:flex">
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

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-line p-2 text-muted transition hover:text-fg md:hidden"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      <div
        className={cn(
          "border-t border-line bg-bg md:hidden",
          open ? "block animate-in" : "hidden",
        )}
      >
        <div className="mx-auto w-full max-w-6xl space-y-1 px-5 py-4 sm:px-6">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-panel-2 hover:text-fg"
            >
              {item.label}
            </Link>
          ))}
          <div className="flex items-center gap-3 pt-3">
            <Link
              href="/login"
              className="flex-1 rounded-lg border border-line px-4 py-2 text-center text-sm font-medium text-muted transition hover:text-fg"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="flex-1 rounded-lg bg-brand-dim px-4 py-2 text-center text-sm font-semibold text-[#04120c] transition hover:bg-brand"
            >
              Start free
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

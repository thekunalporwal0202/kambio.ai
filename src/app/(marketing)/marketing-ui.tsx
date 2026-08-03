import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Page-width wrapper used by every marketing section. */
export function Container({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-6", className)} {...props} />;
}

export function Section({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("py-16 sm:py-24", className)} {...props} />;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex rounded-full border border-line bg-panel px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-brand">
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  className,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2
        className={cn(
          "text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl",
          eyebrow && "mt-5",
        )}
      >
        {title}
      </h2>
      {body ? (
        <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">{body}</p>
      ) : null}
    </div>
  );
}

/** Solid brand call-to-action. Matches the `primary` button treatment. */
export function CtaLink({
  href,
  children,
  className,
  withArrow = true,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  withArrow?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-brand-dim px-5 py-3 text-sm font-semibold text-[#04120c] transition hover:bg-brand",
        className,
      )}
    >
      {children}
      {withArrow ? <ArrowRight className="h-4 w-4" /> : null}
    </Link>
  );
}

/** Outlined secondary call-to-action. */
export function GhostLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-line px-5 py-3 text-sm font-semibold text-muted transition hover:border-brand-dim hover:text-fg",
        className,
      )}
    >
      {children}
    </Link>
  );
}

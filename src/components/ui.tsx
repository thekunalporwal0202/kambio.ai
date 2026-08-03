import * as React from "react";
import { cn, confidenceTone, pct } from "@/lib/utils";

/** Minimal shadcn-flavoured primitives, hand-written to avoid a generator step. */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-line bg-panel", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-line px-4 py-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold tracking-tight", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({
  className,
  variant = "secondary",
  size = "md",
  ...props
}: ButtonProps) {
  const variants: Record<string, string> = {
    primary: "bg-brand-dim text-[#04120c] hover:bg-brand font-semibold",
    secondary: "border border-line bg-panel-2 hover:border-brand-dim text-fg",
    ghost: "hover:bg-panel-2 text-muted hover:text-fg",
    danger: "border border-danger/40 text-danger hover:bg-danger/10",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm outline-none placeholder:text-muted/60 focus:border-brand-dim",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm outline-none placeholder:text-muted/60 focus:border-brand-dim",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-xs font-medium text-muted", className)}
      {...props}
    />
  );
}

type BadgeTone = "neutral" | "brand" | "warn" | "danger" | "info";

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    neutral: "border-line bg-panel-2 text-muted",
    brand: "border-brand-dim/40 bg-brand-dim/10 text-brand",
    warn: "border-warn/40 bg-warn/10 text-warn",
    danger: "border-danger/40 bg-danger/10 text-danger",
    info: "border-info/40 bg-info/10 text-info",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone: BadgeTone =
    status === "DELIVERED" || status === "CLOSED"
      ? "brand"
      : status === "CANCELLED"
        ? "danger"
        : status === "IN_TRANSIT"
          ? "info"
          : "neutral";
  const labels: Record<string, string> = {
    DRAFT: "Draft",
    PO_CONFIRMED: "PO confirmed",
    DOCS_IN_PREP: "Docs in prep",
    READY_TO_SHIP: "Ready to ship",
    IN_TRANSIT: "In transit",
    DELIVERED: "Delivered",
    CLOSED: "Closed",
    CANCELLED: "Cancelled",
  };
  return <Badge tone={tone}>{labels[status] ?? status}</Badge>;
}

/**
 * The provenance chip. Every AI-derived value in the product renders one of
 * these — confidence plus the verbatim source it came from.
 */
export function ConfidenceChip({
  confidence,
  source,
  className,
}: {
  confidence: number | null | undefined;
  source?: string | null;
  className?: string;
}) {
  const tone = confidenceTone(confidence);
  const map = {
    high: "border-brand-dim/40 bg-brand-dim/10 text-brand",
    medium: "border-warn/40 bg-warn/10 text-warn",
    low: "border-danger/40 bg-danger/10 text-danger",
    unknown: "border-line bg-panel-2 text-muted",
  } as const;

  return (
    <span
      title={source ? `Source: “${source}”` : "No source recorded"}
      className={cn(
        "inline-flex cursor-help items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
        map[tone],
        className,
      )}
    >
      {pct(confidence)} {tone === "high" ? "confident" : tone === "unknown" ? "" : "— check"}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
      {icon ? <div className="mb-3 text-muted">{icon}</div> : null}
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-1 max-w-sm text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
}

export function formatMoney(value: unknown, currency?: string | null) {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${currency ? `${currency} ` : ""}${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PO_CONFIRMED: "PO confirmed",
  DOCS_IN_PREP: "Docs in prep",
  READY_TO_SHIP: "Ready to ship",
  IN_TRANSIT: "In transit",
  DELIVERED: "Delivered",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

export const STATUS_ORDER = [
  "DRAFT",
  "PO_CONFIRMED",
  "DOCS_IN_PREP",
  "READY_TO_SHIP",
  "IN_TRANSIT",
  "DELIVERED",
  "CLOSED",
];

/** Confidence → UI treatment. Consistent everywhere AI output is shown. */
export function confidenceTone(confidence: number | null | undefined) {
  if (confidence === null || confidence === undefined) return "unknown" as const;
  if (confidence >= 0.85) return "high" as const;
  if (confidence >= 0.6) return "medium" as const;
  return "low" as const;
}

export function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}

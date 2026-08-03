import { prisma } from "../db";
import { env } from "@/env";

/**
 * Route an inbound message to a shipment. Ordered from most to least certain.
 * Returns null when nothing matches — the caller then creates a new shipment.
 */
export type RouteMatch = {
  orgId: string;
  shipmentId: string | null;
  /** How we matched — surfaced in the UI so routing is never a black box. */
  reason: string;
};

/** ship+<token>@domain routes straight to one shipment. */
export async function routeByAddress(address: string): Promise<RouteMatch | null> {
  const local = address.split("@")[0]?.toLowerCase() ?? "";
  const token = local.includes("+") ? local.split("+")[1] : null;
  if (!token) return null;

  const shipment = await prisma.shipment.findUnique({
    where: { inboundToken: token },
    select: { id: true, orgId: true },
  });
  if (shipment) {
    return { orgId: shipment.orgId, shipmentId: shipment.id, reason: "per-shipment address" };
  }

  const org = await prisma.org.findUnique({ where: { inboundKey: token }, select: { id: true } });
  if (org) return { orgId: org.id, shipmentId: null, reason: "org intake address" };

  return null;
}

/** A quoted PO/invoice/BL reference is a strong signal. */
export async function routeByReference(orgId: string, text: string): Promise<RouteMatch | null> {
  const candidates = new Set<string>();
  for (const re of [
    /\bKMB-\d{4}-\d{3}\b/gi,
    /\b(?:P\.?O\.?|purchase\s+order)\s*(?:no\.?|#|:)?\s*([A-Z0-9][A-Z0-9\-\/]{3,})/gi,
    /\binvoice\s*(?:no\.?|#|:)\s*([A-Z0-9][A-Z0-9\-\/]{2,})/gi,
  ]) {
    for (const m of text.matchAll(re)) candidates.add((m[1] ?? m[0]).trim());
  }
  if (!candidates.size) return null;

  const list = [...candidates];
  const shipment = await prisma.shipment.findFirst({
    where: {
      orgId,
      OR: [
        { reference: { in: list, mode: "insensitive" } },
        { poNumber: { in: list, mode: "insensitive" } },
        { invoiceNumber: { in: list, mode: "insensitive" } },
        { carrierRef: { in: list, mode: "insensitive" } },
      ],
    },
    select: { id: true, orgId: true },
    orderBy: { updatedAt: "desc" },
  });

  return shipment
    ? { orgId: shipment.orgId, shipmentId: shipment.id, reason: `reference match (${list[0]})` }
    : null;
}

/** Fall back to the sender's most recent active shipment. */
export async function routeByParty(args: {
  orgId?: string;
  email?: string | null;
  phone?: string | null;
}): Promise<RouteMatch | null> {
  if (!args.email && !args.phone) return null;

  const party = await prisma.party.findFirst({
    where: {
      ...(args.orgId ? { orgId: args.orgId } : {}),
      OR: [
        ...(args.email ? [{ email: { equals: args.email, mode: "insensitive" as const } }] : []),
        ...(args.phone ? [{ phone: normalizePhone(args.phone) }] : []),
      ],
      shipment: { status: { notIn: ["CLOSED", "CANCELLED"] } },
    },
    orderBy: { createdAt: "desc" },
    select: { orgId: true, shipmentId: true },
  });

  return party
    ? { orgId: party.orgId, shipmentId: party.shipmentId, reason: "known counterparty" }
    : null;
}

export function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : raw;
}

export function shipmentInboundAddress(token: string) {
  return `ship+${token}@${env.INBOUND_EMAIL_DOMAIN}`;
}

export function orgInboundAddress(key: string) {
  return `po+${key}@${env.INBOUND_EMAIL_DOMAIN}`;
}

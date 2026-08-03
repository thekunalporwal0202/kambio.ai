import type { ShipmentStatusValue } from "./events";

/**
 * Pure, in-memory fold of the event ledger.
 *
 * This module has NO database access on purpose: it is the piece we can unit
 * test exhaustively, and the definition of "what the events mean".
 */

export type TradeState = {
  poNumber?: string | null;
  invoiceNumber?: string | null;
  incoterm?: string | null;
  currency?: string | null;
  totalValue?: number | null;
  originPort?: string | null;
  destPort?: string | null;
  originCountry?: string | null;
  destCountry?: string | null;
  etd?: string | null;
  eta?: string | null;
  carrierRef?: string | null;
};

export type ShipmentProjection = {
  status: ShipmentStatusValue;
  reference: string | null;
  title: string | null;
  trade: TradeState;
  partyIds: string[];
  /** documentId -> latest known state */
  documents: Record<
    string,
    { family: string; version: number; confirmed: boolean; confidence: number | null }
  >;
  openTaskIds: string[];
  approvals: Record<string, "REQUESTED" | "GRANTED" | "REJECTED">;
  messageCount: number;
  /** Counts used by the ROI analytics — derived, never stored by hand. */
  stats: {
    documentsExtracted: number;
    fieldsConfirmed: number;
    inboundMessages: number;
    aiDraftsAccepted: number;
    buyerLinkViews: number;
  };
  eventCount: number;
};

export function emptyProjection(): ShipmentProjection {
  return {
    status: "DRAFT",
    reference: null,
    title: null,
    trade: {},
    partyIds: [],
    documents: {},
    openTaskIds: [],
    approvals: {},
    messageCount: 0,
    stats: {
      documentsExtracted: 0,
      fieldsConfirmed: 0,
      inboundMessages: 0,
      aiDraftsAccepted: 0,
      buyerLinkViews: 0,
    },
    eventCount: 0,
  };
}

/** Fold one event into state. Must be pure and total (unknown types are no-ops). */
export function applyEvent(
  state: ShipmentProjection,
  type: string,
  rawPayload: Record<string, unknown>,
): ShipmentProjection {
  const p = rawPayload as Record<string, any>;
  const next: ShipmentProjection = {
    ...state,
    trade: { ...state.trade },
    partyIds: [...state.partyIds],
    documents: { ...state.documents },
    openTaskIds: [...state.openTaskIds],
    approvals: { ...state.approvals },
    stats: { ...state.stats },
    eventCount: state.eventCount + 1,
  };

  switch (type) {
    case "shipment.created":
      next.reference = p.reference ?? null;
      next.title = p.title ?? null;
      next.status = "DRAFT";
      if (p.trade) Object.assign(next.trade, stripNullish(p.trade));
      break;

    case "shipment.status_changed":
      next.status = p.to;
      break;

    case "shipment.fields_updated":
      Object.assign(next.trade, stripNullish(p.trade ?? {}));
      break;

    case "party.added":
      if (p.partyId && !next.partyIds.includes(p.partyId)) next.partyIds.push(p.partyId);
      break;

    case "document.uploaded":
      next.documents[p.documentId] = {
        family: p.family,
        version: p.version,
        confirmed: false,
        confidence: null,
      };
      break;

    case "document.extraction_completed": {
      const doc = next.documents[p.documentId];
      if (doc) doc.confidence = p.overallConfidence ?? null;
      next.stats.documentsExtracted += 1;
      break;
    }

    case "document.fields_confirmed": {
      const doc = next.documents[p.documentId];
      if (doc) doc.confirmed = true;
      next.stats.fieldsConfirmed += 1;
      break;
    }

    case "message.received":
      next.messageCount += 1;
      next.stats.inboundMessages += 1;
      break;

    case "message.sent":
      next.messageCount += 1;
      next.stats.aiDraftsAccepted += 1;
      break;

    case "task.created":
      if (p.taskId && !next.openTaskIds.includes(p.taskId)) next.openTaskIds.push(p.taskId);
      break;

    case "task.closed":
      next.openTaskIds = next.openTaskIds.filter((id) => id !== p.taskId);
      break;

    case "approval.requested":
      next.approvals[p.approvalId] = "REQUESTED";
      break;

    case "approval.decided":
      next.approvals[p.approvalId] = p.state;
      break;

    case "buyer_link.viewed":
      next.stats.buyerLinkViews += 1;
      break;

    default:
      break;
  }

  return next;
}

function stripNullish<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined) out[k] = v;
  return out as Partial<T>;
}

/**
 * Allowed status transitions. AI may PROPOSE any transition, but a transition
 * is only committed through a command that validates it here.
 */
const TRANSITIONS: Record<ShipmentStatusValue, ShipmentStatusValue[]> = {
  DRAFT: ["PO_CONFIRMED", "CANCELLED"],
  PO_CONFIRMED: ["DOCS_IN_PREP", "CANCELLED"],
  DOCS_IN_PREP: ["READY_TO_SHIP", "PO_CONFIRMED", "CANCELLED"],
  READY_TO_SHIP: ["IN_TRANSIT", "DOCS_IN_PREP", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransition(from: ShipmentStatusValue, to: ShipmentStatusValue): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(from: ShipmentStatusValue): ShipmentStatusValue[] {
  return TRANSITIONS[from] ?? [];
}

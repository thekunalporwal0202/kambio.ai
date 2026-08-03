import { z } from "zod";

/**
 * The event vocabulary of a shipment.
 *
 * These payloads are persisted forever, so treat them as a published contract:
 * add new event types rather than changing the meaning of an existing one, and
 * only add OPTIONAL fields to an existing payload.
 */

export const shipmentStatuses = [
  "DRAFT",
  "PO_CONFIRMED",
  "DOCS_IN_PREP",
  "READY_TO_SHIP",
  "IN_TRANSIT",
  "DELIVERED",
  "CLOSED",
  "CANCELLED",
] as const;
export const ShipmentStatusSchema = z.enum(shipmentStatuses);
export type ShipmentStatusValue = z.infer<typeof ShipmentStatusSchema>;

/** Provenance attached to anything an AI produced. */
export const ProvenanceSchema = z.object({
  confidence: z.number().min(0).max(1),
  /** Verbatim quote from the source document/message supporting the value. */
  sourceSnippet: z.string().nullable().default(null),
  model: z.string().optional(),
  provider: z.string().optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

const TradeFieldsSchema = z.object({
  poNumber: z.string().nullish(),
  invoiceNumber: z.string().nullish(),
  incoterm: z.string().nullish(),
  currency: z.string().nullish(),
  totalValue: z.number().nullish(),
  originPort: z.string().nullish(),
  destPort: z.string().nullish(),
  originCountry: z.string().nullish(),
  destCountry: z.string().nullish(),
  etd: z.string().nullish(),
  eta: z.string().nullish(),
  carrierRef: z.string().nullish(),
});

export const eventSchemas = {
  "shipment.created": z.object({
    reference: z.string(),
    title: z.string(),
    origin: z.enum(["manual", "email", "whatsapp", "document"]),
    trade: TradeFieldsSchema.partial().optional(),
  }),

  "shipment.status_changed": z.object({
    from: ShipmentStatusSchema,
    to: ShipmentStatusSchema,
    reason: z.string().optional(),
  }),

  "shipment.fields_updated": z.object({
    trade: TradeFieldsSchema.partial(),
    /** Where the values came from, e.g. "document:<id>" or "message:<id>". */
    derivedFrom: z.string().optional(),
  }),

  "party.added": z.object({
    partyId: z.string(),
    type: z.enum(["EXPORTER", "IMPORTER", "CHA", "FORWARDER", "CARRIER", "BANK"]),
    name: z.string(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
    channel: z.enum(["APP", "EMAIL", "WHATSAPP"]),
  }),

  "document.uploaded": z.object({
    documentId: z.string(),
    family: z.string(),
    version: z.number().int(),
    type: z.string(),
    name: z.string(),
    fileRef: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().default(0),
  }),

  "document.extraction_completed": z.object({
    documentId: z.string(),
    overallConfidence: z.number().min(0).max(1),
    /** Field names whose confidence fell below the review threshold. */
    lowConfidenceFields: z.array(z.string()),
    provider: z.string(),
    model: z.string(),
  }),

  "document.extraction_failed": z.object({
    documentId: z.string(),
    error: z.string(),
  }),

  "document.fields_confirmed": z.object({
    documentId: z.string(),
    /** Fields the human edited before confirming — the AI training signal. */
    correctedFields: z.array(z.string()).default([]),
  }),

  "message.received": z.object({
    messageId: z.string(),
    channel: z.enum(["EMAIL", "WHATSAPP", "APP"]),
    from: z.string().nullish(),
    subject: z.string().nullish(),
    preview: z.string(),
  }),

  "message.intent_classified": z.object({
    messageId: z.string(),
    intent: z.enum([
      "APPROVAL",
      "CHANGE_REQUEST",
      "QUESTION",
      "DOC_SUBMISSION",
      "STATUS_UPDATE",
      "OTHER",
      "UNKNOWN",
    ]),
    confidence: z.number().min(0).max(1),
    sourceSnippet: z.string().nullable().default(null),
    proposal: z.string().nullish(),
  }),

  "message.reply_drafted": z.object({
    messageId: z.string().nullish(),
    draft: z.string(),
    confidence: z.number().min(0).max(1),
  }),

  "message.sent": z.object({
    messageId: z.string(),
    channel: z.enum(["EMAIL", "WHATSAPP", "APP"]),
    to: z.string().nullish(),
    preview: z.string(),
  }),

  "task.created": z.object({
    taskId: z.string(),
    title: z.string(),
    severity: z.enum(["BLOCKER", "WARNING", "INFO"]),
    subjectRef: z.string().nullish(),
  }),

  "task.closed": z.object({
    taskId: z.string(),
    outcome: z.enum(["DONE", "DISMISSED"]),
  }),

  "approval.requested": z.object({
    approvalId: z.string(),
    subject: z.string(),
    subjectRef: z.string().nullish(),
  }),

  "approval.decided": z.object({
    approvalId: z.string(),
    state: z.enum(["GRANTED", "REJECTED"]),
    evidenceMessageId: z.string().nullish(),
  }),

  "buyer_link.created": z.object({
    buyerLinkId: z.string(),
    label: z.string(),
  }),

  "buyer_link.viewed": z.object({
    buyerLinkId: z.string(),
  }),

  "buyer_link.claimed": z.object({
    buyerLinkId: z.string(),
    userId: z.string(),
  }),
} as const;

export type EventType = keyof typeof eventSchemas;
export const eventTypes = Object.keys(eventSchemas) as EventType[];

export type EventPayload<T extends EventType> = z.infer<(typeof eventSchemas)[T]>;

export type DomainEvent<T extends EventType = EventType> = {
  type: T;
  payload: EventPayload<T>;
};

export function isEventType(value: string): value is EventType {
  return value in eventSchemas;
}

/** Parse/validate a payload for a given event type. Throws on mismatch. */
export function parseEventPayload<T extends EventType>(type: T, payload: unknown): EventPayload<T> {
  return eventSchemas[type].parse(payload) as EventPayload<T>;
}

export type Actor = {
  type: "USER" | "AI" | "SYSTEM" | "COUNTERPARTY";
  id?: string | null;
  label?: string | null;
};

export const SYSTEM_ACTOR: Actor = { type: "SYSTEM", label: "Kambio" };
export const AI_ACTOR: Actor = { type: "AI", label: "Kambio AI" };

/** Human-readable one-liner for the timeline. */
export function describeEvent(type: string, payload: Record<string, unknown>): string {
  const p = payload as Record<string, any>;
  switch (type) {
    case "shipment.created":
      return `Shipment created from ${p.origin}`;
    case "shipment.status_changed":
      return `Status ${p.from} → ${p.to}${p.reason ? ` (${p.reason})` : ""}`;
    case "shipment.fields_updated":
      return `Trade details updated (${Object.keys(p.trade ?? {}).join(", ") || "no fields"})`;
    case "party.added":
      return `${p.name} added as ${p.type}`;
    case "document.uploaded":
      return `${p.name} uploaded (v${p.version})`;
    case "document.extraction_completed":
      return `Extraction complete — ${Math.round((p.overallConfidence ?? 0) * 100)}% confidence${
        p.lowConfidenceFields?.length ? `, ${p.lowConfidenceFields.length} field(s) need review` : ""
      }`;
    case "document.extraction_failed":
      return `Extraction failed: ${p.error}`;
    case "document.fields_confirmed":
      return `Extracted data confirmed${
        p.correctedFields?.length ? ` (${p.correctedFields.length} corrected)` : ""
      }`;
    case "message.received":
      return `${p.channel} message received${p.from ? ` from ${p.from}` : ""}`;
    case "message.intent_classified":
      return `Interpreted as ${p.intent} (${Math.round((p.confidence ?? 0) * 100)}%)`;
    case "message.reply_drafted":
      return `Reply drafted — awaiting your confirmation`;
    case "message.sent":
      return `Reply sent via ${p.channel}${p.to ? ` to ${p.to}` : ""}`;
    case "task.created":
      return `Task: ${p.title}`;
    case "task.closed":
      return `Task ${String(p.outcome ?? "").toLowerCase()}`;
    case "approval.requested":
      return `Approval requested: ${p.subject}`;
    case "approval.decided":
      return `Approval ${String(p.state ?? "").toLowerCase()}: ${p.approvalId}`;
    case "buyer_link.created":
      return `Buyer link created (${p.label})`;
    case "buyer_link.viewed":
      return `Buyer opened the shared view`;
    case "buyer_link.claimed":
      return `Buyer created an account`;
    default:
      return type;
  }
}

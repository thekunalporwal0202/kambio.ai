import { z } from "zod";

/** A single extracted value, always carrying its provenance. */
export const ExtractedFieldSchema = z.object({
  value: z.union([z.string(), z.number(), z.null()]),
  confidence: z.number().min(0).max(1),
  /** Verbatim quote from the source text that justifies `value`. */
  sourceSnippet: z.string().nullable(),
});
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;

export const LineItemSchema = z.object({
  description: z.string(),
  hsCode: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  unitPrice: z.number().nullable(),
  amount: z.number().nullable(),
  // TODO: per-cell provenance for line items; today confidence is per row.
  confidence: z.number().min(0).max(1),
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const documentTypes = [
  "COMMERCIAL_INVOICE",
  "PACKING_LIST",
  "PURCHASE_ORDER",
  "BILL_OF_LADING",
  "OTHER",
] as const;

export const ExtractionResultSchema = z.object({
  documentType: z.enum(documentTypes),
  fields: z.record(ExtractedFieldSchema),
  lineItems: z.array(LineItemSchema).default([]),
  overallConfidence: z.number().min(0).max(1),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export const messageIntents = [
  "APPROVAL",
  "CHANGE_REQUEST",
  "QUESTION",
  "DOC_SUBMISSION",
  "STATUS_UPDATE",
  "OTHER",
] as const;

export const MessageClassificationSchema = z.object({
  intent: z.enum(messageIntents),
  confidence: z.number().min(0).max(1),
  sourceSnippet: z.string().nullable(),
  /** Plain-English description of the workspace change being proposed. */
  proposedAction: z.string().nullable(),
  /** Machine-readable proposal, e.g. { approves: "invoice", lineChanges: [...] }. */
  payload: z.record(z.unknown()).default({}),
});
export type MessageClassification = z.infer<typeof MessageClassificationSchema>;

export const DraftReplySchema = z.object({
  subject: z.string().nullable(),
  body: z.string(),
  confidence: z.number().min(0).max(1),
  /** Why this reply — shown to the exporter before they hit send. */
  rationale: z.string().nullable(),
});
export type DraftReply = z.infer<typeof DraftReplySchema>;

/** Usage/cost returned by every gateway call, for per-shipment attribution. */
export type AiUsage = {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

export type AiResult<T> = { data: T; usage: AiUsage };

export type AiTaskName = "extract_document" | "classify_message" | "draft_reply";

export type ExtractDocumentInput = {
  text: string;
  fileName: string;
  hintedType?: (typeof documentTypes)[number];
};

export type ClassifyMessageInput = {
  text: string;
  channel: "EMAIL" | "WHATSAPP" | "APP";
  subject?: string | null;
  shipmentContext?: string;
};

export type DraftReplyInput = {
  incomingText: string;
  channel: "EMAIL" | "WHATSAPP" | "APP";
  intent: string;
  shipmentContext: string;
  exporterName: string;
};

/**
 * The one interface every model provider implements. Nothing outside
 * src/server/ai/providers may import a vendor SDK.
 */
export interface AiProvider {
  readonly name: string;
  extractDocument(input: ExtractDocumentInput): Promise<AiResult<ExtractionResult>>;
  classifyMessage(input: ClassifyMessageInput): Promise<AiResult<MessageClassification>>;
  draftReply(input: DraftReplyInput): Promise<AiResult<DraftReply>>;
}

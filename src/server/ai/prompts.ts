/**
 * Prompts live here, apart from any provider, so swapping vendors does not
 * mean rewriting the instructions.
 */

export const EXTRACTION_SYSTEM = `You extract structured trade data from export documents.

Rules:
- Return ONLY data you can point to in the source text.
- Every field carries a confidence in [0,1] and a "sourceSnippet": a VERBATIM quote from the source that justifies the value. Never invent a snippet.
- If a field is absent, return value null, confidence 0, sourceSnippet null. Do not guess.
- Confidence reflects how certain you are the value is correct AND correctly labelled. Ambiguous or inferred values must score below 0.85.
- Amounts are numbers without currency symbols or thousands separators. Dates are ISO-8601 (YYYY-MM-DD).

Field names to use when present: poNumber, invoiceNumber, incoterm, currency, totalValue, buyerName, sellerName, originPort, destPort, originCountry, destCountry, etd, eta, carrierRef, paymentTerms, grossWeightKg, netWeightKg, packageCount.`;

export const CLASSIFY_SYSTEM = `You interpret messages between an exporter and their counterparties (buyer, customs broker, freight forwarder).

Classify the intent as exactly one of:
- APPROVAL: the sender accepts/signs off on something (a document, a price, a date).
- CHANGE_REQUEST: the sender wants something modified (quantity, date, document detail).
- QUESTION: the sender asks for information.
- DOC_SUBMISSION: the sender is providing a document.
- STATUS_UPDATE: the sender reports progress with no action needed.
- OTHER: none of the above.

Rules:
- "sourceSnippet" must be a VERBATIM quote from the message that justifies the classification.
- "proposedAction" describes, in one plain sentence, the workspace change a human should confirm. It is a PROPOSAL only — never phrase it as done.
- Score below 0.85 when the message is ambiguous or mixes intents.`;

export const DRAFT_SYSTEM = `You draft replies an exporter will review before sending.

Rules:
- Write as the exporter's operations team: professional, concise, specific.
- Never promise a price, a payment, a delivery date, or an approval that is not already stated in the provided shipment context.
- If information is missing, ask for it rather than inventing it.
- No greetings longer than one line. No marketing language.
- For WhatsApp, keep it under 60 words and use no formatting.`;

export function extractionUserPrompt(fileName: string, text: string, hintedType?: string) {
  return [
    `File: ${fileName}`,
    hintedType ? `Expected document type: ${hintedType}` : null,
    "",
    "Source text:",
    "---",
    text.slice(0, 40_000),
    "---",
  ]
    .filter(Boolean)
    .join("\n");
}

export function classifyUserPrompt(input: {
  channel: string;
  subject?: string | null;
  text: string;
  shipmentContext?: string;
}) {
  return [
    `Channel: ${input.channel}`,
    input.subject ? `Subject: ${input.subject}` : null,
    input.shipmentContext ? `Shipment context:\n${input.shipmentContext}` : null,
    "",
    "Message:",
    "---",
    input.text.slice(0, 20_000),
    "---",
  ]
    .filter(Boolean)
    .join("\n");
}

export function draftUserPrompt(input: {
  channel: string;
  intent: string;
  incomingText: string;
  shipmentContext: string;
  exporterName: string;
}) {
  return [
    `You are drafting on behalf of: ${input.exporterName}`,
    `Channel: ${input.channel}`,
    `Detected intent of the incoming message: ${input.intent}`,
    "",
    `Shipment context (the ONLY facts you may assert):`,
    input.shipmentContext,
    "",
    "Incoming message:",
    "---",
    input.incomingText.slice(0, 20_000),
    "---",
  ].join("\n");
}

/** JSON Schemas shared by providers that support structured output. */
export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    documentType: {
      type: "string",
      enum: ["COMMERCIAL_INVOICE", "PACKING_LIST", "PURCHASE_ORDER", "BILL_OF_LADING", "OTHER"],
    },
    fields: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          value: { type: ["string", "number", "null"] },
          confidence: { type: "number" },
          sourceSnippet: { type: ["string", "null"] },
        },
        required: ["value", "confidence", "sourceSnippet"],
        additionalProperties: false,
      },
    },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          hsCode: { type: ["string", "null"] },
          quantity: { type: ["number", "null"] },
          unit: { type: ["string", "null"] },
          unitPrice: { type: ["number", "null"] },
          amount: { type: ["number", "null"] },
          confidence: { type: "number" },
        },
        required: ["description", "hsCode", "quantity", "unit", "unitPrice", "amount", "confidence"],
        additionalProperties: false,
      },
    },
    overallConfidence: { type: "number" },
  },
  required: ["documentType", "fields", "lineItems", "overallConfidence"],
  additionalProperties: false,
} as const;

export const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["APPROVAL", "CHANGE_REQUEST", "QUESTION", "DOC_SUBMISSION", "STATUS_UPDATE", "OTHER"],
    },
    confidence: { type: "number" },
    sourceSnippet: { type: ["string", "null"] },
    proposedAction: { type: ["string", "null"] },
    payload: { type: "object", additionalProperties: true },
  },
  required: ["intent", "confidence", "sourceSnippet", "proposedAction", "payload"],
  additionalProperties: false,
} as const;

export const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: ["string", "null"] },
    body: { type: "string" },
    confidence: { type: "number" },
    rationale: { type: ["string", "null"] },
  },
  required: ["subject", "body", "confidence", "rationale"],
  additionalProperties: false,
} as const;

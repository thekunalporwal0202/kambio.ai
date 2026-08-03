import type {
  AiProvider,
  AiResult,
  ClassifyMessageInput,
  DraftReply,
  DraftReplyInput,
  ExtractDocumentInput,
  ExtractionResult,
  ExtractedField,
  LineItem,
  MessageClassification,
} from "../types";

/**
 * Deterministic, offline provider. No network, no API key.
 *
 * It is a real (if naive) rules-based extractor rather than a canned blob, so
 * the demo responds to whatever you actually paste, and every field still
 * carries a genuine verbatim source snippet. Confidences are deliberately
 * mixed — some fields land under the review threshold so the human-in-the-loop
 * path is exercised.
 */
export class MockProvider implements AiProvider {
  readonly name = "mock";

  async extractDocument(input: ExtractDocumentInput): Promise<AiResult<ExtractionResult>> {
    const started = Date.now();
    const text = input.text;

    const fields: Record<string, ExtractedField> = {};
    const put = (
      key: string,
      match: RegExpMatchArray | null,
      confidence: number,
      opts?: { cast?: "number"; validate?: (raw: string) => boolean },
    ) => {
      if (!match || match[1] === undefined) return;
      const raw = match[1].trim();
      if (opts?.validate && !opts.validate(raw)) return;
      const value = opts?.cast === "number" ? Number(raw.replace(/[, ]/g, "")) : raw;
      if (opts?.cast === "number" && Number.isNaN(value as number)) return;
      fields[key] = { value, confidence, sourceSnippet: snippetAround(text, match.index ?? 0) };
    };

    // A document reference always contains a digit. Without this guard the
    // "PO" inside a word like "poplin" produces a phantom PO number.
    const looksLikeReference = (raw: string) => /\d/.test(raw);

    put(
      "poNumber",
      text.match(/\b(?:P\.?O\.?|purchase\s+order)\s*(?:no\.?|number|#)?\s*:?\s*([A-Z0-9][A-Z0-9\-\/]{3,})/i),
      0.94,
      { validate: looksLikeReference },
    );
    put(
      "invoiceNumber",
      text.match(/\binvoice\s*(?:no\.?|number|#)?\s*:?\s*([A-Z0-9][A-Z0-9\-\/]{2,})/i),
      0.93,
      { validate: looksLikeReference },
    );
    put("incoterm", text.match(/\b(FOB|CIF|CFR|EXW|DAP|DDP|FCA|CIP|CPT|FAS)\b/i), 0.91);
    put("currency", text.match(/\b(USD|EUR|GBP|INR|AED|SGD|JPY|CNY)\b/), 0.9);
    put("totalValue", text.match(/(?:total|grand\s+total|invoice\s+value|amount)[^\d]{0,20}([\d][\d,\.]{2,})/i), 0.88, { cast: "number" });
    put("buyerName", text.match(/\b(?:buyer|consignee|bill\s+to)\s*:?\s*([A-Z][\w&.,'\- ]{3,60})/i), 0.82);
    put("sellerName", text.match(/\b(?:seller|shipper|exporter)\s*:?\s*([A-Z][\w&.,'\- ]{3,60})/i), 0.8);
    put("originPort", text.match(/\b(?:port\s+of\s+loading|origin\s+port|from\s+port)\s*:?[ \t]*([A-Za-z][\w ,\-]{2,40})/i), 0.86);
    put("destPort", text.match(/\b(?:port\s+of\s+discharge|destination\s+port|to\s+port|discharge)\s*:?[ \t]*([A-Za-z][\w ,\-]{2,40})/i), 0.84);
    put("carrierRef", text.match(/\b(?:b\/?l|bill\s+of\s+lading|booking|container)\s*(?:no\.?|number|#|:)?\s*([A-Z]{3,4}[\-\s]?\d{6,12})/i), 0.87);
    put("paymentTerms", text.match(/\b(?:payment\s+terms|terms)\s*:?\s*([^\n]{3,60})/i), 0.72);

    const etd = text.match(/\b(?:etd|ship(?:ment)?\s+date|departure)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\s+\w+\s+\d{4})/i);
    if (etd?.[1]) {
      fields.etd = {
        value: normalizeDate(etd[1]),
        confidence: 0.83,
        sourceSnippet: snippetAround(text, etd.index ?? 0),
      };
    }
    const eta = text.match(/\b(?:eta|arrival|delivery\s+date)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\s+\w+\s+\d{4})/i);
    if (eta?.[1]) {
      fields.eta = {
        value: normalizeDate(eta[1]),
        confidence: 0.79, // deliberately below threshold — exercises human review
        sourceSnippet: snippetAround(text, eta.index ?? 0),
      };
    }

    const lineItems = extractLineItems(text);
    const documentType = detectType(text, input.fileName, input.hintedType);

    const confidences = Object.values(fields).map((f) => f.confidence);
    const overallConfidence = confidences.length
      ? round2(confidences.reduce((a, b) => a + b, 0) / confidences.length)
      : 0.4;

    return {
      data: { documentType, fields, lineItems, overallConfidence },
      usage: usage(this.name, "mock-rules-v1", text.length, started),
    };
  }

  async classifyMessage(input: ClassifyMessageInput): Promise<AiResult<MessageClassification>> {
    const started = Date.now();
    const text = input.text;
    const lower = text.toLowerCase();

    const rules: Array<{
      intent: MessageClassification["intent"];
      re: RegExp;
      confidence: number;
      action: (m: RegExpMatchArray) => string;
    }> = [
      {
        // Only ASSERTIONS of approval. A bare "confirm" is not one:
        // "Please confirm receipt" is a request TO us, and reading it as a
        // buyer sign-off would raise a false approval on the shipment.
        intent: "APPROVAL",
        re: /\b(?:approved|we\s+(?:accept|approve)|accepted|looks\s+good|go\s+ahead|sign(?:ed)?\s+off|confirmed\s+from\s+our\s+side)\b/i,
        confidence: 0.93,
        action: () => "Mark the referenced document as approved and advance the shipment.",
      },
      {
        // Requires an imperative, so "any update?" stays a question.
        intent: "CHANGE_REQUEST",
        re: /\b(?:please\s+)?(?:change|revise|amend|increase|decrease|reduce)\b|\binstead of\b|\bplease\s+(?:update|make it)\b/i,
        confidence: 0.88,
        action: (m) => `Apply the requested change ("${m[0]}") to the shipment and re-issue the document.`,
      },
      {
        intent: "DOC_SUBMISSION",
        re: /\b(?:attached|please find|enclosed|sending you the|herewith|purchase\s+order\s*(?:no\.?|number|#|:)|please\s+process\s+the\s+following)\b/i,
        confidence: 0.86,
        action: () => "File the attached document into the shipment workspace.",
      },
      {
        intent: "QUESTION",
        re: /\?|\b(could you|can you|what is|when will|any update|status)\b/i,
        confidence: 0.81,
        action: () => "Draft an answer to the buyer's question.",
      },
      {
        intent: "STATUS_UPDATE",
        re: /\b(shipped|departed|arrived|cleared customs|on board|gate ?in)\b/i,
        confidence: 0.84,
        action: () => "Record the reported milestone on the shipment timeline.",
      },
    ];

    for (const rule of rules) {
      const m = text.match(rule.re);
      if (m) {
        return {
          data: {
            intent: rule.intent,
            confidence: rule.confidence,
            sourceSnippet: snippetAround(text, m.index ?? 0),
            proposedAction: rule.action(m),
            payload: buildPayload(rule.intent, text),
          },
          usage: usage(this.name, "mock-rules-v1", text.length, started),
        };
      }
    }

    return {
      data: {
        intent: "OTHER",
        confidence: 0.45,
        sourceSnippet: text.slice(0, 160) || null,
        proposedAction: "Review this message manually — no clear intent detected.",
        payload: {},
      },
      usage: usage(this.name, "mock-rules-v1", lower.length, started),
    };
  }

  async draftReply(input: DraftReplyInput): Promise<AiResult<DraftReply>> {
    const started = Date.now();
    const whatsapp = input.channel === "WHATSAPP";

    const bodies: Record<string, string> = {
      APPROVAL: `Thank you for the confirmation. We have recorded your approval and are proceeding with document preparation. We will share the final set once ready.`,
      CHANGE_REQUEST: `Thank you — we have noted the requested change. Our team is updating the documents now and will send a revised version for your review before anything is finalised.`,
      QUESTION: `Thanks for reaching out. Here is the current position on your shipment:\n\n${input.shipmentContext}\n\nLet us know if you need anything further.`,
      DOC_SUBMISSION: `Received, thank you. We have filed the document against your shipment and will confirm once it has been checked.`,
      STATUS_UPDATE: `Thank you for the update — we have recorded it against the shipment.`,
      OTHER: `Thank you for your message. We are reviewing it and will come back to you shortly.`,
    };

    const body = bodies[input.intent] ?? bodies.OTHER!;
    const signed = whatsapp
      ? body.split("\n")[0]!
      : `${body}\n\nBest regards,\n${input.exporterName}`;

    return {
      data: {
        subject: whatsapp ? null : `Re: your message regarding this shipment`,
        body: signed,
        confidence: 0.8,
        rationale: `Template reply for a ${input.intent} message; asserts only facts present in the shipment context.`,
      },
      usage: usage(this.name, "mock-rules-v1", input.incomingText.length, started),
    };
  }
}

// ------------------------------------------------------------------ helpers

function usage(provider: string, model: string, chars: number, started: number) {
  const inputTokens = Math.ceil(chars / 4);
  return {
    provider,
    model,
    inputTokens,
    outputTokens: Math.ceil(inputTokens * 0.2),
    costUsd: 0, // the mock is free — makes cost dashboards honest in demo mode
    latencyMs: Math.max(1, Date.now() - started),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** A verbatim window of the source around a match — real provenance. */
function snippetAround(text: string, index: number, radius = 70): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}

function normalizeDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString().slice(0, 10);
}

function detectType(
  text: string,
  fileName: string,
  hinted?: ExtractDocumentInput["hintedType"],
): ExtractionResult["documentType"] {
  if (hinted) return hinted;
  const hay = `${fileName} ${text}`.toLowerCase();
  if (/packing\s*list/.test(hay)) return "PACKING_LIST";
  if (/bill\s*of\s*lading|b\/l\b/.test(hay)) return "BILL_OF_LADING";
  if (/commercial\s*invoice|\binvoice\b/.test(hay)) return "COMMERCIAL_INVOICE";
  if (/purchase\s*order|\bp\.?o\.?\b/.test(hay)) return "PURCHASE_ORDER";
  return "OTHER";
}

/** Parse pipe/tab/multi-space delimited tabular rows. */
function extractLineItems(text: string): LineItem[] {
  const out: LineItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line
      .split(/\s*\|\s*|\t+|\s{3,}/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 3) continue;
    // Skip header rows.
    if (/^(description|item|sr|s\.no|no\.?|qty|product)$/i.test(cells[0] ?? "")) continue;

    const hs = cells.find((c) => /^\d{4}[. ]?\d{2}([. ]?\d{2})?$/.test(c)) ?? null;

    // A cell counts as numeric only if the WHOLE cell is a number. Without
    // this, a description like "Indigo denim 12oz" contributes a bogus 12.
    const numeric: number[] = [];
    cells.forEach((cell, i) => {
      if (i === 0) return; // column 0 is the description
      if (cell === hs) return;
      if (!/^-?[\d,]+(\.\d+)?$/.test(cell)) return;
      const n = Number(cell.replace(/,/g, ""));
      if (Number.isFinite(n)) numeric.push(n);
    });
    if (numeric.length < 2) continue;

    out.push({
      description: cells[0] ?? "item",
      hsCode: hs,
      quantity: numeric[0] ?? null,
      unit: null,
      unitPrice: numeric.length >= 3 ? (numeric[1] ?? null) : null,
      amount: numeric[numeric.length - 1] ?? null,
      confidence: 0.86,
    });
    if (out.length >= 50) break;
  }
  return out;
}

function buildPayload(intent: MessageClassification["intent"], text: string): Record<string, unknown> {
  if (intent === "APPROVAL") {
    const doc = text.match(/\b(invoice|packing list|proforma|draft|b\/l|bill of lading)\s*(v?\d+)?/i);
    return doc ? { approves: doc[0].trim() } : {};
  }
  if (intent === "CHANGE_REQUEST") {
    const line = text.match(/\bline\s*(?:item\s*)?(\d+)/i);
    const qty = text.match(/\b(?:qty|quantity)\s*(?:to|of|:)?\s*([\d,]+)/i);
    return {
      ...(line?.[1] ? { lineNumber: Number(line[1]) } : {}),
      ...(qty?.[1] ? { newQuantity: Number(qty[1].replace(/,/g, "")) } : {}),
    };
  }
  return {};
}

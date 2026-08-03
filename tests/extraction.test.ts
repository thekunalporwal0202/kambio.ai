import { describe, expect, it } from "vitest";
import { MockProvider } from "@/server/ai/providers/mock";

const PO = `Purchase Order No: PO-4471-B
Incoterm: FOB Nhava Sheva
Currency: USD
Payment terms: 30% advance

Description            | HS Code | Qty   | Unit Price | Amount
Cotton poplin shirting | 5208.52 | 4000  | 3.15       | 12600.00
Linen blend fabric     | 5309.29 | 1500  | 6.40       | 9600.00

Total: 22200.00
Port of loading: Nhava Sheva
Port of discharge: Rotterdam
ETD: 2026-09-12
ETA: 2026-10-08`;

const provider = new MockProvider();

describe("document extraction", () => {
  it("extracts trade fields with a verbatim source snippet for each", async () => {
    const { data } = await provider.extractDocument({ text: PO, fileName: "po.txt" });

    expect(data.fields.poNumber?.value).toBe("PO-4471-B");
    expect(data.fields.incoterm?.value).toBe("FOB");
    expect(data.fields.currency?.value).toBe("USD");
    expect(data.fields.totalValue?.value).toBe(22200);

    // Provenance is not optional: every field must quote its source.
    for (const [name, field] of Object.entries(data.fields)) {
      expect(field.sourceSnippet, `${name} is missing a source snippet`).toBeTruthy();
      expect(field.confidence).toBeGreaterThan(0);
      expect(field.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("does not let a newline bleed into single-line fields", async () => {
    const { data } = await provider.extractDocument({ text: PO, fileName: "po.txt" });
    expect(data.fields.originPort?.value).toBe("Nhava Sheva");
    expect(data.fields.destPort?.value).toBe("Rotterdam");
  });

  it("parses line items without mistaking words for numbers", async () => {
    const text = PO.replace("Cotton poplin shirting", "Cotton poplin 12oz");
    const { data } = await provider.extractDocument({ text, fileName: "po.txt" });

    expect(data.lineItems).toHaveLength(2);
    const [first] = data.lineItems;
    // "12oz" in the description must NOT become the quantity.
    expect(first?.quantity).toBe(4000);
    expect(first?.unitPrice).toBe(3.15);
    expect(first?.amount).toBe(12600);
    expect(first?.hsCode).toBe("5208.52");
  });

  it("routes genuinely uncertain fields below the review threshold", async () => {
    const { data } = await provider.extractDocument({ text: PO, fileName: "po.txt" });
    // ETA is intentionally low-confidence so the human-in-the-loop path runs.
    expect(data.fields.eta!.confidence).toBeLessThan(0.85);
  });

  it("detects the document type", async () => {
    const { data } = await provider.extractDocument({ text: PO, fileName: "po.txt" });
    expect(data.documentType).toBe("PURCHASE_ORDER");

    const invoice = await provider.extractDocument({
      text: "COMMERCIAL INVOICE\nInvoice No: INV-1",
      fileName: "inv.txt",
    });
    expect(invoice.data.documentType).toBe("COMMERCIAL_INVOICE");
  });

  it("returns low overall confidence rather than inventing data", async () => {
    const { data } = await provider.extractDocument({
      text: "Hi, hope you are well. Speak soon.",
      fileName: "note.txt",
    });
    expect(Object.keys(data.fields)).toHaveLength(0);
    expect(data.overallConfidence).toBeLessThan(0.5);
  });

  it("reports usage for cost attribution", async () => {
    const { usage } = await provider.extractDocument({ text: PO, fileName: "po.txt" });
    expect(usage.provider).toBe("mock");
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.costUsd).toBe(0);
  });
});

describe("message classification", () => {
  it("recognises an approval and quotes the evidence", async () => {
    const { data } = await provider.classifyMessage({
      text: "Invoice v3 approved from our side. Please proceed with the booking.",
      channel: "WHATSAPP",
    });
    expect(data.intent).toBe("APPROVAL");
    expect(data.confidence).toBeGreaterThan(0.85);
    expect(data.sourceSnippet).toContain("approved");
    expect(data.payload.approves).toBeTruthy();
  });

  it("recognises a change request and extracts the specifics", async () => {
    const { data } = await provider.classifyMessage({
      text: "Please change line 4 quantity to 2500 before you issue the invoice.",
      channel: "EMAIL",
    });
    expect(data.intent).toBe("CHANGE_REQUEST");
    expect(data.payload.lineNumber).toBe(4);
    expect(data.payload.newQuantity).toBe(2500);
  });

  it("does not mistake a request to confirm for an approval", async () => {
    // "Please confirm receipt" is an instruction TO the exporter. Treating it
    // as a buyer sign-off would raise a false approval on the shipment.
    const { data } = await provider.classifyMessage({
      text: "Please process the following order.\nPurchase Order No: PO-1\nPlease confirm receipt.",
      channel: "EMAIL",
    });
    expect(data.intent).not.toBe("APPROVAL");
    expect(data.intent).toBe("DOC_SUBMISSION");
  });

  it("keeps a status chase a question, not a change request", async () => {
    const { data } = await provider.classifyMessage({
      text: "Any update on this shipment?",
      channel: "WHATSAPP",
    });
    expect(data.intent).toBe("QUESTION");
  });

  it("falls back to low confidence when intent is unclear", async () => {
    const { data } = await provider.classifyMessage({ text: "ok", channel: "EMAIL" });
    expect(data.intent).toBe("OTHER");
    expect(data.confidence).toBeLessThan(0.6);
  });
});

describe("reply drafting", () => {
  it("never asserts facts outside the supplied shipment context", async () => {
    const { data } = await provider.draftReply({
      incomingText: "When will it ship?",
      channel: "EMAIL",
      intent: "QUESTION",
      shipmentContext: "Reference: KMB-2026-001\nStatus: IN_TRANSIT",
      exporterName: "Meridian Textiles",
    });
    expect(data.body).toContain("KMB-2026-001");
    expect(data.body).not.toMatch(/\$\d/);
    expect(data.rationale).toBeTruthy();
  });

  it("keeps WhatsApp drafts short and unsigned", async () => {
    const { data } = await provider.draftReply({
      incomingText: "any update?",
      channel: "WHATSAPP",
      intent: "STATUS_UPDATE",
      shipmentContext: "Status: IN_TRANSIT",
      exporterName: "Meridian Textiles",
    });
    expect(data.subject).toBeNull();
    expect(data.body).not.toContain("Best regards");
  });
});

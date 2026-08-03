import { describe, expect, it } from "vitest";
import { describeEvent, eventTypes, isEventType, parseEventPayload } from "@/server/domain/events";

describe("event contract", () => {
  it("validates a well-formed payload", () => {
    const payload = parseEventPayload("shipment.created", {
      reference: "KMB-2026-001",
      title: "Cotton twill",
      origin: "email",
    });
    expect(payload.reference).toBe("KMB-2026-001");
  });

  it("rejects a payload with a bad enum value", () => {
    expect(() =>
      parseEventPayload("shipment.status_changed", { from: "DRAFT", to: "NOT_A_STATUS" }),
    ).toThrow();
  });

  it("rejects a payload missing a required field", () => {
    expect(() => parseEventPayload("document.uploaded", { documentId: "d1" })).toThrow();
  });

  it("rejects confidence outside 0..1", () => {
    expect(() =>
      parseEventPayload("document.extraction_completed", {
        documentId: "d1",
        overallConfidence: 1.4,
        lowConfidenceFields: [],
        provider: "mock",
        model: "m",
      }),
    ).toThrow();
  });

  it("requires AI classifications to carry provenance fields", () => {
    const payload = parseEventPayload("message.intent_classified", {
      messageId: "m1",
      intent: "APPROVAL",
      confidence: 0.93,
      sourceSnippet: "Invoice v3 approved from our side.",
    });
    expect(payload.sourceSnippet).toBe("Invoice v3 approved from our side.");
  });

  it("narrows known event types", () => {
    expect(isEventType("shipment.created")).toBe(true);
    expect(isEventType("nope")).toBe(false);
  });

  it("describes every declared event type without throwing", () => {
    for (const type of eventTypes) {
      expect(typeof describeEvent(type, {})).toBe("string");
    }
  });
});

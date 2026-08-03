import { describe, expect, it } from "vitest";
import {
  applyEvent,
  canTransition,
  emptyProjection,
  nextStatuses,
  type ShipmentProjection,
} from "@/server/domain/projection";

/** Fold a list of [type, payload] pairs, the way the ledger replays. */
function fold(events: Array<[string, Record<string, unknown>]>): ShipmentProjection {
  return events.reduce((state, [type, payload]) => applyEvent(state, type, payload), emptyProjection());
}

describe("shipment projection", () => {
  it("starts empty", () => {
    const state = emptyProjection();
    expect(state.status).toBe("DRAFT");
    expect(state.eventCount).toBe(0);
    expect(state.documents).toEqual({});
  });

  it("derives identity and status from the ledger", () => {
    const state = fold([
      ["shipment.created", { reference: "KMB-2026-001", title: "Cotton twill", origin: "email" }],
      ["shipment.status_changed", { from: "DRAFT", to: "PO_CONFIRMED" }],
      ["shipment.status_changed", { from: "PO_CONFIRMED", to: "DOCS_IN_PREP" }],
    ]);

    expect(state.reference).toBe("KMB-2026-001");
    expect(state.title).toBe("Cotton twill");
    expect(state.status).toBe("DOCS_IN_PREP");
    expect(state.eventCount).toBe(3);
  });

  it("merges trade fields and ignores nullish values", () => {
    const state = fold([
      ["shipment.created", { reference: "R", title: "T", origin: "manual" }],
      ["shipment.fields_updated", { trade: { poNumber: "PO-1", incoterm: "FOB" } }],
      ["shipment.fields_updated", { trade: { incoterm: "CIF", currency: null, totalValue: 100 } }],
    ]);

    expect(state.trade.poNumber).toBe("PO-1");
    // later event wins
    expect(state.trade.incoterm).toBe("CIF");
    expect(state.trade.totalValue).toBe(100);
    // null must not clobber or appear
    expect(state.trade.currency).toBeUndefined();
  });

  it("is a pure function — folding never mutates the input state", () => {
    const before = emptyProjection();
    const snapshot = JSON.stringify(before);
    applyEvent(before, "shipment.status_changed", { from: "DRAFT", to: "PO_CONFIRMED" });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("is deterministic — replaying the same ledger yields the same state", () => {
    const events: Array<[string, Record<string, unknown>]> = [
      ["shipment.created", { reference: "R", title: "T", origin: "email" }],
      ["document.uploaded", { documentId: "d1", family: "PURCHASE_ORDER", version: 1 }],
      ["document.extraction_completed", { documentId: "d1", overallConfidence: 0.87 }],
      ["document.fields_confirmed", { documentId: "d1", correctedFields: ["eta"] }],
    ];
    expect(fold(events)).toEqual(fold(events));
  });

  it("tracks document lifecycle", () => {
    const state = fold([
      ["shipment.created", { reference: "R", title: "T", origin: "email" }],
      ["document.uploaded", { documentId: "d1", family: "PURCHASE_ORDER", version: 1 }],
      ["document.extraction_completed", { documentId: "d1", overallConfidence: 0.87 }],
      ["document.fields_confirmed", { documentId: "d1", correctedFields: ["eta"] }],
    ]);

    expect(state.documents.d1).toEqual({
      family: "PURCHASE_ORDER",
      version: 1,
      confirmed: true,
      confidence: 0.87,
    });
    expect(state.stats.documentsExtracted).toBe(1);
    expect(state.stats.fieldsConfirmed).toBe(1);
  });

  it("opens and closes tasks", () => {
    const state = fold([
      ["shipment.created", { reference: "R", title: "T", origin: "email" }],
      ["task.created", { taskId: "t1", title: "Review", severity: "BLOCKER" }],
      ["task.created", { taskId: "t2", title: "Chase", severity: "WARNING" }],
      ["task.closed", { taskId: "t1", outcome: "DONE" }],
    ]);
    expect(state.openTaskIds).toEqual(["t2"]);
  });

  it("records approval decisions", () => {
    const state = fold([
      ["shipment.created", { reference: "R", title: "T", origin: "email" }],
      ["approval.requested", { approvalId: "a1", subject: "Invoice v3" }],
      ["approval.decided", { approvalId: "a1", state: "GRANTED" }],
    ]);
    expect(state.approvals.a1).toBe("GRANTED");
  });

  it("counts ROI inputs from events only", () => {
    const state = fold([
      ["shipment.created", { reference: "R", title: "T", origin: "email" }],
      ["message.received", { messageId: "m1", channel: "EMAIL", preview: "hi" }],
      ["message.received", { messageId: "m2", channel: "WHATSAPP", preview: "hi" }],
      ["message.sent", { messageId: "m3", channel: "EMAIL", preview: "ok" }],
      ["buyer_link.viewed", { buyerLinkId: "b1" }],
      ["buyer_link.viewed", { buyerLinkId: "b1" }],
    ]);

    expect(state.stats.inboundMessages).toBe(2);
    expect(state.stats.aiDraftsAccepted).toBe(1);
    expect(state.stats.buyerLinkViews).toBe(2);
    expect(state.messageCount).toBe(3);
  });

  it("ignores unknown event types instead of throwing", () => {
    const state = fold([
      ["shipment.created", { reference: "R", title: "T", origin: "email" }],
      ["something.from.the.future", { anything: true }],
    ]);
    expect(state.status).toBe("DRAFT");
    expect(state.eventCount).toBe(2);
  });
});

describe("status state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("DRAFT", "PO_CONFIRMED")).toBe(true);
    expect(canTransition("PO_CONFIRMED", "DOCS_IN_PREP")).toBe(true);
    expect(canTransition("DOCS_IN_PREP", "READY_TO_SHIP")).toBe(true);
    expect(canTransition("READY_TO_SHIP", "IN_TRANSIT")).toBe(true);
    expect(canTransition("IN_TRANSIT", "DELIVERED")).toBe(true);
    expect(canTransition("DELIVERED", "CLOSED")).toBe(true);
  });

  it("refuses skipping stages", () => {
    expect(canTransition("DRAFT", "IN_TRANSIT")).toBe(false);
    expect(canTransition("DRAFT", "DELIVERED")).toBe(false);
    expect(canTransition("PO_CONFIRMED", "READY_TO_SHIP")).toBe(false);
  });

  it("treats CLOSED and CANCELLED as terminal", () => {
    expect(nextStatuses("CLOSED")).toEqual([]);
    expect(nextStatuses("CANCELLED")).toEqual([]);
    expect(canTransition("CLOSED", "IN_TRANSIT")).toBe(false);
  });

  it("allows stepping back while documents are being prepared", () => {
    expect(canTransition("DOCS_IN_PREP", "PO_CONFIRMED")).toBe(true);
    expect(canTransition("READY_TO_SHIP", "DOCS_IN_PREP")).toBe(true);
  });

  it("allows cancelling before delivery but not after", () => {
    expect(canTransition("IN_TRANSIT", "CANCELLED")).toBe(true);
    expect(canTransition("DELIVERED", "CANCELLED")).toBe(false);
  });
});

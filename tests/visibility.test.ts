/**
 * The confidentiality walls.
 *
 * An exporter's whole job today is being a copy-paste bridge between parties
 * who must not see each other's paperwork. If these assertions ever fail, the
 * product has leaked a document to someone who should never have had it — so
 * they are written as flat statements about the real world, not as coverage.
 *
 * Pure functions only; no database needed.
 */
import { describe, expect, it } from "vitest";
import type { DocumentType, PartyType } from "@prisma/client";
import {
  DEFAULT_VISIBILITY,
  DOCUMENT_LABEL,
  canSeeDocument,
  defaultVisibility,
  explainVisibility,
  hiddenFrom,
  ownerOfDocumentType,
  visibilityWhere,
} from "@/server/domain/visibility";

/** A document carrying the default audience for its type. */
const doc = (type: DocumentType) => ({ type, visibleTo: defaultVisibility(type) });

describe("who can see what", () => {
  it("never shows the buyer the shipping bill", () => {
    expect(canSeeDocument("IMPORTER", doc("SHIPPING_BILL"))).toBe(false);
  });

  it("never shows the buyer the CHA checklist", () => {
    expect(canSeeDocument("IMPORTER", doc("CHECKLIST"))).toBe(false);
  });

  it("keeps the checklist between the exporter and the CHA only", () => {
    expect(canSeeDocument("CHA", doc("CHECKLIST"))).toBe(true);
    expect(canSeeDocument("FORWARDER", doc("CHECKLIST"))).toBe(false);
    expect(canSeeDocument("CARRIER", doc("CHECKLIST"))).toBe(false);
    expect(canSeeDocument("BANK", doc("CHECKLIST"))).toBe(false);
  });

  it("gives the forwarder the shipping bill, because they need it to release the BL", () => {
    expect(canSeeDocument("FORWARDER", doc("SHIPPING_BILL"))).toBe(true);
  });

  it("gives the buyer the certificates they are entitled to", () => {
    expect(canSeeDocument("IMPORTER", doc("PHYTOSANITARY_CERT"))).toBe(true);
    expect(canSeeDocument("IMPORTER", doc("FUMIGATION_CERT"))).toBe(true);
    expect(canSeeDocument("IMPORTER", doc("CERTIFICATE_OF_ORIGIN"))).toBe(true);
    expect(canSeeDocument("IMPORTER", doc("BILL_OF_LADING"))).toBe(true);
  });

  it("lets the exporter see everything — it is their room", () => {
    for (const type of Object.keys(DEFAULT_VISIBILITY) as DocumentType[]) {
      expect(canSeeDocument("EXPORTER", doc(type)), DOCUMENT_LABEL[type]).toBe(true);
      expect(canSeeDocument("OWNER_ORG", doc(type)), DOCUMENT_LABEL[type]).toBe(true);
    }
  });

  it("fails closed on a document nobody has classified", () => {
    for (const viewer of ["IMPORTER", "CHA", "FORWARDER", "CARRIER", "BANK"] as PartyType[]) {
      expect(canSeeDocument(viewer, doc("OTHER"))).toBe(false);
    }
  });

  it("fails closed when visibleTo is empty rather than opening the document up", () => {
    // An older row written before the column existed must not become public.
    expect(canSeeDocument("IMPORTER", { type: "SHIPPING_BILL", visibleTo: [] })).toBe(false);
    expect(canSeeDocument("FORWARDER", { type: "SHIPPING_BILL", visibleTo: [] })).toBe(true);
  });

  it("honours an explicit audience over the type default", () => {
    // The exporter deliberately widened one shipping bill to the buyer.
    const widened = { type: "SHIPPING_BILL" as const, visibleTo: ["EXPORTER", "IMPORTER"] as PartyType[] };
    expect(canSeeDocument("IMPORTER", widened)).toBe(true);
    // ...and by doing so, narrowed it away from the forwarder.
    expect(canSeeDocument("FORWARDER", widened)).toBe(false);
  });

  it("puts the exporter on every row of the policy", () => {
    for (const [type, audience] of Object.entries(DEFAULT_VISIBILITY)) {
      expect(audience, type).toContain("EXPORTER");
    }
  });
});

describe("the query filter matches the predicate", () => {
  // visibilityWhere() is what actually runs against Postgres. If it ever drifts
  // from canSeeDocument(), the UI and the database disagree about a leak.
  const viewers: PartyType[] = ["IMPORTER", "CHA", "FORWARDER", "CARRIER", "BANK"];

  it("produces a `has` filter that agrees with canSeeDocument for every type", () => {
    for (const viewer of viewers) {
      const where = visibilityWhere(viewer);
      expect(where).toEqual({ visibleTo: { has: viewer } });

      for (const type of Object.keys(DEFAULT_VISIBILITY) as DocumentType[]) {
        const audience = defaultVisibility(type);
        const matchesQuery = audience.includes(viewer);
        expect(matchesQuery, `${viewer} / ${type}`).toBe(canSeeDocument(viewer, doc(type)));
      }
    }
  });

  it("does not filter for the exporter", () => {
    expect(visibilityWhere("EXPORTER")).toEqual({});
  });
});

describe("explaining a decision to an operator", () => {
  it("names the parties a document is shared with", () => {
    expect(explainVisibility(doc("SHIPPING_BILL"))).toBe("Shared with CHA, Freight forwarder");
    expect(explainVisibility(doc("PHYTOSANITARY_CERT"))).toBe("Shared with CHA, Buyer");
  });

  it("says so plainly when nothing has been shared", () => {
    expect(explainVisibility(doc("OTHER"))).toBe("Visible to your team only");
  });

  it("names who is excluded — the sentence that stops a mistake", () => {
    expect(hiddenFrom(doc("SHIPPING_BILL"))).toEqual(["IMPORTER"]);
    expect(hiddenFrom(doc("CHECKLIST"))).toEqual(["IMPORTER", "FORWARDER"]);
    expect(hiddenFrom(doc("BILL_OF_LADING"))).toEqual([]);
  });
});

describe("routing a change request to whoever can act on it", () => {
  it("sends customs paperwork back to the CHA", () => {
    expect(ownerOfDocumentType("CHECKLIST")).toBe("CHA");
    expect(ownerOfDocumentType("SHIPPING_BILL")).toBe("CHA");
    expect(ownerOfDocumentType("PHYTOSANITARY_CERT")).toBe("CHA");
    expect(ownerOfDocumentType("FUMIGATION_CERT")).toBe("CHA");
    expect(ownerOfDocumentType("CERTIFICATE_OF_ORIGIN")).toBe("CHA");
  });

  it("sends the BL back to the forwarder", () => {
    expect(ownerOfDocumentType("BL_DRAFT")).toBe("FORWARDER");
    expect(ownerOfDocumentType("BILL_OF_LADING")).toBe("FORWARDER");
  });

  it("keeps the exporter's own paperwork with the exporter", () => {
    expect(ownerOfDocumentType("COMMERCIAL_INVOICE")).toBe("EXPORTER");
    expect(ownerOfDocumentType("PACKING_LIST")).toBe("EXPORTER");
  });

  it("routes every document type somewhere — no orphans", () => {
    for (const type of Object.keys(DEFAULT_VISIBILITY) as DocumentType[]) {
      const owner = ownerOfDocumentType(type);
      expect(defaultVisibility(type), `${type} routes to ${owner} who cannot see it`).toContain(
        owner,
      );
    }
  });
});

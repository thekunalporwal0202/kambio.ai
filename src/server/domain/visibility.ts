import type { DocumentType, PartyType } from "@prisma/client";

/**
 * WHO SEES WHAT.
 *
 * This is the product. An exporter's whole job today is being a copy-paste
 * bridge between parties who must NOT see each other's documents, so the
 * default audience of a document type is a business rule, not a preference.
 *
 * Read this table as: "a document of this type is visible to these parties".
 * EXPORTER is on every row — it is their room.
 */
export const DEFAULT_VISIBILITY: Record<DocumentType, PartyType[]> = {
  // Exporter ↔ CHA only. The CHA's statement of how the shipping bill will be
  // filed is internal working paper; the buyer must never see it.
  CHECKLIST: ["EXPORTER", "CHA"],

  // Filed customs document. Goes to the forwarder/shipping line so they can
  // release the BL — but NOT to the buyer.
  SHIPPING_BILL: ["EXPORTER", "CHA", "FORWARDER"],

  // Buyer-facing certificates produced by the CHA.
  FUMIGATION_CERT: ["EXPORTER", "CHA", "IMPORTER"],
  PHYTOSANITARY_CERT: ["EXPORTER", "CHA", "IMPORTER"],
  CERTIFICATE_OF_ORIGIN: ["EXPORTER", "CHA", "IMPORTER"],

  // The BL loop runs between exporter, forwarder and buyer. The CHA often
  // originates the draft, so they stay on it.
  BL_DRAFT: ["EXPORTER", "CHA", "FORWARDER", "IMPORTER"],
  BILL_OF_LADING: ["EXPORTER", "CHA", "FORWARDER", "IMPORTER"],

  // Commercial paperwork the buyer already has or is entitled to.
  COMMERCIAL_INVOICE: ["EXPORTER", "CHA", "IMPORTER"],
  PACKING_LIST: ["EXPORTER", "CHA", "IMPORTER"],
  PURCHASE_ORDER: ["EXPORTER", "IMPORTER"],

  // The merged set handed over at the end.
  FINAL_DOC_SET: ["EXPORTER", "IMPORTER"],

  // Unknown type: exporter only until a human decides otherwise. Failing
  // closed is the only safe default for a document we cannot classify.
  OTHER: ["EXPORTER"],
};

/** Human-readable label for each document type. */
export const DOCUMENT_LABEL: Record<DocumentType, string> = {
  COMMERCIAL_INVOICE: "Commercial invoice",
  PACKING_LIST: "Packing list",
  PURCHASE_ORDER: "Purchase order",
  CHECKLIST: "Checklist",
  SHIPPING_BILL: "Shipping bill",
  FUMIGATION_CERT: "Fumigation certificate",
  PHYTOSANITARY_CERT: "Phytosanitary certificate",
  CERTIFICATE_OF_ORIGIN: "Certificate of origin",
  BL_DRAFT: "BL draft",
  BILL_OF_LADING: "Bill of lading",
  FINAL_DOC_SET: "Final document set",
  OTHER: "Other document",
};

export const PARTY_LABEL: Record<PartyType, string> = {
  EXPORTER: "Exporter",
  IMPORTER: "Buyer",
  CHA: "CHA",
  FORWARDER: "Freight forwarder",
  CARRIER: "Carrier",
  BANK: "Bank",
};

/** Document types a given party type is expected to PRODUCE. */
export const ISSUED_BY: Record<PartyType, DocumentType[]> = {
  EXPORTER: ["COMMERCIAL_INVOICE", "PACKING_LIST", "FINAL_DOC_SET"],
  CHA: [
    "CHECKLIST",
    "SHIPPING_BILL",
    "FUMIGATION_CERT",
    "PHYTOSANITARY_CERT",
    "CERTIFICATE_OF_ORIGIN",
    "BL_DRAFT",
  ],
  FORWARDER: ["BL_DRAFT", "BILL_OF_LADING"],
  IMPORTER: ["PURCHASE_ORDER"],
  CARRIER: ["BILL_OF_LADING"],
  BANK: [],
};

export function defaultVisibility(type: DocumentType): PartyType[] {
  return DEFAULT_VISIBILITY[type] ?? ["EXPORTER"];
}

/**
 * Can this party type see this document?
 * The exporter's own team always can — it is their shipment.
 */
export function canSeeDocument(
  viewer: PartyType | "OWNER_ORG",
  doc: { type: DocumentType; visibleTo: PartyType[] },
): boolean {
  if (viewer === "OWNER_ORG" || viewer === "EXPORTER") return true;
  const audience = doc.visibleTo?.length ? doc.visibleTo : defaultVisibility(doc.type);
  return audience.includes(viewer);
}

/** Prisma `where` fragment restricting a document query to one party type. */
export function visibilityWhere(viewer: PartyType) {
  return viewer === "EXPORTER" ? {} : { visibleTo: { has: viewer } };
}

/**
 * Explains, in one line, why a party can or cannot see a document — surfaced
 * in the UI so permissions are never a mystery.
 */
export function explainVisibility(doc: { type: DocumentType; visibleTo: PartyType[] }): string {
  const audience = doc.visibleTo?.length ? doc.visibleTo : defaultVisibility(doc.type);
  const others = audience.filter((p) => p !== "EXPORTER");
  if (others.length === 0) return "Visible to your team only";
  return `Shared with ${others.map((p) => PARTY_LABEL[p]).join(", ")}`;
}

/** Parties explicitly excluded — the sentence that matters to an operator. */
export function hiddenFrom(doc: { type: DocumentType; visibleTo: PartyType[] }): PartyType[] {
  const audience = doc.visibleTo?.length ? doc.visibleTo : defaultVisibility(doc.type);
  return (["IMPORTER", "CHA", "FORWARDER"] as PartyType[]).filter((p) => !audience.includes(p));
}

/**
 * Which party should action a change on a given document type?
 * Encodes the real-world division of labour so the operator does not have to
 * remember who prepares what.
 */
export function ownerOfDocumentType(type: DocumentType): PartyType {
  switch (type) {
    case "CHECKLIST":
    case "SHIPPING_BILL":
    case "FUMIGATION_CERT":
    case "PHYTOSANITARY_CERT":
    case "CERTIFICATE_OF_ORIGIN":
      return "CHA";
    case "BL_DRAFT":
    case "BILL_OF_LADING":
      return "FORWARDER";
    default:
      return "EXPORTER";
  }
}

/**
 * Demo seed.
 *
 * Creates one org, a user, and three shipments at different stages so the app
 * is demoable the moment it boots — including a shipment that already has an
 * extracted-but-unconfirmed document waiting in the exceptions queue.
 *
 * Idempotent: safe to run repeatedly.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();

const DEMO_EMAIL = "ops@meridiantextiles.example";
const DEMO_PASSWORD = "kambio-demo";

const PO_EMAIL = `Hi Priya,

Please find our purchase order below for the spring order.

Purchase Order No: PO-4471-B
Incoterm: FOB Nhava Sheva
Currency: USD
Payment terms: 30% advance, balance against BL copy

Description            | HS Code | Qty   | Unit Price | Amount
Cotton poplin shirting | 5208.52 | 4000  | 3.15       | 12600.00
Linen blend fabric     | 5309.29 | 1500  | 6.40       | 9600.00

Total: 22200.00
Port of loading: Nhava Sheva
Port of discharge: Rotterdam
ETD: 2026-09-12
ETA: 2026-10-08

Please confirm and send the proforma invoice.

Regards,
Daan Vermeer
Vermeer Import BV`;

const INVOICE_TEXT = `COMMERCIAL INVOICE

Invoice No: INV-2026-0188
Purchase Order No: PO-3390-A
Invoice Date: 2026-07-14

Seller: Meridian Textiles Pvt Ltd
Buyer: Nordwind Handels GmbH

Incoterm: CIF
Currency: EUR
Payment terms: 60 days from BL date

Description             | HS Code | Qty  | Unit Price | Amount
Bleached cotton twill   | 5209.21 | 2200 | 4.85       | 10670.00
Dyed cotton canvas      | 5209.31 | 900  | 5.60       | 5040.00

Total: 15710.00
Port of loading: Mundra
Port of discharge: Hamburg
ETD: 2026-08-02
ETA: 2026-08-29
Bill of Lading No: MSCU 7741822`;

async function main() {
  console.info("Seeding Kambio demo data…");

  // --- org + user ----------------------------------------------------------
  const org = await prisma.org.upsert({
    where: { slug: "meridian-textiles" },
    update: {},
    create: {
      name: "Meridian Textiles",
      slug: "meridian-textiles",
      inboundKey: "meridian01",
    },
  });

  await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      orgId: org.id,
      email: DEMO_EMAIL,
      name: "Priya Raman",
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      role: "OWNER",
    },
  });

  // A second org proves tenant isolation is real, not theoretical.
  const otherOrg = await prisma.org.upsert({
    where: { slug: "harbour-spices" },
    update: {},
    create: { name: "Harbour Spices", slug: "harbour-spices", inboundKey: "harbour01" },
  });
  await prisma.user.upsert({
    where: { email: "ops@harbourspices.example" },
    update: {},
    create: {
      orgId: otherOrg.id,
      email: "ops@harbourspices.example",
      name: "Anil Kumar",
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      role: "OWNER",
    },
  });

  if ((await prisma.shipment.count({ where: { orgId: org.id } })) > 0) {
    console.info("Demo shipments already present — skipping.");
    return;
  }

  // Local helpers that mirror the domain commands without importing
  // server-only modules (this script runs outside Next).
  let seqByShipment = new Map<string, number>();
  const append = async (
    shipmentId: string,
    type: string,
    payload: unknown,
    actorType: "USER" | "AI" | "SYSTEM" | "COUNTERPARTY",
    actorLabel: string,
  ) => {
    const seq = (seqByShipment.get(shipmentId) ?? 0) + 1;
    seqByShipment.set(shipmentId, seq);
    await prisma.event.create({
      data: {
        orgId: org.id,
        shipmentId,
        seq,
        type,
        payload: payload as never,
        actorType,
        actorLabel,
      },
    });
    await prisma.shipment.update({ where: { id: shipmentId }, data: { lastEventSeq: seq } });
  };

  // --- 1. IN TRANSIT, fully confirmed --------------------------------------
  const s1 = await prisma.shipment.create({
    data: {
      orgId: org.id,
      reference: "KMB-2026-001",
      title: "Cotton twill — Nordwind Handels GmbH",
      status: "IN_TRANSIT",
      poNumber: "PO-3390-A",
      invoiceNumber: "INV-2026-0188",
      incoterm: "CIF",
      currency: "EUR",
      totalValue: 15710,
      originPort: "Mundra",
      destPort: "Hamburg",
      originCountry: "IN",
      destCountry: "DE",
      carrierRef: "MSCU 7741822",
      etd: new Date("2026-08-02"),
      eta: new Date("2026-08-29"),
      inboundToken: nanoid(12).toLowerCase(),
    },
  });

  await append(s1.id, "shipment.created", {
    reference: s1.reference,
    title: s1.title,
    origin: "email",
  }, "SYSTEM", "Kambio");

  const p1 = await prisma.party.create({
    data: {
      orgId: org.id,
      shipmentId: s1.id,
      type: "IMPORTER",
      name: "Nordwind Handels GmbH",
      email: "einkauf@nordwind.example",
      channel: "EMAIL",
    },
  });
  await append(s1.id, "party.added", {
    partyId: p1.id,
    type: "IMPORTER",
    name: p1.name,
    email: p1.email,
    phone: null,
    channel: "EMAIL",
  }, "SYSTEM", "Kambio");

  await prisma.party.create({
    data: {
      orgId: org.id,
      shipmentId: s1.id,
      type: "FORWARDER",
      name: "Seabridge Logistics",
      email: "ops@seabridge.example",
      channel: "EMAIL",
    },
  });

  const invoiceDoc = await prisma.document.create({
    data: {
      orgId: org.id,
      shipmentId: s1.id,
      type: "COMMERCIAL_INVOICE",
      name: "INV-2026-0188.txt",
      family: "COMMERCIAL_INVOICE",
      version: 1,
      fileRef: `seed/${s1.id}/invoice.txt`,
      mimeType: "text/plain",
      sizeBytes: INVOICE_TEXT.length,
      extractionStatus: "CONFIRMED",
      confidence: 0.94,
      confirmedAt: new Date(),
      extractedData: {
        documentType: "COMMERCIAL_INVOICE",
        overallConfidence: 0.94,
        fields: {
          invoiceNumber: {
            value: "INV-2026-0188",
            confidence: 0.97,
            sourceSnippet: "Invoice No: INV-2026-0188",
          },
          poNumber: {
            value: "PO-3390-A",
            confidence: 0.95,
            sourceSnippet: "Purchase Order No: PO-3390-A",
          },
          incoterm: { value: "CIF", confidence: 0.93, sourceSnippet: "Incoterm: CIF" },
          currency: { value: "EUR", confidence: 0.96, sourceSnippet: "Currency: EUR" },
          totalValue: { value: 15710, confidence: 0.92, sourceSnippet: "Total: 15710.00" },
          carrierRef: {
            value: "MSCU 7741822",
            confidence: 0.9,
            sourceSnippet: "Bill of Lading No: MSCU 7741822",
          },
        },
        lineItems: [
          {
            description: "Bleached cotton twill",
            hsCode: "5209.21",
            quantity: 2200,
            unit: null,
            unitPrice: 4.85,
            amount: 10670,
            confidence: 0.93,
          },
          {
            description: "Dyed cotton canvas",
            hsCode: "5209.31",
            quantity: 900,
            unit: null,
            unitPrice: 5.6,
            amount: 5040,
            confidence: 0.91,
          },
        ],
      } as never,
    },
  });

  await append(s1.id, "document.uploaded", {
    documentId: invoiceDoc.id,
    family: "COMMERCIAL_INVOICE",
    version: 1,
    type: "COMMERCIAL_INVOICE",
    name: invoiceDoc.name,
    fileRef: invoiceDoc.fileRef,
    mimeType: "text/plain",
    sizeBytes: INVOICE_TEXT.length,
  }, "USER", "Priya Raman");
  await append(s1.id, "document.extraction_completed", {
    documentId: invoiceDoc.id,
    overallConfidence: 0.94,
    lowConfidenceFields: [],
    provider: "mock",
    model: "mock-rules-v1",
  }, "AI", "Kambio AI");
  await append(s1.id, "document.fields_confirmed", {
    documentId: invoiceDoc.id,
    correctedFields: [],
  }, "USER", "Priya Raman");
  for (const [from, to] of [
    ["DRAFT", "PO_CONFIRMED"],
    ["PO_CONFIRMED", "DOCS_IN_PREP"],
    ["DOCS_IN_PREP", "READY_TO_SHIP"],
    ["READY_TO_SHIP", "IN_TRANSIT"],
  ] as const) {
    await append(s1.id, "shipment.status_changed", { from, to }, "USER", "Priya Raman");
  }

  await prisma.buyerLink.create({
    data: {
      orgId: org.id,
      shipmentId: s1.id,
      token: "demo-buyer-nordwind",
      label: "Nordwind buyer view",
      viewCount: 3,
      lastViewedAt: new Date(),
    },
  });

  // --- 2. NEEDS REVIEW — the exceptions-first demo -------------------------
  const s2 = await prisma.shipment.create({
    data: {
      orgId: org.id,
      reference: "KMB-2026-002",
      title: "Purchase Order PO-4471-B — spring order",
      status: "DRAFT",
      inboundToken: nanoid(12).toLowerCase(),
    },
  });
  await append(s2.id, "shipment.created", {
    reference: s2.reference,
    title: s2.title,
    origin: "email",
  }, "SYSTEM", "Kambio");

  const buyer2 = await prisma.party.create({
    data: {
      orgId: org.id,
      shipmentId: s2.id,
      type: "IMPORTER",
      name: "Daan Vermeer",
      email: "daan@vermeer-import.example",
      channel: "EMAIL",
    },
  });
  await append(s2.id, "party.added", {
    partyId: buyer2.id,
    type: "IMPORTER",
    name: buyer2.name,
    email: buyer2.email,
    phone: null,
    channel: "EMAIL",
  }, "SYSTEM", "Kambio");

  const poMessage = await prisma.message.create({
    data: {
      orgId: org.id,
      shipmentId: s2.id,
      channel: "EMAIL",
      direction: "INBOUND",
      fromAddress: "daan@vermeer-import.example",
      toAddress: "po+meridian01@parse.kambio.app",
      subject: "Purchase Order PO-4471-B — spring order",
      rawText: PO_EMAIL,
      externalId: "seed-po-4471",
      parsedIntent: "DOC_SUBMISSION",
      intentConfidence: 0.86,
      sourceSnippet: "Please find our purchase order below for the spring order.",
      parsedPayload: {
        proposedAction: "File the attached purchase order into the shipment workspace.",
      } as never,
    },
  });
  await append(s2.id, "message.received", {
    messageId: poMessage.id,
    channel: "EMAIL",
    from: poMessage.fromAddress,
    subject: poMessage.subject,
    preview: PO_EMAIL.slice(0, 240),
  }, "COUNTERPARTY", "Daan Vermeer");
  await append(s2.id, "message.intent_classified", {
    messageId: poMessage.id,
    intent: "DOC_SUBMISSION",
    confidence: 0.86,
    sourceSnippet: "Please find our purchase order below for the spring order.",
    proposal: "File the attached purchase order into the shipment workspace.",
  }, "AI", "Kambio AI");

  const poDoc = await prisma.document.create({
    data: {
      orgId: org.id,
      shipmentId: s2.id,
      type: "PURCHASE_ORDER",
      name: "Purchase Order PO-4471-B.txt",
      family: "PURCHASE_ORDER",
      version: 1,
      fileRef: `seed/${s2.id}/po.txt`,
      mimeType: "text/plain",
      sizeBytes: PO_EMAIL.length,
      extractionStatus: "NEEDS_REVIEW",
      confidence: 0.87,
      extractedData: {
        documentType: "PURCHASE_ORDER",
        overallConfidence: 0.87,
        fields: {
          poNumber: {
            value: "PO-4471-B",
            confidence: 0.94,
            sourceSnippet: "Purchase Order No: PO-4471-B",
          },
          incoterm: {
            value: "FOB",
            confidence: 0.91,
            sourceSnippet: "Incoterm: FOB Nhava Sheva",
          },
          currency: { value: "USD", confidence: 0.9, sourceSnippet: "Currency: USD" },
          totalValue: { value: 22200, confidence: 0.88, sourceSnippet: "Total: 22200.00" },
          originPort: {
            value: "Nhava Sheva",
            confidence: 0.86,
            sourceSnippet: "Port of loading: Nhava Sheva",
          },
          destPort: {
            value: "Rotterdam",
            confidence: 0.84,
            sourceSnippet: "Port of discharge: Rotterdam",
          },
          etd: { value: "2026-09-12", confidence: 0.83, sourceSnippet: "ETD: 2026-09-12" },
          // Deliberately low — this is what puts the shipment in the exceptions list.
          eta: { value: "2026-10-08", confidence: 0.79, sourceSnippet: "ETA: 2026-10-08" },
          paymentTerms: {
            value: "30% advance, balance against BL copy",
            confidence: 0.72,
            sourceSnippet: "Payment terms: 30% advance, balance against BL copy",
          },
        },
        lineItems: [
          {
            description: "Cotton poplin shirting",
            hsCode: "5208.52",
            quantity: 4000,
            unit: null,
            unitPrice: 3.15,
            amount: 12600,
            confidence: 0.89,
          },
          {
            description: "Linen blend fabric",
            hsCode: "5309.29",
            quantity: 1500,
            unit: null,
            unitPrice: 6.4,
            amount: 9600,
            confidence: 0.87,
          },
        ],
      } as never,
    },
  });

  await append(s2.id, "document.uploaded", {
    documentId: poDoc.id,
    family: "PURCHASE_ORDER",
    version: 1,
    type: "PURCHASE_ORDER",
    name: poDoc.name,
    fileRef: poDoc.fileRef,
    mimeType: "text/plain",
    sizeBytes: PO_EMAIL.length,
  }, "SYSTEM", "Kambio");
  await append(s2.id, "document.extraction_completed", {
    documentId: poDoc.id,
    overallConfidence: 0.87,
    lowConfidenceFields: ["eta", "paymentTerms"],
    provider: "mock",
    model: "mock-rules-v1",
  }, "AI", "Kambio AI");

  const reviewTask = await prisma.task.create({
    data: {
      orgId: org.id,
      shipmentId: s2.id,
      title: "Review extracted data — Purchase Order PO-4471-B.txt",
      detail: "2 field(s) below 85% confidence: eta, paymentTerms",
      severity: "BLOCKER",
      subjectRef: `document:${poDoc.id}`,
    },
  });
  await append(s2.id, "task.created", {
    taskId: reviewTask.id,
    title: reviewTask.title,
    severity: "BLOCKER",
    subjectRef: reviewTask.subjectRef,
  }, "AI", "Kambio AI");

  const draft = await prisma.message.create({
    data: {
      orgId: org.id,
      shipmentId: s2.id,
      channel: "EMAIL",
      direction: "OUTBOUND",
      toAddress: "daan@vermeer-import.example",
      subject: "Re: Purchase Order PO-4471-B — spring order",
      rawText:
        "Received, thank you. We have filed the purchase order against your shipment and will confirm once it has been checked.\n\nBest regards,\nPriya Raman",
      intentConfidence: 0.8,
      parsedPayload: {
        draft: true,
        replyTo: poMessage.id,
        rationale:
          "Template reply for a DOC_SUBMISSION message; asserts only facts present in the shipment context.",
      } as never,
    },
  });
  await append(s2.id, "message.reply_drafted", {
    messageId: draft.id,
    draft: draft.rawText.slice(0, 500),
    confidence: 0.8,
  }, "AI", "Kambio AI");

  // --- 3. APPROVAL claim awaiting a human ----------------------------------
  const s3 = await prisma.shipment.create({
    data: {
      orgId: org.id,
      reference: "KMB-2026-003",
      title: "Organic cotton yarn — Atlas Trading LLC",
      status: "DOCS_IN_PREP",
      poNumber: "PO-5120-C",
      invoiceNumber: "INV-2026-0192",
      incoterm: "FOB",
      currency: "USD",
      totalValue: 41300,
      originPort: "Tuticorin",
      destPort: "Jebel Ali",
      etd: new Date("2026-09-01"),
      inboundToken: nanoid(12).toLowerCase(),
    },
  });
  await append(s3.id, "shipment.created", {
    reference: s3.reference,
    title: s3.title,
    origin: "manual",
  }, "USER", "Priya Raman");
  await append(s3.id, "shipment.status_changed", { from: "DRAFT", to: "PO_CONFIRMED" }, "USER", "Priya Raman");
  await append(s3.id, "shipment.status_changed", { from: "PO_CONFIRMED", to: "DOCS_IN_PREP" }, "USER", "Priya Raman");

  const buyer3 = await prisma.party.create({
    data: {
      orgId: org.id,
      shipmentId: s3.id,
      type: "IMPORTER",
      name: "Atlas Trading LLC",
      email: "procurement@atlas-trading.example",
      phone: "+971500000123",
      channel: "WHATSAPP",
    },
  });
  await append(s3.id, "party.added", {
    partyId: buyer3.id,
    type: "IMPORTER",
    name: buyer3.name,
    email: buyer3.email,
    phone: buyer3.phone,
    channel: "WHATSAPP",
  }, "SYSTEM", "Kambio");

  const approvalMsg = await prisma.message.create({
    data: {
      orgId: org.id,
      shipmentId: s3.id,
      channel: "WHATSAPP",
      direction: "INBOUND",
      fromAddress: "+971500000123",
      rawText: "Invoice v3 approved from our side. Please proceed with the booking.",
      externalId: "seed-wa-approval",
      parsedIntent: "APPROVAL",
      intentConfidence: 0.93,
      sourceSnippet: "Invoice v3 approved from our side.",
      parsedPayload: {
        approves: "Invoice v3",
        proposedAction: "Mark the referenced document as approved and advance the shipment.",
      } as never,
    },
  });
  await append(s3.id, "message.received", {
    messageId: approvalMsg.id,
    channel: "WHATSAPP",
    from: approvalMsg.fromAddress,
    subject: null,
    preview: approvalMsg.rawText,
  }, "COUNTERPARTY", "Atlas Trading LLC");
  await append(s3.id, "message.intent_classified", {
    messageId: approvalMsg.id,
    intent: "APPROVAL",
    confidence: 0.93,
    sourceSnippet: "Invoice v3 approved from our side.",
    proposal: "Mark the referenced document as approved and advance the shipment.",
  }, "AI", "Kambio AI");

  const approval = await prisma.approval.create({
    data: {
      orgId: org.id,
      shipmentId: s3.id,
      subject: "Invoice v3",
      subjectRef: `message:${approvalMsg.id}`,
      state: "REQUESTED",
      evidenceMessageId: approvalMsg.id,
    },
  });
  await append(s3.id, "approval.requested", {
    approvalId: approval.id,
    subject: approval.subject,
    subjectRef: approval.subjectRef,
  }, "AI", "Kambio AI");

  const approvalTask = await prisma.task.create({
    data: {
      orgId: org.id,
      shipmentId: s3.id,
      title: "Confirm buyer approval: Invoice v3",
      detail: "Invoice v3 approved from our side.",
      severity: "BLOCKER",
      subjectRef: `approval:${approval.id}`,
    },
  });
  await append(s3.id, "task.created", {
    taskId: approvalTask.id,
    title: approvalTask.title,
    severity: "BLOCKER",
    subjectRef: approvalTask.subjectRef,
  }, "AI", "Kambio AI");

  // --- the relay room: CHA + forwarder on shipment 3 -----------------------
  //
  // This is the part of the demo that shows the real job. The exporter is not
  // emailing documents around; every party stands in the same room and sees
  // only their own slice of it.

  // The address book. The CHA is standing (isDefault → attaches to every new
  // shipment); the forwarder is chosen per shipment.
  const chaBook = await prisma.counterparty.create({
    data: {
      orgId: org.id,
      type: "CHA",
      name: "Clearline Customs Services",
      email: "docs@clearline-cha.example",
      isDefault: true,
    },
  });
  await prisma.counterparty.create({
    data: {
      orgId: org.id,
      type: "FORWARDER",
      name: "Seabridge Logistics",
      email: "ops@seabridge.example",
    },
  });

  const cha3 = await prisma.party.create({
    data: {
      orgId: org.id,
      shipmentId: s3.id,
      type: "CHA",
      name: "Clearline Customs Services",
      email: "docs@clearline-cha.example",
      channel: "EMAIL",
      counterpartyId: chaBook.id,
      portalEnabled: true,
      portalToken: "demo-cha-clearline",
      canUpload: true,
      viewCount: 4,
      lastViewedAt: new Date(),
    },
  });
  await append(s3.id, "party.added", {
    partyId: cha3.id,
    type: "CHA",
    name: cha3.name,
    email: cha3.email,
    phone: null,
    channel: "EMAIL",
  }, "USER", "Priya Raman");

  const fwd3 = await prisma.party.create({
    data: {
      orgId: org.id,
      shipmentId: s3.id,
      type: "FORWARDER",
      name: "Seabridge Logistics",
      email: "ops@seabridge.example",
      channel: "EMAIL",
      portalEnabled: true,
      portalToken: "demo-fwd-seabridge",
      canUpload: true,
      viewCount: 1,
    },
  });
  await append(s3.id, "party.added", {
    partyId: fwd3.id,
    type: "FORWARDER",
    name: fwd3.name,
    email: fwd3.email,
    phone: null,
    channel: "EMAIL",
  }, "USER", "Priya Raman");

  // Documents, each with the audience its type dictates. The whole point of
  // the demo is the two rows the buyer must never see.
  const relayDocs = [
    {
      type: "CHECKLIST" as const,
      name: "Shipping bill checklist — draft 2.pdf",
      // Exporter ↔ CHA only. Not the buyer, not the forwarder.
      visibleTo: ["EXPORTER", "CHA"] as const,
      issuedBy: cha3.id,
      status: "CONFIRMED" as const,
      confidence: 0.91,
    },
    {
      type: "SHIPPING_BILL" as const,
      name: "Shipping bill 7741903.pdf",
      // Forwarder needs it to release the BL. The buyer never does.
      visibleTo: ["EXPORTER", "CHA", "FORWARDER"] as const,
      issuedBy: cha3.id,
      status: "CONFIRMED" as const,
      confidence: 0.93,
    },
    {
      type: "PHYTOSANITARY_CERT" as const,
      name: "Phytosanitary certificate.pdf",
      visibleTo: ["EXPORTER", "CHA", "IMPORTER"] as const,
      issuedBy: cha3.id,
      status: "CONFIRMED" as const,
      confidence: 0.88,
    },
    {
      type: "BL_DRAFT" as const,
      name: "BL draft — SEAB-2026-4471.pdf",
      visibleTo: ["EXPORTER", "CHA", "FORWARDER", "IMPORTER"] as const,
      issuedBy: fwd3.id,
      status: "CONFIRMED" as const,
      confidence: 0.9,
    },
  ];

  const relayDocIds = new Map<string, string>();
  for (const spec of relayDocs) {
    const doc = await prisma.document.create({
      data: {
        orgId: org.id,
        shipmentId: s3.id,
        type: spec.type,
        name: spec.name,
        family: spec.type,
        version: 1,
        fileRef: `seed/${s3.id}/${spec.type.toLowerCase()}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 48_000,
        visibleTo: [...spec.visibleTo],
        issuedByPartyId: spec.issuedBy,
        extractionStatus: spec.status,
        confidence: spec.confidence,
        confirmedAt: new Date(),
      },
    });
    relayDocIds.set(spec.type, doc.id);

    await append(s3.id, "document.uploaded", {
      documentId: doc.id,
      family: doc.family,
      version: 1,
      type: spec.type,
      name: doc.name,
      fileRef: doc.fileRef,
      mimeType: "application/pdf",
      sizeBytes: 48_000,
    }, "COUNTERPARTY", spec.issuedBy === cha3.id ? cha3.name : fwd3.name);
    await append(s3.id, "document.shared", {
      documentId: doc.id,
      visibleTo: [...spec.visibleTo],
    }, "SYSTEM", "Kambio");
  }

  // Round 1 on the checklist: the exporter asked, the CHA answered.
  const checklistApproval = await prisma.approval.create({
    data: {
      orgId: org.id,
      shipmentId: s3.id,
      documentId: relayDocIds.get("CHECKLIST")!,
      partyId: cha3.id,
      subject: "Checklist v1",
      subjectRef: `document:${relayDocIds.get("CHECKLIST")}`,
      state: "GRANTED",
      round: 1,
      decidedAt: new Date(Date.now() - 36 * 60 * 60 * 1000),
    },
  });
  await append(s3.id, "approval.requested", {
    approvalId: checklistApproval.id,
    subject: checklistApproval.subject,
    subjectRef: checklistApproval.subjectRef,
  }, "USER", "Priya Raman");
  await append(s3.id, "approval.decided", {
    approvalId: checklistApproval.id,
    state: "GRANTED",
    evidenceMessageId: null,
  }, "COUNTERPARTY", cha3.name);

  // The overdue one. `dueAt` is already in the past and reminderCount is 0, so
  // the follow-up sweep chases it the first time it runs — press "Run
  // follow-up sweep now" on the dashboard and watch it fire.
  const blApproval = await prisma.approval.create({
    data: {
      orgId: org.id,
      shipmentId: s3.id,
      documentId: relayDocIds.get("BL_DRAFT")!,
      partyId: buyer3.id,
      subject: "BL draft v1",
      subjectRef: `document:${relayDocIds.get("BL_DRAFT")}`,
      state: "REQUESTED",
      round: 1,
      createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    },
  });
  await append(s3.id, "approval.requested", {
    approvalId: blApproval.id,
    subject: blApproval.subject,
    subjectRef: blApproval.subjectRef,
  }, "USER", "Priya Raman");

  // The buyer's read-only link into the same room. Open it next to the CHA's
  // link above: the shipping bill and the checklist are simply not there.
  await prisma.buyerLink.create({
    data: {
      orgId: org.id,
      shipmentId: s3.id,
      token: "demo-buyer-atlas",
      label: "Atlas Trading buyer view",
    },
  });

  // One chain per shipment per party. Every message Kambio sends this CHA
  // about KMB-2026-003 lands in this one thread — never a new email each time.
  for (const [shipment, party] of [
    [s3, cha3],
    [s3, fwd3],
    [s2, buyer2],
  ] as const) {
    await prisma.emailThread.create({
      data: {
        orgId: org.id,
        shipmentId: shipment.id,
        partyId: party.id,
        subject: `[${shipment.reference}] ${shipment.title}`,
        referenceIds: [],
      },
    });
  }

  // Some AI cost history so the ROI page has data.
  await prisma.aiCall.createMany({
    data: [
      { orgId: org.id, shipmentId: s1.id, task: "extract_document", provider: "mock", model: "mock-rules-v1", inputTokens: 620, outputTokens: 124, costUsd: 0, latencyMs: 8 },
      { orgId: org.id, shipmentId: s2.id, task: "extract_document", provider: "mock", model: "mock-rules-v1", inputTokens: 540, outputTokens: 108, costUsd: 0, latencyMs: 6 },
      { orgId: org.id, shipmentId: s2.id, task: "classify_message", provider: "mock", model: "mock-rules-v1", inputTokens: 180, outputTokens: 36, costUsd: 0, latencyMs: 3 },
      { orgId: org.id, shipmentId: s2.id, task: "draft_reply", provider: "mock", model: "mock-rules-v1", inputTokens: 210, outputTokens: 42, costUsd: 0, latencyMs: 4 },
      { orgId: org.id, shipmentId: s3.id, task: "classify_message", provider: "mock", model: "mock-rules-v1", inputTokens: 96, outputTokens: 19, costUsd: 0, latencyMs: 2 },
    ],
  });

  console.info(`
Seed complete.

  Sign in:  ${DEMO_EMAIL}
  Password: ${DEMO_PASSWORD}

  Org intake address: po+${org.inboundKey}@parse.kambio.app

  The permissioned room (KMB-2026-003):
    Buyer view      /s/demo-buyer-atlas       — no shipping bill, no checklist
    CHA room        /p/demo-cha-clearline     — checklist + shipping bill
    Forwarder room  /p/demo-fwd-seabridge     — shipping bill + BL draft, no checklist

  The BL draft approval is already overdue — run the follow-up sweep from the
  dashboard to watch the chaser go out.
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

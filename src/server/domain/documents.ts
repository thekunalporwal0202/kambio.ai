import "server-only";
import { env } from "@/env";
import { ai } from "../ai/gateway";
import type { ExtractionResult } from "../ai/types";
import { ocr } from "../ocr";
import { queue } from "../queue";
import { documentKey, storage } from "../storage";
import { tenantDb } from "../tenant";
import type { DocumentType, PartyType } from "@prisma/client";
import { AI_ACTOR, type Actor } from "./events";
import { defaultVisibility } from "./visibility";
import { appendEvent } from "./ledger";
import { createTask, updateTradeFields } from "./shipments";

type DocType = DocumentType;

/** Documents in the same family are versions of one logical document. */
function familyFor(type: DocType, name: string) {
  return type === "OTHER" ? `other:${name.toLowerCase().replace(/\s+/g, "-")}` : type;
}

export async function uploadDocument(args: {
  orgId: string;
  shipmentId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  type?: DocType;
  actor: Actor;
  /** The counterparty that produced this document, when not the exporter. */
  issuedByPartyId?: string | null;
  /** Override the type's default audience. Omit to use the policy default. */
  visibleTo?: PartyType[];
}) {
  const db = tenantDb(args.orgId);
  const type = args.type ?? "OTHER";
  const family = familyFor(type, args.fileName);

  const previous = await db.document.findFirst({
    where: { shipmentId: args.shipmentId, family },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (previous?.version ?? 0) + 1;

  const key = documentKey(args.orgId, args.shipmentId, args.fileName);
  await storage().put(key, args.buffer, args.mimeType);

  // WHO MAY SEE IT is decided here, from the document type, unless the caller
  // is explicit. Failing to the type's default is what keeps a CHA checklist
  // away from the buyer without anyone having to remember.
  const visibleTo = args.visibleTo ?? defaultVisibility(type);

  const doc = await db.document.create({
    data: {
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      type,
      name: args.fileName,
      family,
      version,
      fileRef: key,
      mimeType: args.mimeType,
      sizeBytes: args.buffer.byteLength,
      extractionStatus: "PENDING",
      visibleTo,
      issuedByPartyId: args.issuedByPartyId ?? null,
    },
  });

  await appendEvent({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    type: "document.shared",
    payload: { documentId: doc.id, audience: visibleTo },
    actor: args.actor,
  });

  await appendEvent({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    type: "document.uploaded",
    payload: {
      documentId: doc.id,
      family,
      version,
      type,
      name: args.fileName,
      fileRef: key,
      mimeType: args.mimeType,
      sizeBytes: args.buffer.byteLength,
    },
    actor: args.actor,
  });

  await queue().enqueue("document.extract", {
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    documentId: doc.id,
  });

  return doc;
}

/**
 * Job handler: OCR → LLM extraction → persist with provenance.
 * Idempotent — re-running on an already-CONFIRMED document is a no-op.
 */
export async function extractDocument(args: {
  orgId: string;
  shipmentId: string;
  documentId: string;
}) {
  const db = tenantDb(args.orgId);
  const doc = await db.document.findUnique({ where: { id: args.documentId } });
  if (!doc) throw new Error(`Document ${args.documentId} not found`);
  if (doc.extractionStatus === "CONFIRMED") return;

  await db.document.update({
    where: { id: doc.id },
    data: { extractionStatus: "PROCESSING" },
  });

  try {
    const buffer = await storage().get(doc.fileRef);
    const { text } = await ocr().extractText({
      buffer,
      mimeType: doc.mimeType,
      fileName: doc.name,
    });

    const { data, usage } = await ai.extractDocument(
      { orgId: args.orgId, shipmentId: args.shipmentId },
      {
        text,
        fileName: doc.name,
        hintedType: doc.type === "OTHER" ? undefined : (doc.type as DocType),
      },
    );

    const lowConfidence = Object.entries(data.fields)
      .filter(([, f]) => f.confidence < env.EXTRACTION_REVIEW_THRESHOLD)
      .map(([name]) => name);

    const resolvedType = doc.type === "OTHER" ? data.documentType : doc.type;
    await db.document.update({
      where: { id: doc.id },
      data: {
        type: resolvedType,
        extractedData: data as never,
        confidence: data.overallConfidence,
        extractionStatus: "NEEDS_REVIEW",
        // Reclassification changes who may see it — e.g. an unlabelled upload
        // recognised as a CHECKLIST must immediately stop being buyer-visible.
        ...(resolvedType !== doc.type ? { visibleTo: defaultVisibility(resolvedType) } : {}),
      },
    });

    await appendEvent({
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      type: "document.extraction_completed",
      payload: {
        documentId: doc.id,
        overallConfidence: data.overallConfidence,
        lowConfidenceFields: lowConfidence,
        provider: usage.provider,
        model: usage.model,
      },
      actor: AI_ACTOR,
    });

    // Everything AI produced needs a human before it counts.
    await createTask({
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      title: `Review extracted data — ${doc.name}`,
      detail: lowConfidence.length
        ? `${lowConfidence.length} field(s) below ${Math.round(env.EXTRACTION_REVIEW_THRESHOLD * 100)}% confidence: ${lowConfidence.join(", ")}`
        : `Confirm the ${Math.round(data.overallConfidence * 100)}% confidence extraction.`,
      severity: lowConfidence.length ? "BLOCKER" : "WARNING",
      subjectRef: `document:${doc.id}`,
      actor: AI_ACTOR,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.document.update({
      where: { id: doc.id },
      data: { extractionStatus: "FAILED" },
    });
    await appendEvent({
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      type: "document.extraction_failed",
      payload: { documentId: doc.id, error: message },
      actor: AI_ACTOR,
    });
    await createTask({
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      title: `Extraction failed — ${doc.name}`,
      detail: message,
      severity: "BLOCKER",
      subjectRef: `document:${doc.id}`,
      actor: AI_ACTOR,
    });
    throw err;
  }
}

/**
 * The human commit step. Corrected values overwrite AI values, the correction
 * is recorded (training signal), and only then do the fields reach the shipment.
 */
export async function confirmExtraction(args: {
  orgId: string;
  documentId: string;
  corrections: Record<string, string | number | null>;
  actor: Actor;
  userId: string;
}) {
  if (args.actor.type === "AI") throw new Error("AI may not confirm its own extraction");

  const db = tenantDb(args.orgId);
  const doc = await db.document.findUnique({ where: { id: args.documentId } });
  if (!doc) throw new Error("Document not found");

  const extracted = (doc.extractedData ?? { fields: {}, lineItems: [] }) as unknown as ExtractionResult;
  const fields = { ...(extracted.fields ?? {}) };
  const correctedFields: string[] = [];

  for (const [key, value] of Object.entries(args.corrections)) {
    const current = fields[key];
    if (current && String(current.value ?? "") === String(value ?? "")) continue;
    correctedFields.push(key);
    fields[key] = {
      value: value ?? null,
      confidence: 1, // human-verified
      sourceSnippet: current?.sourceSnippet ?? null,
    };
  }

  const merged: ExtractionResult = { ...extracted, fields };

  await db.document.update({
    where: { id: args.documentId },
    data: {
      extractedData: merged as never,
      extractionStatus: "CONFIRMED",
      confirmedById: args.userId,
      confirmedAt: new Date(),
    },
  });

  await appendEvent({
    orgId: args.orgId,
    shipmentId: doc.shipmentId,
    type: "document.fields_confirmed",
    payload: { documentId: args.documentId, correctedFields },
    actor: args.actor,
  });

  // Confirmed values become shipment truth.
  const v = (k: string) => fields[k]?.value ?? null;
  const num = (k: string) => {
    const raw = v(k);
    const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  await updateTradeFields({
    orgId: args.orgId,
    shipmentId: doc.shipmentId,
    derivedFrom: `document:${args.documentId}`,
    trade: {
      poNumber: v("poNumber"),
      invoiceNumber: v("invoiceNumber"),
      incoterm: v("incoterm"),
      currency: v("currency"),
      totalValue: num("totalValue"),
      originPort: v("originPort"),
      destPort: v("destPort"),
      carrierRef: v("carrierRef"),
      etd: v("etd"),
      eta: v("eta"),
    },
    actor: args.actor,
  });

  // Close the review task this document raised.
  const tasks = await db.task.findMany({
    where: { shipmentId: doc.shipmentId, subjectRef: `document:${args.documentId}`, status: "OPEN" },
  });
  for (const task of tasks) {
    await db.task.update({ where: { id: task.id }, data: { status: "DONE", closedAt: new Date() } });
    await appendEvent({
      orgId: args.orgId,
      shipmentId: doc.shipmentId,
      type: "task.closed",
      payload: { taskId: task.id, outcome: "DONE" },
      actor: args.actor,
    });
  }

  return { correctedFields };
}

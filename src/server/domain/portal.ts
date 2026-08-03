import "server-only";
import { nanoid } from "nanoid";
import type { DocumentType } from "@prisma/client";
import { prisma } from "../db";
import { tenantDb } from "../tenant";
import { getSession } from "../auth";
import { appendEvent } from "./ledger";
import { SYSTEM_ACTOR, type Actor } from "./events";
import { visibleDocuments } from "./relay";
import { defaultVisibility } from "./visibility";
import { uploadDocument } from "./documents";
import { createTask } from "./shipments";

/**
 * PARTICIPANT ACCESS.
 *
 * The exporter decides per counterparty how they take part:
 *   - a scoped guest link (/p/<token>) — zero install, the default;
 *   - a real account (User with role PARTNER linked to their Party rows);
 *   - neither, and everything stays pure email relay.
 *
 * All three land on the same portal, and all three see exactly the documents
 * their party type is entitled to — never more.
 */

export type PortalContext = {
  party: {
    id: string;
    name: string;
    type: "EXPORTER" | "IMPORTER" | "CHA" | "FORWARDER" | "CARRIER" | "BANK";
    canUpload: boolean;
  };
  shipment: {
    id: string;
    reference: string;
    title: string;
    status: string;
    originPort: string | null;
    destPort: string | null;
    etd: Date | null;
    eta: Date | null;
  };
  orgId: string;
  orgName: string;
};

/** Enable (or rotate) a guest link for a party. */
export async function enablePortal(args: { orgId: string; partyId: string; actor: Actor }) {
  const db = tenantDb(args.orgId);
  const party = await db.party.update({
    where: { id: args.partyId },
    data: { portalEnabled: true, portalToken: nanoid(28), canUpload: true },
  });
  return party;
}

export async function revokePortal(args: { orgId: string; partyId: string }) {
  const db = tenantDb(args.orgId);
  return db.party.update({
    where: { id: args.partyId },
    data: { portalEnabled: false, portalToken: null },
  });
}

/** Resolve a guest token into a portal context, or null. */
export async function contextFromToken(token: string): Promise<PortalContext | null> {
  const party = await prisma.party.findUnique({
    where: { portalToken: token },
    include: { shipment: { include: { org: { select: { name: true } } } } },
  });
  if (!party || !party.portalEnabled) return null;

  await prisma.party.update({
    where: { id: party.id },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });

  return {
    party: { id: party.id, name: party.name, type: party.type, canUpload: party.canUpload },
    shipment: {
      id: party.shipment.id,
      reference: party.shipment.reference,
      title: party.shipment.title,
      status: party.shipment.status,
      originPort: party.shipment.originPort,
      destPort: party.shipment.destPort,
      etd: party.shipment.etd,
      eta: party.shipment.eta,
    },
    orgId: party.orgId,
    orgName: party.shipment.org.name,
  };
}

/**
 * Resolve a logged-in PARTNER user into the parties they represent.
 * This is the "they wanted a real account" path.
 */
export async function partnerShipments() {
  const session = await getSession();
  if (!session || session.role !== "PARTNER") return null;

  const parties = await prisma.party.findMany({
    where: { userId: session.userId },
    include: { shipment: { select: { id: true, reference: true, title: true, status: true, updatedAt: true } } },
    orderBy: { createdAt: "desc" },
  });

  return { session, parties };
}

/** What this participant may see, plus what is being asked of them. */
export async function portalPayload(ctx: PortalContext) {
  const db = tenantDb(ctx.orgId);

  const [documents, approvals, messages] = await Promise.all([
    visibleDocuments({ orgId: ctx.orgId, shipmentId: ctx.shipment.id, viewer: ctx.party.type }),
    db.approval.findMany({
      where: { shipmentId: ctx.shipment.id, partyId: ctx.party.id },
      orderBy: { createdAt: "desc" },
      include: { document: { select: { id: true, name: true, type: true, version: true } } },
    }),
    // Only the conversation with THIS party — never another party's thread.
    db.message.findMany({
      where: {
        shipmentId: ctx.shipment.id,
        OR: [
          { direction: "OUTBOUND", toAddress: { not: null } },
          { direction: "INBOUND" },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return { documents, approvals, messages };
}

/** A participant uploads a document into the room. */
export async function portalUpload(args: {
  ctx: PortalContext;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  type: DocumentType;
}) {
  if (!args.ctx.party.canUpload) throw new Error("This link is read-only");

  const actor: Actor = {
    type: "COUNTERPARTY",
    id: args.ctx.party.id,
    label: args.ctx.party.name,
  };

  const doc = await uploadDocument({
    orgId: args.ctx.orgId,
    shipmentId: args.ctx.shipment.id,
    fileName: args.fileName,
    mimeType: args.mimeType,
    buffer: args.buffer,
    type: args.type,
    actor,
    issuedByPartyId: args.ctx.party.id,
  });

  // The exporter must know something landed.
  await createTask({
    orgId: args.ctx.orgId,
    shipmentId: args.ctx.shipment.id,
    title: `${args.ctx.party.name} uploaded ${args.fileName}`,
    detail: `Shared with: ${defaultVisibility(args.type).join(", ")}`,
    severity: "WARNING",
    subjectRef: `document:${doc.id}`,
    actor: SYSTEM_ACTOR,
  });

  return doc;
}

/** A participant answers a review request from inside the portal. */
export async function portalRespond(args: {
  ctx: PortalContext;
  approvalId: string;
  outcome: "APPROVED" | "CHANGES_REQUESTED";
  comment?: string;
}) {
  const db = tenantDb(args.ctx.orgId);
  const approval = await db.approval.findUnique({ where: { id: args.approvalId } });
  if (!approval || approval.partyId !== args.ctx.party.id) {
    throw new Error("Request not found");
  }
  if (approval.state !== "REQUESTED") return approval;

  // Their response is recorded as an inbound message — that is the evidence.
  const message = await db.message.create({
    data: {
      orgId: args.ctx.orgId,
      shipmentId: args.ctx.shipment.id,
      channel: "APP",
      direction: "INBOUND",
      fromAddress: args.ctx.party.name,
      rawText:
        args.outcome === "APPROVED"
          ? `Approved: ${approval.subject}${args.comment ? `\n\n${args.comment}` : ""}`
          : `Changes requested on ${approval.subject}:\n\n${args.comment ?? "(no detail given)"}`,
      parsedIntent: args.outcome === "APPROVED" ? "APPROVAL" : "CHANGE_REQUEST",
      intentConfidence: 1, // stated directly by the party, not inferred
      sourceSnippet: args.comment?.slice(0, 300) ?? null,
    },
  });

  await appendEvent({
    orgId: args.ctx.orgId,
    shipmentId: args.ctx.shipment.id,
    type: "message.received",
    payload: {
      messageId: message.id,
      channel: "APP",
      from: args.ctx.party.name,
      subject: approval.subject,
      preview: message.rawText.slice(0, 240),
    },
    actor: { type: "COUNTERPARTY", id: args.ctx.party.id, label: args.ctx.party.name },
  });

  // Route the outcome through the relay so the onward draft gets written.
  const { recordReviewResponse, ownerOfDocumentType } = await import("./relay");

  let relayToPartyId: string | null = null;
  if (args.outcome === "CHANGES_REQUESTED" && approval.documentId) {
    const doc = await db.document.findUnique({
      where: { id: approval.documentId },
      select: { type: true },
    });
    if (doc) {
      const ownerType = ownerOfDocumentType(doc.type);
      const owner = await db.party.findFirst({
        where: { shipmentId: args.ctx.shipment.id, type: ownerType },
      });
      relayToPartyId = owner?.id ?? null;
    }
  }

  await recordReviewResponse({
    orgId: args.ctx.orgId,
    approvalId: args.approvalId,
    outcome: args.outcome,
    comment: args.comment,
    evidenceMessageId: message.id,
    relayToPartyId,
    actor: { type: "COUNTERPARTY", id: args.ctx.party.id, label: args.ctx.party.name },
  });

  return approval;
}

import "server-only";
import type { DocumentType, PartyType } from "@prisma/client";
import { ai } from "../ai/gateway";
import { tenantDb } from "../tenant";
import { AI_ACTOR, type Actor } from "./events";
import { appendEvent } from "./ledger";
import { shipmentContext } from "./messages";
import { createTask } from "./shipments";
import { DOCUMENT_LABEL, PARTY_LABEL, canSeeDocument } from "./visibility";

/**
 * THE RELAY.
 *
 * Today an exporter is a human bridge: download a document from the CHA, paste
 * it to the buyer; take the buyer's comments, paste them back to the CHA. This
 * module is that bridge, with the copy-paste removed and the confidentiality
 * walls kept intact.
 *
 * Two rules hold everywhere in here:
 *   1. A drafted message may only reference documents the RECIPIENT may see.
 *   2. AI drafts; a human sends. Nothing leaves without confirmation.
 */

const DEFAULT_FOLLOWUP_HOURS = 24;

/** Documents this party is allowed to see, newest version per family. */
export async function visibleDocuments(args: {
  orgId: string;
  shipmentId: string;
  viewer: PartyType | "OWNER_ORG";
}) {
  const db = tenantDb(args.orgId);
  const docs = await db.document.findMany({
    where: { shipmentId: args.shipmentId },
    orderBy: [{ family: "asc" }, { version: "desc" }],
  });

  const latest = new Map<string, (typeof docs)[number]>();
  for (const doc of docs) {
    if (!latest.has(doc.family)) latest.set(doc.family, doc);
  }

  return [...latest.values()].filter((doc) =>
    canSeeDocument(args.viewer, { type: doc.type, visibleTo: doc.visibleTo }),
  );
}

/**
 * Ask a party to review a document — the unit of the whole workflow.
 * Creates the approval, schedules the follow-up, and drafts the covering
 * message for a human to send.
 */
export async function requestReview(args: {
  orgId: string;
  shipmentId: string;
  documentId: string;
  partyId: string;
  actor: Actor;
  followUpHours?: number;
  note?: string;
}) {
  const db = tenantDb(args.orgId);

  const [doc, party] = await Promise.all([
    db.document.findUnique({ where: { id: args.documentId } }),
    db.party.findUnique({ where: { id: args.partyId } }),
  ]);
  if (!doc) throw new Error("Document not found");
  if (!party) throw new Error("Party not found");

  // Refuse to request review from a party who is not entitled to the document.
  if (!canSeeDocument(party.type, { type: doc.type, visibleTo: doc.visibleTo })) {
    throw new Error(
      `${PARTY_LABEL[party.type]} is not permitted to see ${DOCUMENT_LABEL[doc.type]} — ` +
        `change the document's audience first`,
    );
  }

  const priorRounds = await db.approval.count({
    where: { shipmentId: args.shipmentId, documentId: args.documentId },
  });

  const hours = args.followUpHours ?? DEFAULT_FOLLOWUP_HOURS;
  const approval = await db.approval.create({
    data: {
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      documentId: args.documentId,
      partyId: args.partyId,
      subject: `${DOCUMENT_LABEL[doc.type]} v${doc.version}`,
      subjectRef: `document:${doc.id}`,
      round: priorRounds + 1,
      dueAt: new Date(Date.now() + hours * 60 * 60 * 1000),
    },
  });

  await appendEvent({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    type: "approval.requested",
    payload: { approvalId: approval.id, subject: approval.subject, subjectRef: approval.subjectRef },
    actor: args.actor,
  });

  const draft = await draftForParty({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    partyId: args.partyId,
    purpose: "reply",
    incomingText:
      args.note ??
      `Please review ${DOCUMENT_LABEL[doc.type]} v${doc.version} and confirm, or send any changes.`,
    intent: "DOC_SUBMISSION",
    actor: args.actor,
  });

  return { approval, draft };
}

/**
 * A party responded. Record the outcome against the approval and, when they
 * asked for changes, draft the onward message to whoever must action it.
 *
 * This is the copy-paste that disappears.
 */
export async function recordReviewResponse(args: {
  orgId: string;
  approvalId: string;
  outcome: "APPROVED" | "CHANGES_REQUESTED";
  comment?: string;
  evidenceMessageId?: string | null;
  /** Who must action the change — usually the CHA or the forwarder. */
  relayToPartyId?: string | null;
  actor: Actor;
}) {
  const db = tenantDb(args.orgId);
  const approval = await db.approval.findUnique({ where: { id: args.approvalId } });
  if (!approval) throw new Error("Approval not found");
  if (approval.state !== "REQUESTED") return { approval, draft: null };

  const decided = await db.approval.update({
    where: { id: approval.id },
    data: {
      state: args.outcome === "APPROVED" ? "GRANTED" : "REJECTED",
      changesRequested: args.outcome === "CHANGES_REQUESTED" ? (args.comment ?? null) : null,
      evidenceMessageId: args.evidenceMessageId ?? approval.evidenceMessageId,
      decidedAt: new Date(),
      // Stop the follow-up clock.
      dueAt: null,
    },
  });

  await appendEvent({
    orgId: args.orgId,
    shipmentId: approval.shipmentId,
    type: "approval.decided",
    payload: {
      approvalId: approval.id,
      state: args.outcome === "APPROVED" ? "GRANTED" : "REJECTED",
      evidenceMessageId: args.evidenceMessageId ?? null,
    },
    actor: args.actor,
  });

  if (args.outcome === "APPROVED" || !args.relayToPartyId) {
    return { approval: decided, draft: null };
  }

  // Changes requested → draft the onward message to the party who must act.
  const draft = await draftForParty({
    orgId: args.orgId,
    shipmentId: approval.shipmentId,
    partyId: args.relayToPartyId,
    purpose: "relay",
    incomingText: args.comment ?? "The buyer has requested changes.",
    intent: "CHANGE_REQUEST",
    actor: args.actor,
  });

  await createTask({
    orgId: args.orgId,
    shipmentId: approval.shipmentId,
    title: `Relay requested changes to ${draft.partyName}`,
    detail: args.comment?.slice(0, 300),
    severity: "BLOCKER",
    subjectRef: `message:${draft.messageId}`,
    actor: AI_ACTOR,
  });

  return { approval: decided, draft };
}

/**
 * Draft a message TO a specific party, scoped to what that party may see.
 * Stored as an unsent OUTBOUND message — a human presses send.
 */
export async function draftForParty(args: {
  orgId: string;
  shipmentId: string;
  partyId: string;
  purpose: "reply" | "relay" | "followup";
  incomingText: string;
  intent: string;
  actor: Actor;
  awaiting?: { subject: string; daysWaiting: number };
}) {
  const db = tenantDb(args.orgId);
  const party = await db.party.findUnique({ where: { id: args.partyId } });
  if (!party) throw new Error("Party not found");

  // Reach them where they actually are. A WhatsApp party with an email on file
  // must still be addressed by phone, or the message goes out over the wrong
  // channel to an address that channel cannot deliver to.
  const channel = party.channel === "WHATSAPP" ? "WHATSAPP" : "EMAIL";
  const toAddress = channel === "WHATSAPP" ? (party.phone ?? party.email) : (party.email ?? party.phone);
  if (!toAddress) throw new Error(`${party.name} has no email address or phone number`);

  const [context, docs, org] = await Promise.all([
    shipmentContext(args.orgId, args.shipmentId),
    visibleDocuments({ orgId: args.orgId, shipmentId: args.shipmentId, viewer: party.type }),
    db.user.findFirst({ where: { role: { in: ["OWNER", "OPS"] } }, select: { name: true } }),
  ]);

  const { data: draft } = await ai.draftReply(
    { orgId: args.orgId, shipmentId: args.shipmentId },
    {
      incomingText: args.incomingText,
      channel,
      intent: args.intent,
      shipmentContext: context,
      exporterName: org?.name ?? "Operations",
      purpose: args.purpose,
      audience: { partyType: party.type, name: party.name },
      // The model is only ever shown documents this recipient may see.
      visibleDocuments: docs.map((d) => `${DOCUMENT_LABEL[d.type]} v${d.version} (${d.name})`),
      awaiting: args.awaiting,
    },
  );

  const message = await db.message.create({
    data: {
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      channel,
      direction: "OUTBOUND",
      toAddress,
      subject: draft.subject,
      rawText: draft.body,
      parsedIntent: "OTHER",
      intentConfidence: draft.confidence,
      parsedPayload: {
        draft: true,
        purpose: args.purpose,
        partyId: party.id,
        rationale: draft.rationale,
      } as never,
    },
  });

  await appendEvent({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    type: "message.reply_drafted",
    payload: {
      messageId: message.id,
      draft: draft.body.slice(0, 500),
      confidence: draft.confidence,
    },
    actor: AI_ACTOR,
  });

  return {
    messageId: message.id,
    partyName: party.name,
    partyType: party.type,
    body: draft.body,
    subject: draft.subject,
    confidence: draft.confidence,
    rationale: draft.rationale,
  };
}

// Lives with the visibility policy — it is the same table read the other way.
export { ownerOfDocumentType } from "./visibility";

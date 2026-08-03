import "server-only";
import { ai } from "../ai/gateway";
import { queue } from "../queue";
import { tenantDb } from "../tenant";
import { AI_ACTOR, type Actor } from "./events";
import { appendEvent } from "./ledger";
import { createTask, requestApproval } from "./shipments";

type Channel = "EMAIL" | "WHATSAPP" | "APP";

/**
 * Record an inbound message and queue interpretation.
 * Idempotent on (channel, externalId) so webhook retries are safe.
 */
export async function ingestInboundMessage(args: {
  orgId: string;
  shipmentId: string;
  channel: Channel;
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  text: string;
  externalId?: string | null;
  actor?: Actor;
}) {
  const db = tenantDb(args.orgId);

  if (args.externalId) {
    const existing = await db.message.findFirst({
      where: { channel: args.channel, externalId: args.externalId },
    });
    if (existing) return { message: existing, deduped: true as const };
  }

  const message = await db.message.create({
    data: {
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      channel: args.channel,
      direction: "INBOUND",
      fromAddress: args.from ?? null,
      toAddress: args.to ?? null,
      subject: args.subject ?? null,
      rawText: args.text,
      externalId: args.externalId ?? null,
    },
  });

  await appendEvent({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    type: "message.received",
    payload: {
      messageId: message.id,
      channel: args.channel,
      from: args.from ?? null,
      subject: args.subject ?? null,
      preview: args.text.slice(0, 240),
    },
    actor: args.actor ?? { type: "COUNTERPARTY", label: args.from ?? "Counterparty" },
  });

  await queue().enqueue("message.interpret", {
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    messageId: message.id,
    draftReply: true,
  });

  return { message, deduped: false as const };
}

/** Compact shipment summary given to the model as the ONLY assertable facts. */
export async function shipmentContext(orgId: string, shipmentId: string) {
  const db = tenantDb(orgId);
  const s = await db.shipment.findUnique({
    where: { id: shipmentId },
    include: { parties: true, documents: { orderBy: { uploadedAt: "desc" }, take: 5 } },
  });
  if (!s) return "";

  const lines = [
    `Reference: ${s.reference}`,
    `Title: ${s.title}`,
    `Status: ${s.status}`,
    s.poNumber ? `PO number: ${s.poNumber}` : null,
    s.invoiceNumber ? `Invoice number: ${s.invoiceNumber}` : null,
    s.incoterm ? `Incoterm: ${s.incoterm}` : null,
    s.totalValue ? `Value: ${s.currency ?? ""} ${s.totalValue}`.trim() : null,
    s.originPort || s.destPort ? `Route: ${s.originPort ?? "?"} → ${s.destPort ?? "?"}` : null,
    s.etd ? `ETD: ${s.etd.toISOString().slice(0, 10)}` : null,
    s.eta ? `ETA: ${s.eta.toISOString().slice(0, 10)}` : null,
    s.carrierRef ? `Carrier reference: ${s.carrierRef}` : null,
    s.documents.length ? `Documents on file: ${s.documents.map((d) => `${d.name} (v${d.version})`).join(", ")}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

/**
 * Job handler: classify intent, then draft a reply.
 * Nothing here sends anything or changes shipment state — it only PROPOSES.
 */
export async function interpretMessage(args: {
  orgId: string;
  shipmentId: string;
  messageId: string;
  draftReply: boolean;
}) {
  const db = tenantDb(args.orgId);
  const message = await db.message.findUnique({ where: { id: args.messageId } });
  if (!message) throw new Error(`Message ${args.messageId} not found`);
  if (message.parsedIntent !== "UNKNOWN") return; // already interpreted — idempotent

  const context = await shipmentContext(args.orgId, args.shipmentId);

  const { data: classification } = await ai.classifyMessage(
    { orgId: args.orgId, shipmentId: args.shipmentId },
    {
      text: message.rawText,
      channel: message.channel,
      subject: message.subject,
      shipmentContext: context,
    },
  );

  await db.message.update({
    where: { id: message.id },
    data: {
      parsedIntent: classification.intent,
      intentConfidence: classification.confidence,
      sourceSnippet: classification.sourceSnippet,
      parsedPayload: {
        ...classification.payload,
        proposedAction: classification.proposedAction,
      } as never,
    },
  });

  await appendEvent({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    type: "message.intent_classified",
    payload: {
      messageId: message.id,
      intent: classification.intent,
      confidence: classification.confidence,
      sourceSnippet: classification.sourceSnippet,
      proposal: classification.proposedAction,
    },
    actor: AI_ACTOR,
  });

  // An approval claim is financially consequential: raise it for a human,
  // never grant it. The message id is stored as evidence.
  if (classification.intent === "APPROVAL") {
    const approval = await requestApproval({
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      subject: String(classification.payload?.approves ?? "Buyer approval"),
      subjectRef: `message:${message.id}`,
      actor: AI_ACTOR,
    });
    await db.approval.update({
      where: { id: approval.id },
      data: { evidenceMessageId: message.id },
    });
    await createTask({
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      title: `Confirm buyer approval: ${approval.subject}`,
      detail: classification.sourceSnippet ?? undefined,
      severity: "BLOCKER",
      subjectRef: `approval:${approval.id}`,
      actor: AI_ACTOR,
    });
  } else if (classification.intent === "CHANGE_REQUEST") {
    await createTask({
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      title: `Change requested by counterparty`,
      detail: classification.proposedAction ?? classification.sourceSnippet ?? undefined,
      severity: "BLOCKER",
      subjectRef: `message:${message.id}`,
      actor: AI_ACTOR,
    });
  } else if (classification.confidence < 0.6) {
    await createTask({
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      title: `Unclear message needs a human read`,
      detail: message.rawText.slice(0, 300),
      severity: "WARNING",
      subjectRef: `message:${message.id}`,
      actor: AI_ACTOR,
    });
  }

  if (!args.draftReply) return;

  const org = await db.user.findFirst({ where: {}, select: { name: true } });
  const { data: draft } = await ai.draftReply(
    { orgId: args.orgId, shipmentId: args.shipmentId },
    {
      incomingText: message.rawText,
      channel: message.channel,
      intent: classification.intent,
      shipmentContext: context,
      exporterName: org?.name ?? "Operations",
    },
  );

  // The draft is stored as an OUTBOUND message that has NOT been sent.
  // `externalId` stays null until a human presses send.
  const drafted = await db.message.create({
    data: {
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      channel: message.channel,
      direction: "OUTBOUND",
      toAddress: message.fromAddress,
      subject: draft.subject,
      rawText: draft.body,
      parsedIntent: "OTHER",
      intentConfidence: draft.confidence,
      parsedPayload: { draft: true, rationale: draft.rationale, replyTo: message.id } as never,
    },
  });

  await appendEvent({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    type: "message.reply_drafted",
    payload: { messageId: drafted.id, draft: draft.body.slice(0, 500), confidence: draft.confidence },
    actor: AI_ACTOR,
  });
}

/** Human presses send. This is the only path that emits outbound traffic. */
export async function sendDraftedReply(args: {
  orgId: string;
  messageId: string;
  body?: string;
  actor: Actor;
}) {
  if (args.actor.type === "AI") throw new Error("AI may not send messages — a human must confirm");

  const db = tenantDb(args.orgId);
  const draft = await db.message.findUnique({ where: { id: args.messageId } });
  if (!draft || draft.direction !== "OUTBOUND") throw new Error("Draft not found");

  const payload = (draft.parsedPayload ?? {}) as Record<string, unknown>;
  if (payload.draft !== true) return null; // already sent — idempotent

  const body = args.body ?? draft.rawText;

  // Resolve the single chain for this shipment+party so the counterparty sees
  // one conversation rather than a new thread per document.
  let threading: {
    threadId?: string;
    subject?: string;
    inReplyTo?: string;
    references?: string[];
    replyTo?: string;
  } = {};

  const partyId = typeof payload.partyId === "string" ? payload.partyId : null;
  if (draft.channel === "EMAIL") {
    const resolvedPartyId =
      partyId ??
      (
        await db.party.findFirst({
          where: { shipmentId: draft.shipmentId, email: draft.toAddress ?? undefined },
          select: { id: true },
        })
      )?.id ??
      null;

    if (resolvedPartyId) {
      const { threadHeadersFor } = await import("../integrations/threads");
      threading = await threadHeadersFor({
        orgId: args.orgId,
        shipmentId: draft.shipmentId,
        partyId: resolvedPartyId,
        fallbackSubject: draft.subject ?? "",
      });
    }
  }

  const { deliver } = await import("../integrations/outbound");
  const delivery = await deliver({
    channel: draft.channel,
    to: draft.toAddress,
    // The thread subject wins: a stable subject is what keeps the chain intact.
    subject: threading.subject ?? draft.subject,
    body,
    inReplyTo: threading.inReplyTo,
    references: threading.references,
    replyTo: threading.replyTo,
  });

  if (threading.threadId) {
    const { recordSentMessage } = await import("../integrations/threads");
    await recordSentMessage({
      orgId: args.orgId,
      threadId: threading.threadId,
      providerMessageId: delivery.externalId,
    });
  }

  await db.message.update({
    where: { id: draft.id },
    data: {
      rawText: body,
      subject: threading.subject ?? draft.subject,
      externalId: delivery.externalId,
      providerMessageId: delivery.externalId,
      inReplyTo: threading.inReplyTo ?? null,
      threadId: threading.threadId ?? null,
      parsedPayload: { ...payload, draft: false, sentAt: new Date().toISOString() } as never,
    },
  });

  await appendEvent({
    orgId: args.orgId,
    shipmentId: draft.shipmentId,
    type: "message.sent",
    payload: {
      messageId: draft.id,
      channel: draft.channel,
      to: draft.toAddress,
      preview: body.slice(0, 240),
    },
    actor: args.actor,
  });

  return { externalId: delivery.externalId };
}

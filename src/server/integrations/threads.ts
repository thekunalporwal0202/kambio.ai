import "server-only";
import { env } from "@/env";
import { tenantDb } from "../tenant";

/**
 * ONE EMAIL CHAIN PER SHIPMENT PER PARTY.
 *
 * The buyer should see a single conversation for a shipment, not a new thread
 * per document. Mail clients group by the RFC 5322 `In-Reply-To` /
 * `References` headers and a stable subject, so we persist both and replay
 * them on every send.
 */

export type ThreadHeaders = {
  subject: string;
  inReplyTo?: string;
  references?: string[];
  replyTo: string;
};

/** Replies land back on the right shipment: ship+<token>@domain */
export function shipmentReplyTo(inboundToken: string) {
  return `ship+${inboundToken}@${env.INBOUND_EMAIL_DOMAIN}`;
}

/**
 * Get (or open) the single thread for this shipment+party and return the
 * headers a send should carry.
 */
export async function threadHeadersFor(args: {
  orgId: string;
  shipmentId: string;
  partyId: string;
  /** Used only when the thread does not exist yet. */
  fallbackSubject: string;
}): Promise<ThreadHeaders & { threadId: string }> {
  const db = tenantDb(args.orgId);

  const shipment = await db.shipment.findUnique({
    where: { id: args.shipmentId },
    select: { reference: true, title: true, inboundToken: true },
  });
  if (!shipment) throw new Error("Shipment not found");

  const existing = await db.emailThread.findFirst({
    where: { shipmentId: args.shipmentId, partyId: args.partyId },
  });

  if (existing) {
    return {
      threadId: existing.id,
      subject: existing.subject,
      inReplyTo: existing.lastProviderMessageId ?? undefined,
      references: existing.referenceIds,
      replyTo: shipmentReplyTo(shipment.inboundToken),
    };
  }

  // A stable, reference-prefixed subject is what keeps the chain together even
  // in clients that ignore References.
  const subject = `[${shipment.reference}] ${args.fallbackSubject || shipment.title}`.slice(0, 180);

  const thread = await db.emailThread.create({
    data: { orgId: args.orgId, shipmentId: args.shipmentId, partyId: args.partyId, subject },
  });

  return {
    threadId: thread.id,
    subject,
    references: [],
    replyTo: shipmentReplyTo(shipment.inboundToken),
  };
}

/** Record the provider's Message-ID so the next send threads onto it. */
export async function recordSentMessage(args: {
  orgId: string;
  threadId: string;
  providerMessageId: string | null;
}) {
  if (!args.providerMessageId) return;
  const db = tenantDb(args.orgId);
  const thread = await db.emailThread.findUnique({ where: { id: args.threadId } });
  if (!thread) return;

  await db.emailThread.update({
    where: { id: args.threadId },
    data: {
      lastProviderMessageId: args.providerMessageId,
      // Keep the chain bounded; clients only need the head and recent tail.
      referenceIds: [...thread.referenceIds, args.providerMessageId].slice(-20),
    },
  });
}

/** Record an inbound message id so our next reply threads onto it. */
export async function recordInboundMessage(args: {
  orgId: string;
  shipmentId: string;
  partyId: string;
  providerMessageId: string | null;
  subject?: string | null;
}) {
  if (!args.providerMessageId) return;
  const headers = await threadHeadersFor({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    partyId: args.partyId,
    fallbackSubject: args.subject ?? "",
  });
  await recordSentMessage({
    orgId: args.orgId,
    threadId: headers.threadId,
    providerMessageId: args.providerMessageId,
  });
}

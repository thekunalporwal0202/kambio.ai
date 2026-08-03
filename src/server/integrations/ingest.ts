import "server-only";
import { prisma } from "../db";
import { uploadDocument } from "../domain/documents";
import { SYSTEM_ACTOR } from "../domain/events";
import { ingestInboundMessage } from "../domain/messages";
import { addParty, createShipment } from "../domain/shipments";
import { routeByAddress, routeByParty, routeByReference, normalizePhone } from "./routing";

export type InboundAttachment = {
  fileName: string;
  mimeType: string;
  content: Buffer;
};

export type InboundEmail = {
  to: string;
  from: string;
  fromName?: string | null;
  subject?: string | null;
  text: string;
  messageId?: string | null;
  attachments?: InboundAttachment[];
};

export type IngestResult = {
  orgId: string;
  shipmentId: string;
  messageId: string;
  created: boolean;
  routing: string;
  deduped: boolean;
  documentIds: string[];
};

/**
 * The zero-install counterparty loop, server side.
 *
 * An email arrives at a Kambio address → we find (or create) the shipment,
 * remember the sender as a party, file attachments as documents, and queue
 * AI interpretation. Everything AI produces is a proposal a human confirms.
 */
export async function ingestEmail(email: InboundEmail): Promise<IngestResult> {
  const routed = await routeByAddress(email.to);
  if (!routed) {
    throw new Error(
      `No Kambio inbox matches "${email.to}". Forward to your org intake address or a per-shipment address.`,
    );
  }

  const orgId = routed.orgId;
  let shipmentId = routed.shipmentId;
  let routing = routed.reason;
  let created = false;

  if (!shipmentId) {
    const body = `${email.subject ?? ""}\n${email.text}`;
    const byReference = await routeByReference(orgId, body);
    const byParty = byReference ?? (await routeByParty({ orgId, email: email.from }));

    if (byParty?.shipmentId) {
      shipmentId = byParty.shipmentId;
      routing = byParty.reason;
    } else {
      const shipment = await createShipment({
        orgId,
        title: email.subject?.trim() || `Enquiry from ${email.fromName ?? email.from}`,
        origin: "email",
        actor: SYSTEM_ACTOR,
      });
      shipmentId = shipment.id;
      routing = "new shipment (no match)";
      created = true;
    }
  }

  await addParty({
    orgId,
    shipmentId,
    type: "IMPORTER",
    name: email.fromName?.trim() || email.from.split("@")[0] || email.from,
    email: email.from.toLowerCase(),
    channel: "EMAIL",
    actor: SYSTEM_ACTOR,
  });

  const { message, deduped } = await ingestInboundMessage({
    orgId,
    shipmentId,
    channel: "EMAIL",
    from: email.from,
    to: email.to,
    subject: email.subject,
    text: email.text,
    externalId: email.messageId ?? null,
  });

  const documentIds: string[] = [];
  if (!deduped) {
    for (const attachment of email.attachments ?? []) {
      const doc = await uploadDocument({
        orgId,
        shipmentId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        buffer: attachment.content,
        actor: SYSTEM_ACTOR,
      });
      documentIds.push(doc.id);
    }

    // No attachment? The email body itself is often the PO. Treat it as a
    // document so extraction runs on it — this is what makes "paste an email"
    // reach extracted data in one step.
    if (!documentIds.length && looksLikeTradeDocument(email.text)) {
      const doc = await uploadDocument({
        orgId,
        shipmentId,
        fileName: `${(email.subject ?? "email").slice(0, 60).replace(/[^\w .-]/g, "")}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from(`${email.subject ?? ""}\n\n${email.text}`, "utf8"),
        actor: SYSTEM_ACTOR,
      });
      documentIds.push(doc.id);
    }
  }

  return { orgId, shipmentId, messageId: message.id, created, routing, deduped, documentIds };
}

/** Cheap pre-filter so casual chatter doesn't create documents. */
export function looksLikeTradeDocument(text: string): boolean {
  const signals = [
    /\bP\.?O\.?\s*(?:no|number|#|:)/i,
    /\bpurchase\s+order\b/i,
    /\binvoice\s*(?:no|number|#|:)/i,
    /\b(FOB|CIF|CFR|EXW|DAP|DDP|FCA|CIP|CPT)\b/,
    /\bHS\s*code\b/i,
    /\bquantit(?:y|ies)\b/i,
    /\bunit\s+price\b/i,
    /\btotal\b.*\b\d{3,}/i,
  ];
  return signals.filter((re) => re.test(text)).length >= 2;
}

export type InboundWhatsApp = {
  from: string;
  profileName?: string | null;
  text: string;
  messageId?: string | null;
};

export async function ingestWhatsApp(msg: InboundWhatsApp): Promise<IngestResult> {
  const phone = normalizePhone(msg.from);
  const byParty = await routeByParty({ phone });

  let orgId = byParty?.orgId;
  let shipmentId = byParty?.shipmentId ?? null;
  let routing = byParty?.reason ?? "";
  let created = false;

  if (!orgId) {
    // Unknown number: without a party match there is no tenant to attribute
    // this to. Refuse rather than guess — guessing would leak across orgs.
    throw new Error(`No shipment party matches WhatsApp number ${phone}`);
  }

  if (!shipmentId) {
    const byReference = await routeByReference(orgId, msg.text);
    if (byReference?.shipmentId) {
      shipmentId = byReference.shipmentId;
      routing = byReference.reason;
    } else {
      const shipment = await createShipment({
        orgId,
        title: `WhatsApp enquiry from ${msg.profileName ?? phone}`,
        origin: "whatsapp",
        actor: SYSTEM_ACTOR,
      });
      shipmentId = shipment.id;
      routing = "new shipment (no match)";
      created = true;
    }
  }

  await addParty({
    orgId,
    shipmentId,
    type: "IMPORTER",
    name: msg.profileName?.trim() || phone,
    phone,
    channel: "WHATSAPP",
    actor: SYSTEM_ACTOR,
  });

  const { message, deduped } = await ingestInboundMessage({
    orgId,
    shipmentId,
    channel: "WHATSAPP",
    from: phone,
    text: msg.text,
    externalId: msg.messageId ?? null,
  });

  return { orgId, shipmentId, messageId: message.id, created, routing, deduped, documentIds: [] };
}

/** Used by the UI to show where to forward mail. */
export async function inboundAddressesFor(orgId: string) {
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { inboundKey: true } });
  return org?.inboundKey ?? null;
}

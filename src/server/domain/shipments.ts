import "server-only";
import { nanoid } from "nanoid";
import { prisma } from "../db";
import { tenantDb } from "../tenant";
import { appendEvent } from "./ledger";
import { canTransition } from "./projection";
import type { Actor, ShipmentStatusValue } from "./events";

export type CreateShipmentInput = {
  orgId: string;
  title: string;
  origin: "manual" | "email" | "whatsapp" | "document";
  actor: Actor;
  trade?: Record<string, unknown>;
  reference?: string;
};

/** Sequential, human-friendly reference: KMB-2026-007 */
async function nextReference(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.shipment.count({ where: { orgId } });
  return `KMB-${year}-${String(count + 1).padStart(3, "0")}`;
}

export async function createShipment(input: CreateShipmentInput) {
  const reference = input.reference ?? (await nextReference(input.orgId));

  // The shipment row is created first so the ledger has something to hang off;
  // `shipment.created` is immediately appended so the ledger stays complete.
  const shipment = await prisma.shipment.create({
    data: {
      orgId: input.orgId,
      reference,
      title: input.title,
      status: "DRAFT",
      inboundToken: nanoid(12).toLowerCase(),
    },
  });

  await appendEvent({
    orgId: input.orgId,
    shipmentId: shipment.id,
    type: "shipment.created",
    payload: { reference, title: input.title, origin: input.origin, trade: input.trade as never },
    actor: input.actor,
  });

  return shipment;
}

export async function updateTradeFields(args: {
  orgId: string;
  shipmentId: string;
  trade: Record<string, unknown>;
  derivedFrom?: string;
  actor: Actor;
}) {
  const trade = Object.fromEntries(
    Object.entries(args.trade).filter(([, v]) => v !== null && v !== undefined && v !== ""),
  );
  if (Object.keys(trade).length === 0) return null;

  return appendEvent({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    type: "shipment.fields_updated",
    payload: { trade: trade as never, derivedFrom: args.derivedFrom },
    actor: args.actor,
  });
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot move shipment from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/**
 * The ONLY way a shipment changes status. AI can propose a transition but it
 * always lands here, where the state machine is enforced.
 */
export async function advanceStatus(args: {
  orgId: string;
  shipmentId: string;
  to: ShipmentStatusValue;
  reason?: string;
  actor: Actor;
}) {
  const db = tenantDb(args.orgId);
  const shipment = await db.shipment.findUnique({
    where: { id: args.shipmentId },
    select: { status: true },
  });
  if (!shipment) throw new Error("Shipment not found");
  if (shipment.status === args.to) return null;
  if (!canTransition(shipment.status, args.to)) {
    throw new InvalidTransitionError(shipment.status, args.to);
  }

  return appendEvent({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    type: "shipment.status_changed",
    payload: { from: shipment.status, to: args.to, reason: args.reason },
    actor: args.actor,
  });
}

export async function addParty(args: {
  orgId: string;
  shipmentId: string;
  type: "EXPORTER" | "IMPORTER" | "CHA" | "FORWARDER" | "CARRIER" | "BANK";
  name: string;
  email?: string | null;
  phone?: string | null;
  channel?: "APP" | "EMAIL" | "WHATSAPP";
  actor: Actor;
}) {
  const db = tenantDb(args.orgId);

  // Idempotent: the same email/phone is not added twice by repeated ingestion.
  if (args.email || args.phone) {
    const existing = await db.party.findFirst({
      where: {
        shipmentId: args.shipmentId,
        OR: [
          ...(args.email ? [{ email: args.email }] : []),
          ...(args.phone ? [{ phone: args.phone }] : []),
        ],
      },
    });
    if (existing) return existing;
  }

  const channel = args.channel ?? (args.phone ? "WHATSAPP" : "EMAIL");
  const party = await db.party.create({
    data: {
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      type: args.type,
      name: args.name,
      email: args.email ?? null,
      phone: args.phone ?? null,
      channel,
    },
  });

  await appendEvent({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    type: "party.added",
    payload: {
      partyId: party.id,
      type: args.type,
      name: args.name,
      email: args.email ?? null,
      phone: args.phone ?? null,
      channel,
    },
    actor: args.actor,
  });

  return party;
}

export async function createTask(args: {
  orgId: string;
  shipmentId: string;
  title: string;
  detail?: string;
  severity?: "BLOCKER" | "WARNING" | "INFO";
  subjectRef?: string | null;
  actor: Actor;
  /** Skip if an open task with this subjectRef+title already exists. */
  dedupe?: boolean;
}) {
  const db = tenantDb(args.orgId);
  const severity = args.severity ?? "WARNING";

  if (args.dedupe !== false) {
    const existing = await db.task.findFirst({
      where: {
        shipmentId: args.shipmentId,
        title: args.title,
        subjectRef: args.subjectRef ?? null,
        status: "OPEN",
      },
    });
    if (existing) return existing;
  }

  const task = await db.task.create({
    data: {
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      title: args.title,
      detail: args.detail ?? null,
      severity,
      subjectRef: args.subjectRef ?? null,
    },
  });

  await appendEvent({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    type: "task.created",
    payload: { taskId: task.id, title: args.title, severity, subjectRef: args.subjectRef ?? null },
    actor: args.actor,
  });

  return task;
}

export async function closeTask(args: {
  orgId: string;
  taskId: string;
  outcome: "DONE" | "DISMISSED";
  actor: Actor;
}) {
  const db = tenantDb(args.orgId);
  const task = await db.task.findUnique({ where: { id: args.taskId } });
  if (!task || task.status !== "OPEN") return null;

  await db.task.update({
    where: { id: args.taskId },
    data: { status: args.outcome, closedAt: new Date() },
  });

  return appendEvent({
    orgId: args.orgId,
    shipmentId: task.shipmentId,
    type: "task.closed",
    payload: { taskId: args.taskId, outcome: args.outcome },
    actor: args.actor,
  });
}

export async function requestApproval(args: {
  orgId: string;
  shipmentId: string;
  subject: string;
  subjectRef?: string | null;
  actor: Actor;
}) {
  const db = tenantDb(args.orgId);
  const approval = await db.approval.create({
    data: {
      orgId: args.orgId,
      shipmentId: args.shipmentId,
      subject: args.subject,
      subjectRef: args.subjectRef ?? null,
    },
  });

  await appendEvent({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    type: "approval.requested",
    payload: { approvalId: approval.id, subject: args.subject, subjectRef: args.subjectRef ?? null },
    actor: args.actor,
  });

  return approval;
}

/**
 * Approvals are financially consequential, so this is only ever reachable from
 * an explicit human action. AI supplies the evidence, never the decision.
 */
export async function decideApproval(args: {
  orgId: string;
  approvalId: string;
  state: "GRANTED" | "REJECTED";
  evidenceMessageId?: string | null;
  actor: Actor;
}) {
  if (args.actor.type === "AI") {
    throw new Error("AI may not decide approvals — a human must confirm");
  }

  const db = tenantDb(args.orgId);
  const approval = await db.approval.findUnique({ where: { id: args.approvalId } });
  if (!approval) throw new Error("Approval not found");
  if (approval.state !== "REQUESTED") return null;

  await db.approval.update({
    where: { id: args.approvalId },
    data: {
      state: args.state,
      decidedAt: new Date(),
      evidenceMessageId: args.evidenceMessageId ?? approval.evidenceMessageId,
    },
  });

  return appendEvent({
    orgId: args.orgId,
    shipmentId: approval.shipmentId,
    type: "approval.decided",
    payload: {
      approvalId: args.approvalId,
      state: args.state,
      evidenceMessageId: args.evidenceMessageId ?? null,
    },
    actor: args.actor,
  });
}

export async function createBuyerLink(args: {
  orgId: string;
  shipmentId: string;
  label: string;
  actor: Actor;
}) {
  const db = tenantDb(args.orgId);
  const link = await db.buyerLink.create({
    data: { orgId: args.orgId, shipmentId: args.shipmentId, label: args.label, token: nanoid(24) },
  });

  await appendEvent({
    orgId: args.orgId,
    shipmentId: args.shipmentId,
    type: "buyer_link.created",
    payload: { buyerLinkId: link.id, label: args.label },
    actor: args.actor,
  });

  return link;
}

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import {
  type Actor,
  type EventPayload,
  type EventType,
  parseEventPayload,
} from "./events";
import { applyEvent, emptyProjection, type ShipmentProjection } from "./projection";

type Tx = Prisma.TransactionClient;

export type AppendInput<T extends EventType> = {
  orgId: string;
  shipmentId: string;
  type: T;
  payload: EventPayload<T>;
  actor: Actor;
  /**
   * Optimistic concurrency: if provided, the append fails when the shipment has
   * moved past this sequence number. Leave undefined for last-write-wins.
   */
  expectedSeq?: number;
};

export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConcurrencyError";
  }
}

/**
 * Append one event and fold it into the shipment read model, atomically.
 *
 * The ledger is the source of truth; the `Shipment` row is a projection that
 * exists so the command center can be queried with plain SQL. Both move
 * together or neither does.
 */
export async function appendEvent<T extends EventType>(
  input: AppendInput<T>,
  tx?: Tx,
): Promise<{ id: string; seq: number }> {
  const payload = parseEventPayload(input.type, input.payload);

  const run = async (client: Tx) => {
    const shipment = await client.shipment.findFirst({
      where: { id: input.shipmentId, orgId: input.orgId },
      select: { id: true, lastEventSeq: true, status: true },
    });
    if (!shipment) {
      throw new Error(`Shipment ${input.shipmentId} not found in org ${input.orgId}`);
    }
    if (input.expectedSeq !== undefined && shipment.lastEventSeq !== input.expectedSeq) {
      throw new ConcurrencyError(
        `Shipment ${input.shipmentId} is at seq ${shipment.lastEventSeq}, expected ${input.expectedSeq}`,
      );
    }

    const seq = shipment.lastEventSeq + 1;

    const event = await client.event.create({
      data: {
        orgId: input.orgId,
        shipmentId: input.shipmentId,
        seq,
        type: input.type,
        payload: payload as unknown as Prisma.InputJsonValue,
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        actorLabel: input.actor.label ?? null,
      },
      select: { id: true, seq: true },
    });

    // Fold this single event into the read model.
    const patch = projectionPatch(input.type, payload);
    await client.shipment.update({
      where: { id: input.shipmentId },
      data: { ...patch, lastEventSeq: seq },
    });

    return event;
  };

  // Two jobs finishing at once both read the same lastEventSeq and race for
  // the next slot. The unique constraint on (shipmentId, seq) is what keeps
  // the ledger honest; here we simply take the next slot and try again.
  // Only safe to retry when we own the transaction — inside a caller's tx the
  // whole transaction is already aborted, so we surface the error instead.
  const MAX_ATTEMPTS = 5;

  if (tx) {
    try {
      return await run(tx);
    } catch (err) {
      throw asConcurrencyError(err, input.shipmentId);
    }
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(run);
    } catch (err) {
      lastError = asConcurrencyError(err, input.shipmentId);
      if (!(lastError instanceof ConcurrencyError)) throw lastError;
      // An explicit expectedSeq means the caller wanted to fail on conflict.
      if (input.expectedSeq !== undefined) throw lastError;
      await new Promise((r) => setTimeout(r, 15 * (attempt + 1) + Math.random() * 25));
    }
  }
  throw lastError;
}

function asConcurrencyError(err: unknown, shipmentId: string): unknown {
  if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
    return new ConcurrencyError(`Concurrent append to shipment ${shipmentId}`);
  }
  return err;
}

/** Append several events in one transaction, in order. */
export async function appendEvents(
  inputs: Array<AppendInput<EventType>>,
  tx?: Tx,
): Promise<Array<{ id: string; seq: number }>> {
  const run = async (client: Tx) => {
    const out = [];
    for (const input of inputs) out.push(await appendEvent(input, client));
    return out;
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

/**
 * The subset of the read model that a single event changes.
 * Keep in sync with applyEvent() in ./projection.ts.
 */
function projectionPatch(type: EventType, payload: Record<string, any>): Prisma.ShipmentUpdateInput {
  switch (type) {
    case "shipment.status_changed":
      return { status: payload.to };
    case "shipment.fields_updated": {
      const t = payload.trade ?? {};
      const patch: Prisma.ShipmentUpdateInput = {};
      if (t.poNumber != null) patch.poNumber = t.poNumber;
      if (t.invoiceNumber != null) patch.invoiceNumber = t.invoiceNumber;
      if (t.incoterm != null) patch.incoterm = t.incoterm;
      if (t.currency != null) patch.currency = t.currency;
      if (t.totalValue != null) patch.totalValue = t.totalValue;
      if (t.originPort != null) patch.originPort = t.originPort;
      if (t.destPort != null) patch.destPort = t.destPort;
      if (t.originCountry != null) patch.originCountry = t.originCountry;
      if (t.destCountry != null) patch.destCountry = t.destCountry;
      if (t.carrierRef != null) patch.carrierRef = t.carrierRef;
      if (t.etd) patch.etd = new Date(t.etd);
      if (t.eta) patch.eta = new Date(t.eta);
      return patch;
    }
    default:
      return {};
  }
}

/** Read the full ledger for a shipment, oldest first. */
export async function readLedger(
  orgId: string,
  shipmentId: string,
  client: Tx | PrismaClient = prisma,
) {
  return client.event.findMany({
    where: { orgId, shipmentId },
    orderBy: { seq: "asc" },
  });
}

/**
 * Derive current state purely from the ledger — no read-model involved.
 * Used by tests and by rebuildShipment() to prove the projection is honest.
 */
export async function projectFromLedger(
  orgId: string,
  shipmentId: string,
  client: Tx | PrismaClient = prisma,
): Promise<ShipmentProjection> {
  const events = await readLedger(orgId, shipmentId, client);
  return events.reduce<ShipmentProjection>(
    (state, e) => applyEvent(state, e.type, e.payload as Record<string, unknown>),
    emptyProjection(),
  );
}

/**
 * Rebuild the `Shipment` read model from the ledger. Safe to run any time;
 * this is the escape hatch that makes the projection disposable.
 */
export async function rebuildShipment(orgId: string, shipmentId: string) {
  const state = await projectFromLedger(orgId, shipmentId);
  const events = await readLedger(orgId, shipmentId);
  const lastSeq = events.length ? (events[events.length - 1]!.seq ?? 0) : 0;

  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      status: state.status,
      poNumber: state.trade.poNumber ?? null,
      invoiceNumber: state.trade.invoiceNumber ?? null,
      incoterm: state.trade.incoterm ?? null,
      currency: state.trade.currency ?? null,
      totalValue: state.trade.totalValue ?? null,
      originPort: state.trade.originPort ?? null,
      destPort: state.trade.destPort ?? null,
      originCountry: state.trade.originCountry ?? null,
      destCountry: state.trade.destCountry ?? null,
      carrierRef: state.trade.carrierRef ?? null,
      etd: state.trade.etd ? new Date(state.trade.etd) : null,
      eta: state.trade.eta ? new Date(state.trade.eta) : null,
      lastEventSeq: lastSeq,
    },
  });

  return state;
}

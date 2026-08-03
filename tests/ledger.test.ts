/**
 * Integration tests for the two properties the whole architecture rests on:
 *   1. the ledger is append-only, gap-free and replayable;
 *   2. tenant isolation is enforced by the query layer, not by call sites.
 *
 * Needs a running Postgres (see docker-compose.yml). Skipped automatically
 * when DATABASE_URL is not reachable, so `npm test` still passes offline.
 */
import { afterAll, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { appendEvent, projectFromLedger, rebuildShipment } from "@/server/domain/ledger";
import { tenantDb, TenantViolationError } from "@/server/tenant";
import { prisma } from "@/server/db";

// Resolved at module load — describe.skip is chosen during collection, which
// happens before any beforeAll hook would have run.
const reachable = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => {
    console.warn("[tests] Postgres unreachable — skipping ledger integration tests");
    return false;
  });

afterAll(async () => {
  await prisma.$disconnect();
});

const suite = () => (reachable ? describe : describe.skip);

async function makeOrg(name: string) {
  const key = nanoid(10).toLowerCase();
  return prisma.org.create({
    data: { name, slug: `${name}-${key}`, inboundKey: key },
  });
}

async function makeShipment(orgId: string, reference: string) {
  return prisma.shipment.create({
    data: { orgId, reference, title: `Test ${reference}`, inboundToken: nanoid(12).toLowerCase() },
  });
}

const actor = { type: "SYSTEM" as const, label: "test" };

suite()("event ledger", () => {
  it("assigns gap-free, monotonic sequence numbers", async () => {
    const org = await makeOrg("ledger-seq");
    const shipment = await makeShipment(org.id, `SEQ-${nanoid(5)}`);

    for (let i = 0; i < 5; i++) {
      await appendEvent({
        orgId: org.id,
        shipmentId: shipment.id,
        type: "task.created",
        payload: { taskId: `t${i}`, title: `Task ${i}`, severity: "INFO" },
        actor,
      });
    }

    const events = await prisma.event.findMany({
      where: { shipmentId: shipment.id },
      orderBy: { seq: "asc" },
    });
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it("survives concurrent appends without losing or duplicating events", async () => {
    const org = await makeOrg("ledger-race");
    const shipment = await makeShipment(org.id, `RACE-${nanoid(5)}`);

    // This is exactly what two background jobs finishing together do.
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        appendEvent({
          orgId: org.id,
          shipmentId: shipment.id,
          type: "task.created",
          payload: { taskId: `t${i}`, title: `Task ${i}`, severity: "INFO" },
          actor,
        }),
      ),
    );

    const events = await prisma.event.findMany({ where: { shipmentId: shipment.id } });
    const seqs = events.map((e) => e.seq).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(seqs).size).toBe(8);
  });

  it("rejects an append that loses an optimistic-concurrency race", async () => {
    const org = await makeOrg("ledger-optimistic");
    const shipment = await makeShipment(org.id, `OPT-${nanoid(5)}`);

    await appendEvent({
      orgId: org.id,
      shipmentId: shipment.id,
      type: "task.created",
      payload: { taskId: "t1", title: "One", severity: "INFO" },
      actor,
    });

    await expect(
      appendEvent({
        orgId: org.id,
        shipmentId: shipment.id,
        type: "task.created",
        payload: { taskId: "t2", title: "Two", severity: "INFO" },
        actor,
        expectedSeq: 0, // stale — the shipment is already at 1
      }),
    ).rejects.toThrow(/expected 0/);
  });

  it("validates payloads before they reach the ledger", async () => {
    const org = await makeOrg("ledger-validate");
    const shipment = await makeShipment(org.id, `VAL-${nanoid(5)}`);

    await expect(
      appendEvent({
        orgId: org.id,
        shipmentId: shipment.id,
        type: "shipment.status_changed",
        payload: { from: "DRAFT", to: "NOT_A_STATUS" } as never,
        actor,
      }),
    ).rejects.toThrow();

    expect(await prisma.event.count({ where: { shipmentId: shipment.id } })).toBe(0);
  });

  it("keeps the read model equal to a pure replay of the ledger", async () => {
    const org = await makeOrg("ledger-replay");
    const shipment = await makeShipment(org.id, `REP-${nanoid(5)}`);

    await appendEvent({
      orgId: org.id,
      shipmentId: shipment.id,
      type: "shipment.created",
      payload: { reference: shipment.reference, title: shipment.title, origin: "manual" },
      actor,
    });
    await appendEvent({
      orgId: org.id,
      shipmentId: shipment.id,
      type: "shipment.fields_updated",
      payload: { trade: { poNumber: "PO-REPLAY", incoterm: "CIF", totalValue: 1234.5 } },
      actor,
    });
    await appendEvent({
      orgId: org.id,
      shipmentId: shipment.id,
      type: "shipment.status_changed",
      payload: { from: "DRAFT", to: "PO_CONFIRMED" },
      actor,
    });

    const row = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    const replayed = await projectFromLedger(org.id, shipment.id);

    expect(row.status).toBe(replayed.status);
    expect(row.poNumber).toBe(replayed.trade.poNumber);
    expect(row.incoterm).toBe(replayed.trade.incoterm);
    expect(Number(row.totalValue)).toBe(replayed.trade.totalValue);
  });

  it("rebuilds a corrupted read model from the ledger", async () => {
    const org = await makeOrg("ledger-rebuild");
    const shipment = await makeShipment(org.id, `RBD-${nanoid(5)}`);

    await appendEvent({
      orgId: org.id,
      shipmentId: shipment.id,
      type: "shipment.created",
      payload: { reference: shipment.reference, title: shipment.title, origin: "manual" },
      actor,
    });
    await appendEvent({
      orgId: org.id,
      shipmentId: shipment.id,
      type: "shipment.status_changed",
      payload: { from: "DRAFT", to: "PO_CONFIRMED" },
      actor,
    });

    // Corrupt the projection behind the ledger's back.
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: "CANCELLED", poNumber: "GARBAGE" },
    });

    await rebuildShipment(org.id, shipment.id);

    const restored = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(restored.status).toBe("PO_CONFIRMED");
    expect(restored.poNumber).toBeNull();
  });
});

suite()("tenant isolation", () => {
  it("hides another org's rows from findMany", async () => {
    const a = await makeOrg("tenant-a");
    const b = await makeOrg("tenant-b");
    await makeShipment(a.id, `A-${nanoid(5)}`);
    await makeShipment(b.id, `B-${nanoid(5)}`);

    const seenByA = await tenantDb(a.id).shipment.findMany();
    expect(seenByA.length).toBeGreaterThan(0);
    expect(seenByA.every((s) => s.orgId === a.id)).toBe(true);
  });

  it("returns null for another org's row even with the exact id", async () => {
    const a = await makeOrg("tenant-lookup-a");
    const b = await makeOrg("tenant-lookup-b");
    const secret = await makeShipment(b.id, `SECRET-${nanoid(5)}`);

    expect(await tenantDb(a.id).shipment.findUnique({ where: { id: secret.id } })).toBeNull();
    // ...and it is still there for its real owner.
    expect(await tenantDb(b.id).shipment.findUnique({ where: { id: secret.id } })).not.toBeNull();
  });

  it("cannot be widened by passing another orgId in the filter", async () => {
    const a = await makeOrg("tenant-widen-a");
    const b = await makeOrg("tenant-widen-b");
    await makeShipment(b.id, `WID-${nanoid(5)}`);

    const attempt = await tenantDb(a.id).shipment.findMany({ where: { orgId: b.id } });
    expect(attempt).toHaveLength(0);
  });

  it("refuses to update another org's row", async () => {
    const a = await makeOrg("tenant-update-a");
    const b = await makeOrg("tenant-update-b");
    const victim = await makeShipment(b.id, `UPD-${nanoid(5)}`);

    await expect(
      tenantDb(a.id).shipment.update({ where: { id: victim.id }, data: { title: "hijacked" } }),
    ).rejects.toThrow();

    const after = await prisma.shipment.findUniqueOrThrow({ where: { id: victim.id } });
    expect(after.title).not.toBe("hijacked");
  });

  it("stamps the scoped orgId onto creates", async () => {
    const a = await makeOrg("tenant-create");
    const shipment = await makeShipment(a.id, `CRT-${nanoid(5)}`);

    // No orgId supplied on purpose — the extension must stamp it.
    const task = (await tenantDb(a.id).task.create({
      data: { shipmentId: shipment.id, title: "Scoped automatically" },
    } as never)) as { orgId: string };

    expect(task.orgId).toBe(a.id);
  });

  it("throws when a write names a different org", async () => {
    const a = await makeOrg("tenant-forge-a");
    const b = await makeOrg("tenant-forge-b");
    const shipment = await makeShipment(a.id, `FRG-${nanoid(5)}`);

    await expect(
      tenantDb(a.id).task.create({
        data: { orgId: b.id, shipmentId: shipment.id, title: "forged" },
      } as never),
    ).rejects.toThrow(TenantViolationError);
  });

  it("refuses to build a client with no org", () => {
    expect(() => tenantDb("")).toThrow(TenantViolationError);
  });
});

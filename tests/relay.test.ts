/**
 * The relay: the copy-paste bridge, automated.
 *
 * These tests exercise the loop end to end against a real database — request a
 * review, refuse one that would leak, take the buyer's changes and watch the
 * onward draft to the CHA appear — plus the follow-up sweep that chases a
 * party who has gone quiet.
 *
 * Needs a running Postgres (see docker-compose.yml). Skipped automatically
 * when DATABASE_URL is not reachable, so `npm test` still passes offline.
 */
import { afterAll, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import type { DocumentType, PartyType } from "@prisma/client";
import { prisma } from "@/server/db";
import { requestReview, recordReviewResponse, visibleDocuments } from "@/server/domain/relay";
import { sweepFollowUps } from "@/server/domain/followups";
import { defaultVisibility } from "@/server/domain/visibility";
import { env } from "@/env";

const reachable = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => {
    console.warn("[tests] Postgres unreachable — skipping relay integration tests");
    return false;
  });

afterAll(async () => {
  await prisma.$disconnect();
});

const suite = () => (reachable ? describe : describe.skip);
const actor = { type: "USER" as const, id: "test-user", label: "Test Operator" };

/**
 * A shipment with the four parties a real export has: the exporter's buyer,
 * the standing CHA, and a forwarder picked for this sailing.
 */
async function makeRoom() {
  const key = nanoid(10).toLowerCase();
  const org = await prisma.org.create({
    data: { name: `Relay ${key}`, slug: `relay-${key}`, inboundKey: key },
  });
  await prisma.user.create({
    data: {
      orgId: org.id,
      email: `ops-${key}@relay.example`,
      name: "Test Operator",
      passwordHash: "x",
      role: "OWNER",
    },
  });
  const shipment = await prisma.shipment.create({
    data: {
      orgId: org.id,
      reference: `RLY-${key.slice(0, 5).toUpperCase()}`,
      title: "Relay test shipment",
      status: "DOCS_IN_PREP",
      inboundToken: nanoid(12).toLowerCase(),
    },
  });

  const party = async (type: PartyType, name: string) =>
    prisma.party.create({
      data: {
        orgId: org.id,
        shipmentId: shipment.id,
        type,
        name,
        email: `${type.toLowerCase()}-${key}@relay.example`,
        channel: "EMAIL",
      },
    });

  return {
    org,
    shipment,
    buyer: await party("IMPORTER", "Test Buyer BV"),
    cha: await party("CHA", "Test Customs House"),
    forwarder: await party("FORWARDER", "Test Forwarding Co"),
  };
}

async function makeDoc(
  room: Awaited<ReturnType<typeof makeRoom>>,
  type: DocumentType,
  visibleTo?: PartyType[],
) {
  return prisma.document.create({
    data: {
      orgId: room.org.id,
      shipmentId: room.shipment.id,
      type,
      name: `${type}.pdf`,
      family: type,
      version: 1,
      fileRef: `test/${nanoid(8)}.pdf`,
      mimeType: "application/pdf",
      visibleTo: visibleTo ?? defaultVisibility(type),
    },
  });
}

suite()("documents a party can pull", () => {
  it("hides the shipping bill and the checklist from the buyer", async () => {
    const room = await makeRoom();
    await makeDoc(room, "SHIPPING_BILL");
    await makeDoc(room, "CHECKLIST");
    await makeDoc(room, "PHYTOSANITARY_CERT");

    const forBuyer = await visibleDocuments({
      orgId: room.org.id,
      shipmentId: room.shipment.id,
      viewer: "IMPORTER",
    });

    expect(forBuyer.map((d) => d.type)).toEqual(["PHYTOSANITARY_CERT"]);
  });

  it("gives the CHA the checklist and the forwarder the shipping bill, and not the reverse", async () => {
    const room = await makeRoom();
    await makeDoc(room, "SHIPPING_BILL");
    await makeDoc(room, "CHECKLIST");

    const forCha = await visibleDocuments({
      orgId: room.org.id,
      shipmentId: room.shipment.id,
      viewer: "CHA",
    });
    const forForwarder = await visibleDocuments({
      orgId: room.org.id,
      shipmentId: room.shipment.id,
      viewer: "FORWARDER",
    });

    expect(forCha.map((d) => d.type).sort()).toEqual(["CHECKLIST", "SHIPPING_BILL"]);
    expect(forForwarder.map((d) => d.type)).toEqual(["SHIPPING_BILL"]);
  });

  it("shows the exporter everything in their own room", async () => {
    const room = await makeRoom();
    await makeDoc(room, "SHIPPING_BILL");
    await makeDoc(room, "CHECKLIST");
    await makeDoc(room, "OTHER");

    const mine = await visibleDocuments({
      orgId: room.org.id,
      shipmentId: room.shipment.id,
      viewer: "OWNER_ORG",
    });
    expect(mine).toHaveLength(3);
  });

  it("returns only the newest version of each document", async () => {
    const room = await makeRoom();
    await makeDoc(room, "CHECKLIST");
    await prisma.document.create({
      data: {
        orgId: room.org.id,
        shipmentId: room.shipment.id,
        type: "CHECKLIST",
        name: "CHECKLIST.pdf",
        family: "CHECKLIST",
        version: 2,
        fileRef: `test/${nanoid(8)}.pdf`,
        mimeType: "application/pdf",
        visibleTo: defaultVisibility("CHECKLIST"),
      },
    });

    const forCha = await visibleDocuments({
      orgId: room.org.id,
      shipmentId: room.shipment.id,
      viewer: "CHA",
    });
    expect(forCha).toHaveLength(1);
    expect(forCha[0]?.version).toBe(2);
  });
});

suite()("requesting a review", () => {
  it("refuses to ask the buyer to review a shipping bill", async () => {
    const room = await makeRoom();
    const bill = await makeDoc(room, "SHIPPING_BILL");

    await expect(
      requestReview({
        orgId: room.org.id,
        shipmentId: room.shipment.id,
        documentId: bill.id,
        partyId: room.buyer.id,
        actor,
      }),
    ).rejects.toThrow(/not permitted/i);

    // And nothing was written — the refusal is not a half-committed request.
    expect(await prisma.approval.count({ where: { shipmentId: room.shipment.id } })).toBe(0);
  });

  it("creates the request, schedules the chaser, and drafts a covering note", async () => {
    const room = await makeRoom();
    const bl = await makeDoc(room, "BL_DRAFT");

    const { approval, draft } = await requestReview({
      orgId: room.org.id,
      shipmentId: room.shipment.id,
      documentId: bl.id,
      partyId: room.buyer.id,
      actor,
    });

    expect(approval.state).toBe("REQUESTED");
    expect(approval.round).toBe(1);
    expect(approval.dueAt).toBeInstanceOf(Date);
    expect(approval.dueAt!.getTime()).toBeGreaterThan(Date.now());

    // The draft is stored unsent. A human presses send.
    const message = await prisma.message.findUnique({ where: { id: draft.messageId } });
    expect(message?.direction).toBe("OUTBOUND");
    expect((message?.parsedPayload as { draft?: boolean } | null)?.draft).toBe(true);
    expect(message?.toAddress).toBe(room.buyer.email);

    const events = await prisma.event.findMany({ where: { shipmentId: room.shipment.id } });
    expect(events.map((e) => e.type)).toContain("approval.requested");
    expect(events.map((e) => e.type)).toContain("message.reply_drafted");
  });

  it("counts rounds so a second pass is visibly a revision", async () => {
    const room = await makeRoom();
    const bl = await makeDoc(room, "BL_DRAFT");
    const args = {
      orgId: room.org.id,
      shipmentId: room.shipment.id,
      documentId: bl.id,
      partyId: room.buyer.id,
      actor,
    };

    await requestReview(args);
    const second = await requestReview(args);
    expect(second.approval.round).toBe(2);
  });
});

suite()("the buyer asks for a change", () => {
  it("drafts the onward message to the CHA and raises a blocker", async () => {
    const room = await makeRoom();
    const cert = await makeDoc(room, "PHYTOSANITARY_CERT");

    const { approval } = await requestReview({
      orgId: room.org.id,
      shipmentId: room.shipment.id,
      documentId: cert.id,
      partyId: room.buyer.id,
      actor,
    });

    const { approval: decided, draft } = await recordReviewResponse({
      orgId: room.org.id,
      approvalId: approval.id,
      outcome: "CHANGES_REQUESTED",
      comment: "The botanical name is spelled wrong on line 3.",
      // Certificates are the CHA's to fix.
      relayToPartyId: room.cha.id,
      actor,
    });

    expect(decided.state).toBe("REJECTED");
    expect(decided.changesRequested).toContain("botanical name");
    // The chaser stops the moment they respond.
    expect(decided.dueAt).toBeNull();

    // This is the copy-paste that disappears: a message addressed to the CHA,
    // carrying the buyer's words, that the exporter never had to retype.
    expect(draft).not.toBeNull();
    expect(draft!.partyType).toBe("CHA");
    const relayed = await prisma.message.findUnique({ where: { id: draft!.messageId } });
    expect(relayed?.toAddress).toBe(room.cha.email);

    const task = await prisma.task.findFirst({
      where: { shipmentId: room.shipment.id, subjectRef: `message:${draft!.messageId}` },
    });
    expect(task?.severity).toBe("BLOCKER");
  });

  it("drafts nothing onward when the answer is yes", async () => {
    const room = await makeRoom();
    const bl = await makeDoc(room, "BL_DRAFT");
    const { approval } = await requestReview({
      orgId: room.org.id,
      shipmentId: room.shipment.id,
      documentId: bl.id,
      partyId: room.buyer.id,
      actor,
    });

    const { approval: decided, draft } = await recordReviewResponse({
      orgId: room.org.id,
      approvalId: approval.id,
      outcome: "APPROVED",
      relayToPartyId: room.forwarder.id,
      actor,
    });

    expect(decided.state).toBe("GRANTED");
    expect(draft).toBeNull();
  });

  it("ignores a second response to a request that is already settled", async () => {
    const room = await makeRoom();
    const bl = await makeDoc(room, "BL_DRAFT");
    const { approval } = await requestReview({
      orgId: room.org.id,
      shipmentId: room.shipment.id,
      documentId: bl.id,
      partyId: room.buyer.id,
      actor,
    });

    await recordReviewResponse({
      orgId: room.org.id,
      approvalId: approval.id,
      outcome: "APPROVED",
      actor,
    });
    const again = await recordReviewResponse({
      orgId: room.org.id,
      approvalId: approval.id,
      outcome: "CHANGES_REQUESTED",
      comment: "Actually, no.",
      relayToPartyId: room.forwarder.id,
      actor,
    });

    // The first answer stands; a late reversal does not rewrite it.
    expect(again.approval.state).toBe("GRANTED");
    expect(again.draft).toBeNull();
  });
});

suite()("chasing a party who has gone quiet", () => {
  /** Backdate a request so the sweep considers it due. */
  async function makeOverdue(approvalId: string, hoursAgo = 6) {
    return prisma.approval.update({
      where: { id: approvalId },
      data: {
        dueAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - (hoursAgo + 24) * 60 * 60 * 1000),
      },
    });
  }

  async function overdueRequest() {
    const room = await makeRoom();
    const bl = await makeDoc(room, "BL_DRAFT");
    const { approval } = await requestReview({
      orgId: room.org.id,
      shipmentId: room.shipment.id,
      documentId: bl.id,
      partyId: room.buyer.id,
      actor,
    });
    await makeOverdue(approval.id);
    return { room, approval };
  }

  it("chases an overdue request and re-arms the clock", async () => {
    const { room, approval } = await overdueRequest();
    const before = await prisma.message.count({ where: { shipmentId: room.shipment.id } });

    const result = await sweepFollowUps();
    expect(result.considered).toBeGreaterThan(0);
    expect(result.sent + result.drafted).toBeGreaterThan(0);

    const after = await prisma.approval.findUniqueOrThrow({ where: { id: approval.id } });
    expect(after.reminderCount).toBe(1);
    expect(after.lastRemindedAt).toBeInstanceOf(Date);
    // Re-armed for the next interval rather than left to fire again at once.
    expect(after.dueAt!.getTime()).toBeGreaterThan(Date.now());

    expect(await prisma.message.count({ where: { shipmentId: room.shipment.id } })).toBe(
      before + 1,
    );
    const events = await prisma.event.findMany({
      where: { shipmentId: room.shipment.id, type: "followup.sent" },
    });
    expect(events).toHaveLength(1);
  });

  it("sends nothing the second time it runs in the same minute", async () => {
    const { room } = await overdueRequest();
    await sweepFollowUps();
    const afterFirst = await prisma.message.count({ where: { shipmentId: room.shipment.id } });

    await sweepFollowUps();
    expect(await prisma.message.count({ where: { shipmentId: room.shipment.id } })).toBe(
      afterFirst,
    );
  });

  it("stops at the cap and escalates to a human instead of spamming", async () => {
    const { room, approval } = await overdueRequest();

    // Run the sweep FOLLOWUP_MAX times, backdating between passes.
    for (let i = 0; i < env.FOLLOWUP_MAX; i++) {
      await sweepFollowUps();
      const current = await prisma.approval.findUniqueOrThrow({ where: { id: approval.id } });
      if (current.dueAt) await makeOverdue(approval.id);
    }

    const final = await prisma.approval.findUniqueOrThrow({ where: { id: approval.id } });
    expect(final.reminderCount).toBe(env.FOLLOWUP_MAX);
    // dueAt cleared: automated chasing is over.
    expect(final.dueAt).toBeNull();

    const escalation = await prisma.task.findFirst({
      where: { shipmentId: room.shipment.id, subjectRef: `approval:${approval.id}` },
    });
    expect(escalation?.severity).toBe("BLOCKER");
    expect(escalation?.title).toContain("has not responded");

    // One more sweep must do nothing at all.
    const messages = await prisma.message.count({ where: { shipmentId: room.shipment.id } });
    await sweepFollowUps();
    expect(await prisma.message.count({ where: { shipmentId: room.shipment.id } })).toBe(messages);
  });

  it("stops chasing once the party answers", async () => {
    const { room, approval } = await overdueRequest();

    await recordReviewResponse({
      orgId: room.org.id,
      approvalId: approval.id,
      outcome: "APPROVED",
      actor,
    });

    const messages = await prisma.message.count({ where: { shipmentId: room.shipment.id } });
    await sweepFollowUps();
    expect(await prisma.message.count({ where: { shipmentId: room.shipment.id } })).toBe(messages);
  });

  it("does not chase a shipment that has been cancelled", async () => {
    const { room, approval } = await overdueRequest();
    await prisma.shipment.update({
      where: { id: room.shipment.id },
      data: { status: "CANCELLED" },
    });

    const messages = await prisma.message.count({ where: { shipmentId: room.shipment.id } });
    await sweepFollowUps();

    expect(await prisma.message.count({ where: { shipmentId: room.shipment.id } })).toBe(messages);
    const after = await prisma.approval.findUniqueOrThrow({ where: { id: approval.id } });
    expect(after.reminderCount).toBe(0);
    expect(after.dueAt).toBeNull();
  });
});

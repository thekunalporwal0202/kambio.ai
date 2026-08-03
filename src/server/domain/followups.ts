import "server-only";
import { env } from "@/env";
import { prisma } from "../db";
import { tenantDb } from "../tenant";
import { AI_ACTOR, SYSTEM_ACTOR } from "./events";
import { appendEvent } from "./ledger";
import { draftForParty } from "./relay";
import { createTask } from "./shipments";

/**
 * AUTOMATED FOLLOW-UPS.
 *
 * When a party has not responded to a review request, chase them.
 *
 * This is the one place AI-authored text may leave the building without a
 * human pressing send, and that is a deliberate, narrow exception:
 *   - a chaser makes NO commitment — no price, no date, no approval;
 *   - it is capped (FOLLOWUP_MAX) so nobody gets spammed;
 *   - it stops the moment the party responds;
 *   - every send is an event on the ledger, attributed to the system;
 *   - FOLLOWUP_AUTO_SEND=false turns it into a draft for a human instead.
 * Anything financially consequential still requires a person.
 */

export type SweepResult = {
  considered: number;
  sent: number;
  drafted: number;
  skipped: number;
  errors: number;
};

/**
 * Find every overdue review request across all orgs and chase it.
 * Idempotent in effect: `lastRemindedAt` and `dueAt` advance on each pass, so
 * running the sweep twice in a minute sends nothing the second time.
 */
export async function sweepFollowUps(now = new Date()): Promise<SweepResult> {
  const result: SweepResult = { considered: 0, sent: 0, drafted: 0, skipped: 0, errors: 0 };

  const due = await prisma.approval.findMany({
    where: {
      state: "REQUESTED",
      dueAt: { not: null, lte: now },
      partyId: { not: null },
      reminderCount: { lt: env.FOLLOWUP_MAX },
    },
    include: {
      party: true,
      document: { select: { name: true, type: true, version: true } },
      shipment: { select: { id: true, reference: true, title: true, status: true } },
    },
    take: 200,
    orderBy: { dueAt: "asc" },
  });

  result.considered = due.length;

  for (const approval of due) {
    // No way to reach them at all — chasing is not possible, only escalation,
    // and that already happened when the request was raised.
    if (!approval.party || !(approval.party.email || approval.party.phone)) {
      result.skipped += 1;
      continue;
    }
    // Never chase a shipment that has been closed or cancelled.
    if (approval.shipment.status === "CLOSED" || approval.shipment.status === "CANCELLED") {
      await prisma.approval.update({ where: { id: approval.id }, data: { dueAt: null } });
      result.skipped += 1;
      continue;
    }

    try {
      await chaseOne(approval, now, result);
    } catch (err) {
      result.errors += 1;
      console.error(`[followups] failed for approval ${approval.id}:`, err);
    }
  }

  return result;
}

async function chaseOne(
  approval: {
    id: string;
    orgId: string;
    shipmentId: string;
    subject: string;
    partyId: string | null;
    reminderCount: number;
    createdAt: Date;
  },
  now: Date,
  result: SweepResult,
) {
  const db = tenantDb(approval.orgId);
  const daysWaiting = Math.max(
    1,
    Math.round((now.getTime() - approval.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
  );

  const draft = await draftForParty({
    orgId: approval.orgId,
    shipmentId: approval.shipmentId,
    partyId: approval.partyId!,
    purpose: "followup",
    intent: "QUESTION",
    incomingText: `No response yet to: ${approval.subject}`,
    actor: SYSTEM_ACTOR,
    awaiting: { subject: approval.subject, daysWaiting },
  });

  const nextReminder = approval.reminderCount + 1;
  const isLast = nextReminder >= env.FOLLOWUP_MAX;

  if (env.FOLLOWUP_AUTO_SEND) {
    // The narrow auto-send exception. `sendDraftedReply` refuses AI actors, so
    // the chaser is attributed to the system, not to a model.
    const { sendDraftedReply } = await import("./messages");
    await sendDraftedReply({
      orgId: approval.orgId,
      messageId: draft.messageId,
      actor: SYSTEM_ACTOR,
    });
    result.sent += 1;
  } else {
    // Automation disabled: leave it as a draft and tell a human.
    await createTask({
      orgId: approval.orgId,
      shipmentId: approval.shipmentId,
      title: `Follow up with ${draft.partyName} — ${approval.subject}`,
      detail: `No response for ${daysWaiting} day(s). A chaser has been drafted for your review.`,
      severity: "WARNING",
      subjectRef: `message:${draft.messageId}`,
      actor: AI_ACTOR,
    });
    result.drafted += 1;
  }

  await db.approval.update({
    where: { id: approval.id },
    data: {
      reminderCount: nextReminder,
      lastRemindedAt: now,
      // Stop chasing after the cap; raise it for a human instead.
      dueAt: isLast
        ? null
        : new Date(now.getTime() + env.FOLLOWUP_INTERVAL_HOURS * 60 * 60 * 1000),
    },
  });

  await appendEvent({
    orgId: approval.orgId,
    shipmentId: approval.shipmentId,
    type: "followup.sent",
    payload: {
      approvalId: approval.id,
      messageId: draft.messageId,
      reminderNumber: nextReminder,
      daysWaiting,
      autoSent: env.FOLLOWUP_AUTO_SEND,
    },
    actor: SYSTEM_ACTOR,
  });

  if (isLast) {
    await createTask({
      orgId: approval.orgId,
      shipmentId: approval.shipmentId,
      title: `${draft.partyName} has not responded after ${env.FOLLOWUP_MAX} reminders`,
      detail: `${approval.subject} — automated chasing has stopped. This needs a call.`,
      severity: "BLOCKER",
      subjectRef: `approval:${approval.id}`,
      actor: SYSTEM_ACTOR,
    });
  }
}

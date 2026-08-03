"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { confirmExtraction, uploadDocument } from "@/server/domain/documents";
import { sendDraftedReply } from "@/server/domain/messages";
import {
  advanceStatus,
  closeTask,
  createBuyerLink,
  decideApproval,
} from "@/server/domain/shipments";
import { ingestEmail } from "@/server/integrations/ingest";
import { enablePortal, revokePortal } from "@/server/domain/portal";
import { requestReview } from "@/server/domain/relay";
import { sweepFollowUps } from "@/server/domain/followups";
import { orgInboundAddress } from "@/server/integrations/routing";
import { prisma } from "@/server/db";
import "@/server/queue/handlers";

/**
 * All mutations flow through here. Each one:
 *   1. resolves the session (tenant comes from the cookie, never the client),
 *   2. validates input with Zod,
 *   3. delegates to a domain command that appends to the ledger.
 */

export type ActionState = { error?: string; ok?: boolean; message?: string };

function actorFrom(session: { userId: string; name: string }) {
  return { type: "USER" as const, id: session.userId, label: session.name };
}

function fail(err: unknown): ActionState {
  const message = err instanceof Error ? err.message : "Something went wrong";
  console.error("[action]", err);
  return { error: message };
}

/** The magic moment: paste a buyer email, get a structured shipment. */
export async function ingestPastedEmailAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireSession();
    const parsed = z
      .object({
        from: z.string().email("Enter the sender's email address"),
        subject: z.string().optional(),
        body: z.string().min(20, "Paste the email body (at least 20 characters)"),
      })
      .safeParse({
        from: formData.get("from"),
        subject: formData.get("subject") ?? "",
        body: formData.get("body"),
      });

    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

    const org = await prisma.org.findUnique({
      where: { id: session.orgId },
      select: { inboundKey: true },
    });
    if (!org) return { error: "Organisation not found" };

    // Deliberately goes through the SAME path as a real forwarded email.
    const result = await ingestEmail({
      to: orgInboundAddress(org.inboundKey),
      from: parsed.data.from,
      subject: parsed.data.subject || null,
      text: parsed.data.body,
    });

    revalidatePath("/app");
    revalidatePath(`/app/shipments/${result.shipmentId}`);
    return {
      ok: true,
      message: result.created
        ? `Created shipment and queued extraction (${result.routing})`
        : `Filed against an existing shipment (${result.routing})`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function uploadDocumentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireSession();
    const shipmentId = String(formData.get("shipmentId") ?? "");
    const file = formData.get("file");
    const type = String(formData.get("type") ?? "OTHER");

    if (!shipmentId) return { error: "Missing shipment" };
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload" };
    if (file.size > 20 * 1024 * 1024) return { error: "File is larger than 20 MB" };

    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadDocument({
      orgId: session.orgId,
      shipmentId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
      type: type as never,
      actor: actorFrom(session),
    });

    revalidatePath(`/app/shipments/${shipmentId}`);
    return { ok: true, message: "Uploaded — extraction queued" };
  } catch (err) {
    return fail(err);
  }
}

/** Human commit step for AI-extracted fields. */
export async function confirmExtractionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireSession();
    const documentId = String(formData.get("documentId") ?? "");
    const shipmentId = String(formData.get("shipmentId") ?? "");
    if (!documentId) return { error: "Missing document" };

    // Every field_* input is a (possibly corrected) value the human is committing.
    const corrections: Record<string, string | number | null> = {};
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("field_")) continue;
      const name = key.slice("field_".length);
      const raw = String(value).trim();
      corrections[name] = raw === "" ? null : raw;
    }

    const { correctedFields } = await confirmExtraction({
      orgId: session.orgId,
      documentId,
      corrections,
      actor: actorFrom(session),
      userId: session.userId,
    });

    revalidatePath(`/app/shipments/${shipmentId}`);
    revalidatePath("/app");
    return {
      ok: true,
      message: correctedFields.length
        ? `Confirmed with ${correctedFields.length} correction(s)`
        : "Confirmed",
    };
  } catch (err) {
    return fail(err);
  }
}

export async function sendReplyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireSession();
    const messageId = String(formData.get("messageId") ?? "");
    const shipmentId = String(formData.get("shipmentId") ?? "");
    const body = String(formData.get("body") ?? "").trim();
    if (!messageId) return { error: "Missing draft" };
    if (!body) return { error: "The reply is empty" };

    await sendDraftedReply({
      orgId: session.orgId,
      messageId,
      body,
      actor: actorFrom(session),
    });

    revalidatePath(`/app/shipments/${shipmentId}`);
    return { ok: true, message: "Reply sent" };
  } catch (err) {
    return fail(err);
  }
}

export async function decideApprovalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireSession();
    const approvalId = String(formData.get("approvalId") ?? "");
    const shipmentId = String(formData.get("shipmentId") ?? "");
    const state = String(formData.get("state") ?? "");
    if (state !== "GRANTED" && state !== "REJECTED") return { error: "Invalid decision" };

    await decideApproval({
      orgId: session.orgId,
      approvalId,
      state,
      actor: actorFrom(session),
    });

    revalidatePath(`/app/shipments/${shipmentId}`);
    revalidatePath("/app");
    return { ok: true, message: `Approval ${state.toLowerCase()}` };
  } catch (err) {
    return fail(err);
  }
}

export async function advanceStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireSession();
    const shipmentId = String(formData.get("shipmentId") ?? "");
    const to = String(formData.get("to") ?? "");

    await advanceStatus({
      orgId: session.orgId,
      shipmentId,
      to: to as never,
      reason: "Advanced by operator",
      actor: actorFrom(session),
    });

    revalidatePath(`/app/shipments/${shipmentId}`);
    revalidatePath("/app");
    return { ok: true, message: `Status updated` };
  } catch (err) {
    return fail(err);
  }
}

export async function closeTaskAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireSession();
    const taskId = String(formData.get("taskId") ?? "");
    const outcome = String(formData.get("outcome") ?? "DONE");

    await closeTask({
      orgId: session.orgId,
      taskId,
      outcome: outcome === "DISMISSED" ? "DISMISSED" : "DONE",
      actor: actorFrom(session),
    });

    revalidatePath("/app");
    return { ok: true, message: "Task closed" };
  } catch (err) {
    return fail(err);
  }
}

export async function createBuyerLinkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireSession();
    const shipmentId = String(formData.get("shipmentId") ?? "");
    const label = String(formData.get("label") ?? "Buyer view").trim() || "Buyer view";

    const link = await createBuyerLink({
      orgId: session.orgId,
      shipmentId,
      label,
      actor: actorFrom(session),
    });

    revalidatePath(`/app/shipments/${shipmentId}`);
    return { ok: true, message: `/s/${link.token}` };
  } catch (err) {
    return fail(err);
  }
}


/** Hand a counterparty a scoped link into this shipment. */
export async function enablePortalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireSession();
    const partyId = String(formData.get("partyId") ?? "");
    const shipmentId = String(formData.get("shipmentId") ?? "");
    if (!partyId) return { error: "Missing party" };

    const party = await enablePortal({
      orgId: session.orgId,
      partyId,
      actor: actorFrom(session),
    });

    revalidatePath(`/app/shipments/${shipmentId}`);
    return { ok: true, message: `/p/${party.portalToken}` };
  } catch (err) {
    return fail(err);
  }
}

export async function revokePortalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireSession();
    const partyId = String(formData.get("partyId") ?? "");
    const shipmentId = String(formData.get("shipmentId") ?? "");
    await revokePortal({ orgId: session.orgId, partyId });
    revalidatePath(`/app/shipments/${shipmentId}`);
    return { ok: true, message: "Access revoked" };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Ask a party to review a document. Refuses if that party is not entitled to
 * see it — the visibility rules are enforced, not advisory.
 */
export async function requestReviewAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireSession();
    const shipmentId = String(formData.get("shipmentId") ?? "");
    const documentId = String(formData.get("documentId") ?? "");
    const partyId = String(formData.get("partyId") ?? "");
    if (!documentId || !partyId) return { error: "Choose a document and a party" };

    const { draft } = await requestReview({
      orgId: session.orgId,
      shipmentId,
      documentId,
      partyId,
      actor: actorFrom(session),
    });

    revalidatePath(`/app/shipments/${shipmentId}`);
    return { ok: true, message: `Review requested — a covering message is drafted for ${draft.partyName}` };
  } catch (err) {
    return fail(err);
  }
}

/** Run the follow-up sweep now (the scheduler does this automatically). */
export async function runFollowUpSweepAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    await requireSession();
    const result = await sweepFollowUps();
    revalidatePath("/app");
    return {
      ok: true,
      message: `Swept ${result.considered} pending request(s): ${result.sent} chased, ${result.drafted} drafted, ${result.skipped} skipped`,
    };
  } catch (err) {
    return fail(err);
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { contextFromToken, portalRespond, portalUpload } from "@/server/domain/portal";
import "@/server/queue/handlers";

export type PortalState = { ok?: boolean; error?: string; message?: string };

/**
 * Actions available to a counterparty holding a scoped link.
 *
 * The token IS the authorisation: every action re-resolves it server-side, so
 * a participant can only ever act on the one shipment it points at.
 */

export async function portalRespondAction(
  _prev: PortalState,
  formData: FormData,
): Promise<PortalState> {
  const parsed = z
    .object({
      token: z.string().min(10),
      approvalId: z.string().min(1),
      outcome: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
      comment: z.string().optional(),
    })
    .safeParse({
      token: formData.get("token"),
      approvalId: formData.get("approvalId"),
      outcome: formData.get("outcome"),
      comment: formData.get("comment") ?? "",
    });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid response" };

  if (parsed.data.outcome === "CHANGES_REQUESTED" && !parsed.data.comment?.trim()) {
    return { error: "Please describe the changes you need." };
  }

  try {
    const ctx = await contextFromToken(parsed.data.token);
    if (!ctx) return { error: "This link is no longer valid." };

    await portalRespond({
      ctx,
      approvalId: parsed.data.approvalId,
      outcome: parsed.data.outcome,
      comment: parsed.data.comment,
    });

    revalidatePath(`/p/${parsed.data.token}`);
    return {
      ok: true,
      message:
        parsed.data.outcome === "APPROVED"
          ? "Approval recorded — thank you."
          : "Your changes have been sent on.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not record your response" };
  }
}

export async function portalUploadAction(
  _prev: PortalState,
  formData: FormData,
): Promise<PortalState> {
  const token = String(formData.get("token") ?? "");
  const file = formData.get("file");
  const type = String(formData.get("type") ?? "OTHER");

  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload" };
  if (file.size > 20 * 1024 * 1024) return { error: "File is larger than 20 MB" };

  try {
    const ctx = await contextFromToken(token);
    if (!ctx) return { error: "This link is no longer valid." };

    const buffer = Buffer.from(await file.arrayBuffer());
    await portalUpload({
      ctx,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
      type: type as never,
    });

    revalidatePath(`/p/${token}`);
    return { ok: true, message: `${file.name} uploaded.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed" };
  }
}

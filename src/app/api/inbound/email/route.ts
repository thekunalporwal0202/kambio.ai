import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { ingestEmail, type InboundAttachment } from "@/server/integrations/ingest";
import "@/server/queue/handlers";

export const runtime = "nodejs";

/**
 * Inbound email webhook.
 *
 * Accepts a generic shape plus Postmark's and SendGrid's, so switching
 * provider is a config change rather than a rewrite. Returns 200 on
 * duplicates so providers stop retrying.
 */
const AttachmentSchema = z.object({
  Name: z.string().optional(),
  filename: z.string().optional(),
  fileName: z.string().optional(),
  ContentType: z.string().optional(),
  type: z.string().optional(),
  mimeType: z.string().optional(),
  Content: z.string().optional(),
  content: z.string().optional(),
});

const PayloadSchema = z
  .object({
    // generic
    to: z.string().optional(),
    from: z.string().optional(),
    fromName: z.string().nullish(),
    subject: z.string().nullish(),
    text: z.string().optional(),
    messageId: z.string().nullish(),
    // Postmark
    To: z.string().optional(),
    From: z.string().optional(),
    FromName: z.string().nullish(),
    Subject: z.string().nullish(),
    TextBody: z.string().optional(),
    MessageID: z.string().nullish(),
    Attachments: z.array(AttachmentSchema).optional(),
    // SendGrid inbound parse
    envelope: z.string().optional(),
    attachments: z.array(AttachmentSchema).optional(),
  })
  .passthrough();

function decodeAttachments(list: z.infer<typeof AttachmentSchema>[] = []): InboundAttachment[] {
  const out: InboundAttachment[] = [];
  for (const a of list) {
    const content = a.Content ?? a.content;
    const fileName = a.Name ?? a.filename ?? a.fileName;
    if (!content || !fileName) continue;
    out.push({
      fileName,
      mimeType: a.ContentType ?? a.type ?? a.mimeType ?? "application/octet-stream",
      content: Buffer.from(content, "base64"),
    });
  }
  return out;
}

export async function POST(req: NextRequest) {
  // Shared-secret check. Empty secret = open, which is dev-only.
  if (env.INBOUND_WEBHOOK_SECRET) {
    const provided =
      req.headers.get("x-kambio-signature") ?? req.nextUrl.searchParams.get("secret") ?? "";
    if (provided !== env.INBOUND_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Unrecognised payload" }, { status: 400 });
  }
  const p = parsed.data;

  const to = p.to ?? p.To;
  const from = p.from ?? p.From;
  const text = p.text ?? p.TextBody;

  if (!to || !from || !text) {
    return NextResponse.json(
      { error: "Payload must include to, from and text" },
      { status: 400 },
    );
  }

  try {
    const result = await ingestEmail({
      to,
      from,
      fromName: p.fromName ?? p.FromName ?? null,
      subject: p.subject ?? p.Subject ?? null,
      text,
      messageId: p.messageId ?? p.MessageID ?? null,
      attachments: decodeAttachments(p.Attachments ?? p.attachments),
    });

    return NextResponse.json({
      ok: true,
      shipmentId: result.shipmentId,
      created: result.created,
      routing: result.routing,
      deduped: result.deduped,
      documents: result.documentIds.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingestion failed";
    // 422: the payload was well-formed but we can't route it. Retrying won't help.
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

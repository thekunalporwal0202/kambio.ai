import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { ingestWhatsApp } from "@/server/integrations/ingest";
import "@/server/queue/handlers";

export const runtime = "nodejs";

/** Meta webhook verification handshake. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * Inbound WhatsApp (Meta Cloud API shape).
 *
 * Always answers 200 — Meta retries aggressively on any non-2xx, and our
 * ingestion is idempotent on the provider message id anyway.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true, ignored: "invalid json" });
  }

  const results: Array<Record<string, unknown>> = [];

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      const contacts = value.contacts ?? [];
      for (const message of value.messages ?? []) {
        if (message.type !== "text") {
          results.push({ id: message.id, skipped: `unsupported type ${message.type}` });
          continue;
        }
        const profileName =
          contacts.find((c: any) => c?.wa_id === message.from)?.profile?.name ?? null;

        try {
          const result = await ingestWhatsApp({
            from: message.from,
            profileName,
            text: message.text?.body ?? "",
            messageId: message.id,
          });
          results.push({
            id: message.id,
            shipmentId: result.shipmentId,
            created: result.created,
            deduped: result.deduped,
          });
        } catch (err) {
          // Log and continue: one unroutable number must not fail the batch.
          const msg = err instanceof Error ? err.message : "ingest failed";
          console.error("[whatsapp] ingest failed:", msg);
          results.push({ id: message.id, error: msg });
        }
      }
    }
  }

  return NextResponse.json({ ok: true, processed: results });
}

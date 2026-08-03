import { nanoid } from "nanoid";
import { env } from "@/env";

/**
 * Outbound delivery, abstracted so no single vendor is load-bearing.
 * In mock mode messages are logged, not sent — safe for demos.
 */
export type DeliveryInput = {
  channel: "EMAIL" | "WHATSAPP" | "APP";
  to?: string | null;
  subject?: string | null;
  body: string;
  /** RFC 5322 threading so a shipment keeps ONE chain per counterparty. */
  inReplyTo?: string | undefined;
  references?: string[] | undefined;
  replyTo?: string | undefined;
};

export type DeliveryResult = { externalId: string; provider: string; delivered: boolean };

export async function deliver(input: DeliveryInput): Promise<DeliveryResult> {
  if (input.channel === "APP") {
    return { externalId: `app-${nanoid(10)}`, provider: "app", delivered: true };
  }
  if (input.channel === "WHATSAPP") return sendWhatsApp(input);
  return sendEmail(input);
}

async function sendEmail(input: DeliveryInput): Promise<DeliveryResult> {
  const resendKey = env.RESEND_API_KEY ?? env.EMAIL_API_KEY;

  if (env.EMAIL_PROVIDER === "resend") {
    if (!resendKey) {
      console.info(`[email:resend:mock] → ${input.to}: ${input.subject ?? "(no subject)"}`);
      return { externalId: `mock-email-${nanoid(10)}`, provider: "mock", delivered: false };
    }
    return sendViaResend(input, resendKey);
  }

  if (env.EMAIL_PROVIDER === "mock" || !env.EMAIL_API_KEY) {
    console.info(`[email:mock] → ${input.to}: ${input.subject ?? "(no subject)"}`);
    return { externalId: `mock-email-${nanoid(10)}`, provider: "mock", delivered: false };
  }

  if (env.EMAIL_PROVIDER === "postmark") {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": env.EMAIL_API_KEY,
      },
      body: JSON.stringify({
        From: env.EMAIL_FROM,
        To: input.to,
        Subject: input.subject ?? "(no subject)",
        TextBody: input.body,
      }),
    });
    if (!res.ok) throw new Error(`Postmark send failed (${res.status}): ${await res.text()}`);
    const json = (await res.json()) as { MessageID?: string };
    return { externalId: json.MessageID ?? nanoid(10), provider: "postmark", delivered: true };
  }

  // SendGrid returns 202 with the id in a header.
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: env.EMAIL_FROM },
      subject: input.subject ?? "(no subject)",
      content: [{ type: "text/plain", value: input.body }],
    }),
  });
  if (!res.ok) throw new Error(`SendGrid send failed (${res.status}): ${await res.text()}`);
  return {
    externalId: res.headers.get("x-message-id") ?? nanoid(10),
    provider: "sendgrid",
    delivered: true,
  };
}

/**
 * WhatsApp Business (Meta Cloud API).
 *
 * Outside the 24-hour customer service window Meta only permits pre-approved
 * TEMPLATE messages, so free-form sends are attempted first and callers should
 * fall back to a template when Meta rejects with code 131047.
 */
async function sendWhatsApp(input: DeliveryInput): Promise<DeliveryResult> {
  if (env.WHATSAPP_PROVIDER === "mock" || !env.WHATSAPP_ACCESS_TOKEN) {
    console.info(`[whatsapp:mock] → ${input.to}: ${input.body.slice(0, 80)}`);
    return { externalId: `mock-wa-${nanoid(10)}`, provider: "mock", delivered: false };
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.to,
        type: "text",
        text: { body: input.body },
      }),
    },
  );

  if (!res.ok) throw new Error(`WhatsApp send failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { messages?: Array<{ id: string }> };
  return {
    externalId: json.messages?.[0]?.id ?? nanoid(10),
    provider: "meta",
    delivered: true,
  };
}

/**
 * Resend. Implemented over fetch rather than the SDK so the integration layer
 * carries no vendor dependency — swapping providers stays a config change.
 *
 * `headers` is what preserves the single chain: In-Reply-To and References
 * point at the previous Message-ID for this shipment+party.
 */
async function sendViaResend(input: DeliveryInput, apiKey: string): Promise<DeliveryResult> {
  const headers: Record<string, string> = {};
  if (input.inReplyTo) headers["In-Reply-To"] = input.inReplyTo;
  if (input.references?.length) headers["References"] = input.references.join(" ");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.to],
      subject: input.subject ?? "(no subject)",
      text: input.body,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend send failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as { id?: string };
  // Resend returns its own id; the RFC Message-ID it generates is derived from
  // it, which is enough for clients to thread on.
  const id = json.id ?? nanoid(10);
  return { externalId: `<${id}@resend.dev>`, provider: "resend", delivered: true };
}

/** Send an approved WhatsApp template (needed outside the 24h window). */
export async function sendWhatsAppTemplate(args: {
  to: string;
  template: string;
  language?: string;
  variables?: string[];
}): Promise<DeliveryResult> {
  if (env.WHATSAPP_PROVIDER === "mock" || !env.WHATSAPP_ACCESS_TOKEN) {
    console.info(`[whatsapp:mock] template "${args.template}" → ${args.to}`);
    return { externalId: `mock-wa-tpl-${nanoid(10)}`, provider: "mock", delivered: false };
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: args.to,
        type: "template",
        template: {
          name: args.template,
          language: { code: args.language ?? "en" },
          components: args.variables?.length
            ? [
                {
                  type: "body",
                  parameters: args.variables.map((text) => ({ type: "text", text })),
                },
              ]
            : undefined,
        },
      }),
    },
  );

  if (!res.ok) throw new Error(`WhatsApp template send failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { messages?: Array<{ id: string }> };
  return { externalId: json.messages?.[0]?.id ?? nanoid(10), provider: "meta", delivered: true };
}

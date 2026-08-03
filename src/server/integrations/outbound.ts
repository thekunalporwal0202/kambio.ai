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

"use server";

import { z } from "zod";
import { prisma } from "@/server/db";

/** Shared shape for every marketing form driven by `useActionState`. */
export type LeadState = { ok?: boolean; error?: string };

const contactSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name"),
  email: z.string().trim().email("Enter a valid work email"),
  company: z.string().trim().min(2, "Company name is required"),
  message: z.string().trim().min(10, "Give us a little more detail"),
});

const demoSchema = contactSchema.extend({
  role: z.string().trim().min(2, "Your role helps us tailor the demo"),
  volume: z.string().trim().min(1, "Pick a monthly shipment volume"),
  message: z.string().trim().max(4000).optional(),
});

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form and try again";
}

/**
 * `Lead` is deliberately outside the tenant model — nobody who fills in these
 * forms has an org yet. A storage failure must never look like a validation
 * failure to someone trying to reach us, so we log it and still thank them.
 */
async function record(kind: "contact" | "demo", data: Record<string, unknown>) {
  try {
    await prisma.lead.create({ data: { kind, ...data } as never });
  } catch (err) {
    console.error(`[lead:${kind}] could not persist`, err, data);
  }
}

export async function submitContactAction(
  _prev: LeadState,
  formData: FormData,
): Promise<LeadState> {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    company: formData.get("company"),
    message: formData.get("message"),
  });

  if (!parsed.success) return { error: firstError(parsed.error) };

  await record("contact", parsed.data);

  return { ok: true };
}

export async function submitDemoAction(
  _prev: LeadState,
  formData: FormData,
): Promise<LeadState> {
  const parsed = demoSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    company: formData.get("company"),
    role: formData.get("role"),
    volume: formData.get("volume"),
    message: formData.get("message") || undefined,
  });

  if (!parsed.success) return { error: firstError(parsed.error) };

  await record("demo", parsed.data);

  return { ok: true };
}

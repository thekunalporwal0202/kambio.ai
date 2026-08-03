"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { submitContactAction, type LeadState } from "../lead-actions";

export function ContactForm() {
  const [state, action, pending] = useActionState<LeadState, FormData>(submitContactAction, {});

  if (state.ok) {
    return (
      <div className="rounded-xl border border-brand-dim/40 bg-brand-dim/10 p-6">
        <div className="flex items-center gap-2 text-brand">
          <CheckCircle2 className="h-4 w-4" />
          <h2 className="font-semibold tracking-tight">Message received</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Thanks — we have your note. A human will reply to your work email, usually within one
          business day.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required autoComplete="name" placeholder="Priya Nair" />
        </div>
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="company">Company</Label>
        <Input
          id="company"
          name="company"
          required
          autoComplete="organization"
          placeholder="Your export business"
        />
      </div>

      <div>
        <Label htmlFor="message">Message</Label>
        <Textarea
          id="message"
          name="message"
          required
          rows={6}
          placeholder="What are you trying to fix? The more concrete, the better."
        />
      </div>

      {state.error ? (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" className="w-full sm:w-auto" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </Button>

      <p className="text-xs leading-relaxed text-muted">
        We use what you send here to reply to you. Nothing else.
      </p>
    </form>
  );
}

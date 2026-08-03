"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { submitDemoAction, type LeadState } from "../lead-actions";

const VOLUMES = [
  "Fewer than 10 shipments / month",
  "10 – 25 shipments / month",
  "25 – 100 shipments / month",
  "100 – 400 shipments / month",
  "More than 400 shipments / month",
];

export function DemoForm() {
  const [state, action, pending] = useActionState<LeadState, FormData>(submitDemoAction, {});

  if (state.ok) {
    return (
      <div className="rounded-xl border border-brand-dim/40 bg-brand-dim/10 p-6">
        <div className="flex items-center gap-2 text-brand">
          <CheckCircle2 className="h-4 w-4" />
          <h2 className="font-semibold tracking-tight">Request received</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Thanks — we will email you a couple of slots within one business day. Bring a real buyer
          email or purchase order to the call; the demo is far better when the document is yours.
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

      <div className="grid gap-4 sm:grid-cols-2">
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
          <Label htmlFor="role">Role</Label>
          <Input
            id="role"
            name="role"
            required
            autoComplete="organization-title"
            placeholder="Export manager"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="volume">Monthly shipment volume</Label>
        <select
          id="volume"
          name="volume"
          required
          defaultValue=""
          className={cn(
            "w-full appearance-none rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm outline-none focus:border-brand-dim",
          )}
        >
          <option value="" disabled>
            Select a range
          </option>
          {VOLUMES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="message">Anything we should know? (optional)</Label>
        <Textarea
          id="message"
          name="message"
          rows={5}
          placeholder="Which parties are involved, where the paperwork bottlenecks, what you want to see."
        />
      </div>

      {state.error ? (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" className="w-full sm:w-auto" disabled={pending}>
        {pending ? "Sending…" : "Request a demo"}
      </Button>

      <p className="text-xs leading-relaxed text-muted">
        Thirty minutes, screen-shared, no deck. We use your details only to arrange the call.
      </p>
    </form>
  );
}

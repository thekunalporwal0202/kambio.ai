"use client";

import { useActionState, useState } from "react";
import { Mail, Sparkles } from "lucide-react";
import { ingestPastedEmailAction, type ActionState } from "@/app/actions";
import { Button, Card, CardBody, Input, Label, Textarea } from "@/components/ui";

const SAMPLE = `Hi Priya,

Please find our purchase order below for the spring order.

Purchase Order No: PO-4471-B
Incoterm: FOB Nhava Sheva
Currency: USD
Payment terms: 30% advance, balance against BL copy

Description            | HS Code | Qty   | Unit Price | Amount
Cotton poplin shirting | 5208.52 | 4000  | 3.15       | 12600.00
Linen blend fabric     | 5309.29 | 1500  | 6.40       | 9600.00

Total: 22200.00
Port of loading: Nhava Sheva
Port of discharge: Rotterdam
ETD: 2026-09-12
ETA: 2026-10-08

Please confirm and send the proforma invoice.

Regards,
Daan Vermeer
Vermeer Import BV`;

/**
 * The magic-moment entry point. Posts through the SAME ingestion path a real
 * forwarded email takes, so the demo is not a special case.
 */
export function PasteEmail({ inboundAddress }: { inboundAddress: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    ingestPastedEmailAction,
    {},
  );
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [from, setFrom] = useState("");

  function loadSample() {
    setFrom("daan@vermeer-import.example");
    setSubject("Purchase Order PO-4471-B — spring order");
    setBody(SAMPLE);
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-brand" />
              Turn a buyer email into a shipment
            </h2>
            <p className="mt-1 text-xs text-muted">
              Forward mail to{" "}
              <code className="rounded bg-panel-2 px-1.5 py-0.5 text-fg">{inboundAddress}</code>, or
              paste one here — both take the same path.
            </p>
          </div>
          <Button size="sm" type="button" onClick={loadSample}>
            Use sample PO
          </Button>
        </div>

        <form action={action} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="from">From</Label>
              <Input
                id="from"
                name="from"
                type="email"
                required
                placeholder="buyer@example.com"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                name="subject"
                placeholder="Purchase Order PO-4471-B"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="body">Email body</Label>
            <Textarea
              id="body"
              name="body"
              required
              rows={8}
              className="font-mono text-xs"
              placeholder="Paste the buyer's email here…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {state.error ? (
            <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {state.error}
            </p>
          ) : null}
          {state.ok ? (
            <p className="rounded-lg border border-brand-dim/40 bg-brand-dim/10 px-3 py-2 text-xs text-brand">
              {state.message} — refresh in a second to see the extracted fields.
            </p>
          ) : null}

          <Button type="submit" variant="primary" disabled={pending}>
            <Mail className="h-4 w-4" />
            {pending ? "Ingesting…" : "Ingest email"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

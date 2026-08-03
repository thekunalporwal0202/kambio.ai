"use client";

import { useActionState, useState } from "react";
import { Check, MessageSquareWarning, Upload } from "lucide-react";
import { Badge, Button, Textarea } from "@/components/ui";
import { portalRespondAction, portalUploadAction, type PortalState } from "./portal-actions";
import { relativeTime } from "@/lib/utils";

/** Approve, or ask for changes — the two things a counterparty ever does. */
export function PortalRespond({
  token,
  approvalId,
  subject,
  documentName,
  round,
  askedAt,
}: {
  token: string;
  approvalId: string;
  subject: string;
  documentName: string | null;
  round: number;
  askedAt: string;
}) {
  const [state, action, pending] = useActionState<PortalState, FormData>(portalRespondAction, {});
  const [mode, setMode] = useState<"idle" | "changes">("idle");

  if (state.ok) {
    return (
      <p className="rounded-lg border border-brand-dim/40 bg-brand-dim/10 px-3 py-2 text-xs text-brand">
        {state.message}
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-warn/40 bg-warn/5 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{subject}</p>
        {round > 1 ? <Badge tone="info">Round {round}</Badge> : null}
        <span className="ml-auto text-[11px] text-muted">asked {relativeTime(askedAt)}</span>
      </div>
      {documentName ? <p className="mb-2 text-xs text-muted">{documentName}</p> : null}

      <form action={action} className="space-y-2">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="approvalId" value={approvalId} />

        {mode === "changes" ? (
          <>
            <Textarea
              name="comment"
              rows={4}
              required
              className="text-xs"
              placeholder="Describe exactly what needs to change…"
            />
            <p className="text-[11px] text-muted">
              This is sent straight to whoever prepares the document — no copy-paste.
            </p>
          </>
        ) : null}

        {state.error ? (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {state.error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {mode === "idle" ? (
            <>
              <Button
                type="submit"
                name="outcome"
                value="APPROVED"
                size="sm"
                variant="primary"
                disabled={pending}
              >
                <Check className="h-3.5 w-3.5" /> Approve
              </Button>
              <Button type="button" size="sm" onClick={() => setMode("changes")}>
                <MessageSquareWarning className="h-3.5 w-3.5" /> Request changes
              </Button>
            </>
          ) : (
            <>
              <Button
                type="submit"
                name="outcome"
                value="CHANGES_REQUESTED"
                size="sm"
                variant="primary"
                disabled={pending}
              >
                {pending ? "Sending…" : "Send changes"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

/** Counterparties upload into the room; Kambio decides who else may see it. */
export function PortalUpload({ token, partyType }: { token: string; partyType: string }) {
  const [state, action, pending] = useActionState<PortalState, FormData>(portalUploadAction, {});

  // Offer only the document types this party actually issues.
  const options =
    partyType === "CHA"
      ? [
          ["CHECKLIST", "Checklist"],
          ["SHIPPING_BILL", "Shipping bill"],
          ["FUMIGATION_CERT", "Fumigation certificate"],
          ["PHYTOSANITARY_CERT", "Phytosanitary certificate"],
          ["CERTIFICATE_OF_ORIGIN", "Certificate of origin"],
          ["BL_DRAFT", "BL draft"],
        ]
      : partyType === "FORWARDER" || partyType === "CARRIER"
        ? [
            ["BL_DRAFT", "BL draft"],
            ["BILL_OF_LADING", "Bill of lading"],
          ]
        : [["OTHER", "Document"]];

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="file"
          required
          className="text-xs file:mr-3 file:rounded-md file:border-0 file:bg-panel-2 file:px-3 file:py-1.5 file:text-xs file:text-fg"
        />
        <select
          name="type"
          defaultValue={options[0]?.[0]}
          className="rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-xs"
        >
          {options.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={pending}>
          <Upload className="h-3.5 w-3.5" />
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </div>

      {state.error ? (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-lg border border-brand-dim/40 bg-brand-dim/10 px-3 py-2 text-xs text-brand">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

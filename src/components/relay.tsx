"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Eye, EyeOff, Link2, Send, Timer } from "lucide-react";
import {
  enablePortalAction,
  requestReviewAction,
  revokePortalAction,
  runFollowUpSweepAction,
  type ActionState,
} from "@/app/actions";
import { Badge, Button } from "@/components/ui";

/**
 * Who can see and do what, from the exporter's side. Access is per party and
 * per shipment — the CHA stays constant, the forwarder changes each time.
 */
export function PartyAccess({
  shipmentId,
  parties,
}: {
  shipmentId: string;
  parties: Array<{
    id: string;
    name: string;
    type: string;
    email: string | null;
    phone: string | null;
    channel: string;
    portalEnabled: boolean;
    portalToken: string | null;
    viewCount: number;
    hasAccount: boolean;
  }>;
}) {
  const [enableState, enableAction, enabling] = useActionState<ActionState, FormData>(
    enablePortalAction,
    {},
  );
  const [, revoke, revoking] = useActionState<ActionState, FormData>(revokePortalAction, {});
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/p/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 1500);
  };

  if (parties.length === 0) {
    return <p className="text-xs text-muted">No parties on this shipment yet.</p>;
  }

  return (
    <div className="space-y-2">
      {parties.map((p) => (
        <div key={p.id} className="rounded-lg border border-line bg-panel-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="truncate text-[11px] text-muted">{p.email ?? p.phone ?? "—"}</p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              <Badge>{p.type.toLowerCase()}</Badge>
              {p.hasAccount ? <Badge tone="info">account</Badge> : null}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {p.portalEnabled && p.portalToken ? (
              <>
                <Badge tone="brand">
                  <Eye className="h-3 w-3" /> link active
                </Badge>
                <span className="text-[11px] text-muted">{p.viewCount} views</span>
                <Button size="sm" type="button" onClick={() => copy(p.portalToken!)}>
                  {copied === p.portalToken ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  Copy link
                </Button>
                <form action={revoke}>
                  <input type="hidden" name="partyId" value={p.id} />
                  <input type="hidden" name="shipmentId" value={shipmentId} />
                  <Button size="sm" variant="ghost" type="submit" disabled={revoking}>
                    <EyeOff className="h-3.5 w-3.5" /> Revoke
                  </Button>
                </form>
              </>
            ) : (
              <form action={enableAction}>
                <input type="hidden" name="partyId" value={p.id} />
                <input type="hidden" name="shipmentId" value={shipmentId} />
                <Button size="sm" type="submit" disabled={enabling}>
                  <Link2 className="h-3.5 w-3.5" /> Give scoped access
                </Button>
              </form>
            )}
          </div>
        </div>
      ))}

      {enableState.error ? (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {enableState.error}
        </p>
      ) : null}
      <p className="text-[11px] text-muted">
        A scoped link needs no signup and shows only the documents that party may see.
      </p>
    </div>
  );
}

/** Ask a party to review a specific document. */
export function RequestReview({
  shipmentId,
  documentId,
  parties,
}: {
  shipmentId: string;
  documentId: string;
  parties: Array<{ id: string; name: string; type: string; allowed: boolean }>;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestReviewAction, {});
  const eligible = parties.filter((p) => p.allowed && p.type !== "EXPORTER");

  if (eligible.length === 0) {
    return (
      <p className="text-[11px] text-muted">
        No counterparty on this shipment is permitted to see this document.
      </p>
    );
  }

  if (state.ok) {
    return (
      <p className="rounded-lg border border-brand-dim/40 bg-brand-dim/10 px-3 py-2 text-xs text-brand">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <input type="hidden" name="documentId" value={documentId} />
      <select
        name="partyId"
        className="rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-xs"
        defaultValue={eligible[0]?.id}
      >
        {eligible.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.type.toLowerCase()})
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pending}>
        <Send className="h-3.5 w-3.5" />
        {pending ? "Requesting…" : "Request review"}
      </Button>
      {state.error ? <span className="text-[11px] text-danger">{state.error}</span> : null}
    </form>
  );
}

/** Manual trigger for the sweep the scheduler runs every 15 minutes. */
export function FollowUpSweep() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    runFollowUpSweepAction,
    {},
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Button type="submit" size="sm" disabled={pending}>
        <Timer className="h-3.5 w-3.5" />
        {pending ? "Sweeping…" : "Run follow-up sweep now"}
      </Button>
      {state.message ? <span className="text-[11px] text-muted">{state.message}</span> : null}
      {state.error ? <span className="text-[11px] text-danger">{state.error}</span> : null}
    </form>
  );
}

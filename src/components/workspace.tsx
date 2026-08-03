"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Link2, Send, ShieldCheck, Upload, X } from "lucide-react";
import {
  advanceStatusAction,
  closeTaskAction,
  confirmExtractionAction,
  createBuyerLinkAction,
  decideApprovalAction,
  sendReplyAction,
  uploadDocumentAction,
  type ActionState,
} from "@/app/actions";
import { Badge, Button, ConfidenceChip, Input, Label, Textarea } from "@/components/ui";
import { STATUS_LABEL } from "@/lib/utils";

type ExtractedField = {
  value: string | number | null;
  confidence: number;
  sourceSnippet: string | null;
};

/**
 * Human review of AI extraction.
 *
 * Every field shows its confidence and the verbatim source line. Values are
 * editable — the human's edit wins and is recorded as a correction. Nothing
 * reaches the shipment until this form is submitted.
 */
export function ExtractionReview({
  documentId,
  shipmentId,
  fields,
  lineItems,
  threshold,
  confirmed,
}: {
  documentId: string;
  shipmentId: string;
  fields: Record<string, ExtractedField>;
  lineItems: Array<Record<string, unknown>>;
  threshold: number;
  confirmed: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    confirmExtractionAction,
    {},
  );

  const entries = Object.entries(fields);
  if (entries.length === 0) {
    return <p className="text-xs text-muted">No fields were extracted from this document.</p>;
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="shipmentId" value={shipmentId} />

      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map(([name, field]) => {
          const needsReview = field.confidence < threshold;
          return (
            <div
              key={name}
              className={`rounded-lg border p-3 ${
                needsReview && !confirmed ? "border-warn/40 bg-warn/5" : "border-line bg-panel-2"
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label className="mb-0 capitalize">
                  {name.replace(/([A-Z])/g, " $1").toLowerCase()}
                </Label>
                <ConfidenceChip confidence={field.confidence} source={field.sourceSnippet} />
              </div>
              <Input
                name={`field_${name}`}
                defaultValue={field.value === null ? "" : String(field.value)}
                disabled={confirmed}
                className={needsReview && !confirmed ? "border-warn/50" : ""}
              />
              {field.sourceSnippet ? (
                <p className="mt-1.5 line-clamp-2 border-l-2 border-line pl-2 text-[11px] italic text-muted">
                  “{field.sourceSnippet}”
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] text-muted">No source snippet — verify manually.</p>
              )}
            </div>
          );
        })}
      </div>

      {lineItems.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead className="bg-panel-2 text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">HS code</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Unit price</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-right font-medium">Conf.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lineItems.map((item, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">{String(item.description ?? "—")}</td>
                  <td className="px-3 py-2 font-mono">{String(item.hsCode ?? "—")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{String(item.quantity ?? "—")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{String(item.unitPrice ?? "—")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{String(item.amount ?? "—")}</td>
                  <td className="px-3 py-2 text-right">
                    <ConfidenceChip confidence={Number(item.confidence ?? 0)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="brand">{state.message}</Alert> : null}

      {!confirmed ? (
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={pending}>
            <Check className="h-4 w-4" />
            {pending ? "Confirming…" : "Confirm and apply to shipment"}
          </Button>
          <span className="text-[11px] text-muted">
            Edit any value first — your correction overwrites the AI and is logged.
          </span>
        </div>
      ) : (
        <Badge tone="brand">
          <ShieldCheck className="h-3 w-3" /> Confirmed by a human
        </Badge>
      )}
    </form>
  );
}

/** AI-drafted reply. Editable, and only sent when a human presses send. */
export function DraftReply({
  messageId,
  shipmentId,
  channel,
  to,
  subject,
  body,
  rationale,
  confidence,
}: {
  messageId: string;
  shipmentId: string;
  channel: string;
  to: string | null;
  subject: string | null;
  body: string;
  rationale: string | null;
  confidence: number | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendReplyAction, {});
  const [text, setText] = useState(body);

  if (state.ok) return <Alert tone="brand">Reply sent to {to ?? "counterparty"}.</Alert>;

  return (
    <form action={action} className="rounded-lg border border-info/30 bg-info/5 p-3">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="shipmentId" value={shipmentId} />

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone="info">Draft — not sent</Badge>
        <ConfidenceChip confidence={confidence} source={rationale} />
        <span className="text-[11px] text-muted">
          {channel} → {to ?? "—"} {subject ? `· ${subject}` : ""}
        </span>
      </div>

      {rationale ? <p className="mb-2 text-[11px] italic text-muted">{rationale}</p> : null}

      <Textarea
        name="body"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="text-xs"
      />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="mt-2 flex items-center gap-3">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          <Send className="h-3.5 w-3.5" />
          {pending ? "Sending…" : "Send reply"}
        </Button>
        <span className="text-[11px] text-muted">Nothing leaves Kambio until you send.</span>
      </div>
    </form>
  );
}

/** Approval decisions are always human. AI only supplies the evidence. */
export function ApprovalCard({
  approvalId,
  shipmentId,
  subject,
  state: approvalState,
  evidence,
}: {
  approvalId: string;
  shipmentId: string;
  subject: string;
  state: string;
  evidence: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(decideApprovalAction, {});

  return (
    <div className="rounded-lg border border-line bg-panel-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{subject}</p>
        <Badge
          tone={
            approvalState === "GRANTED" ? "brand" : approvalState === "REJECTED" ? "danger" : "warn"
          }
        >
          {approvalState.toLowerCase()}
        </Badge>
      </div>

      {evidence ? (
        <p className="mt-2 border-l-2 border-line pl-2 text-[11px] italic text-muted">
          Evidence: “{evidence}”
        </p>
      ) : null}

      {approvalState === "REQUESTED" ? (
        <form action={action} className="mt-3 flex items-center gap-2">
          <input type="hidden" name="approvalId" value={approvalId} />
          <input type="hidden" name="shipmentId" value={shipmentId} />
          <Button type="submit" name="state" value="GRANTED" size="sm" variant="primary" disabled={pending}>
            <Check className="h-3.5 w-3.5" /> Record approval
          </Button>
          <Button type="submit" name="state" value="REJECTED" size="sm" variant="danger" disabled={pending}>
            <X className="h-3.5 w-3.5" /> Reject
          </Button>
        </form>
      ) : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
    </div>
  );
}

export function StatusAdvance({
  shipmentId,
  options,
}: {
  shipmentId: string;
  options: string[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(advanceStatusAction, {});
  if (options.length === 0) return null;

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      {options.map((to) => (
        <Button key={to} type="submit" name="to" value={to} size="sm" disabled={pending}>
          Move to {STATUS_LABEL[to] ?? to}
        </Button>
      ))}
      {state.error ? <span className="text-[11px] text-danger">{state.error}</span> : null}
    </form>
  );
}

export function UploadDocument({ shipmentId }: { shipmentId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadDocumentAction, {});

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="file"
          required
          className="text-xs file:mr-3 file:rounded-md file:border-0 file:bg-panel-2 file:px-3 file:py-1.5 file:text-xs file:text-fg"
        />
        <select
          name="type"
          defaultValue="OTHER"
          className="rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-xs"
        >
          <option value="OTHER">Auto-detect</option>
          <option value="COMMERCIAL_INVOICE">Commercial invoice</option>
          <option value="PACKING_LIST">Packing list</option>
          <option value="PURCHASE_ORDER">Purchase order</option>
          <option value="BILL_OF_LADING">Bill of lading</option>
        </select>
        <Button type="submit" size="sm" disabled={pending}>
          <Upload className="h-3.5 w-3.5" />
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="brand">{state.message}</Alert> : null}
    </form>
  );
}

export function BuyerLinkPanel({
  shipmentId,
  existing,
}: {
  shipmentId: string;
  existing: Array<{ id: string; token: string; label: string; viewCount: number }>;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createBuyerLinkAction, {});
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (token: string) => {
    const url = `${window.location.origin}/s/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-3">
      {existing.length > 0 ? (
        <ul className="space-y-2">
          {existing.map((link) => (
            <li
              key={link.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{link.label}</p>
                <p className="truncate font-mono text-[10px] text-muted">/s/{link.token}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge>{link.viewCount} views</Badge>
                <Button size="sm" type="button" onClick={() => copy(link.token)}>
                  {copied === link.token ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">
          Share live status with the buyer — no signup, no login, read-only.
        </p>
      )}

      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="shipmentId" value={shipmentId} />
        <Input name="label" placeholder="Buyer view" className="text-xs" />
        <Button type="submit" size="sm" disabled={pending}>
          <Link2 className="h-3.5 w-3.5" /> Create
        </Button>
      </form>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
    </div>
  );
}

export function TaskRow({ task }: { task: { id: string; title: string; detail: string | null; severity: string } }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(closeTaskAction, {});
  if (state.ok) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-panel-2 p-3">
      <Badge tone={task.severity === "BLOCKER" ? "danger" : "warn"}>
        {task.severity === "BLOCKER" ? "Blocker" : "Review"}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{task.title}</p>
        {task.detail ? <p className="mt-0.5 text-xs text-muted">{task.detail}</p> : null}
      </div>
      <form action={action}>
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="outcome" value="DONE" />
        <Button type="submit" size="sm" variant="ghost" disabled={pending} title="Mark done">
          <Check className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}

function Alert({ tone, children }: { tone: "danger" | "brand"; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-lg border px-3 py-2 text-xs ${
        tone === "danger"
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-brand-dim/40 bg-brand-dim/10 text-brand"
      }`}
    >
      {children}
    </p>
  );
}

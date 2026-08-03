import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, FileText, MessageSquare, User } from "lucide-react";
import { env } from "@/env";
import { requireSession } from "@/server/auth";
import { tenantDb } from "@/server/tenant";
import { describeEvent } from "@/server/domain/events";
import { nextStatuses } from "@/server/domain/projection";
import { shipmentInboundAddress } from "@/server/integrations/routing";
import { DOCUMENT_LABEL, canSeeDocument, explainVisibility, hiddenFrom } from "@/server/domain/visibility";
import { PARTY_LABEL } from "@/server/domain/visibility";
import { PartyAccess, RequestReview } from "@/components/relay";
import type { ExtractionResult } from "@/server/ai/types";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfidenceChip,
  EmptyState,
  Field,
  StatusPill,
} from "@/components/ui";
import {
  ApprovalCard,
  BuyerLinkPanel,
  DraftReply,
  ExtractionReview,
  StatusAdvance,
  TaskRow,
  UploadDocument,
} from "@/components/workspace";
import { formatDate, formatMoney, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ShipmentWorkspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const db = tenantDb(session.orgId);

  // tenantDb guarantees another org's id simply returns null here.
  const shipment = await db.shipment.findUnique({
    where: { id },
    include: {
      parties: { orderBy: { createdAt: "asc" } },
      documents: { orderBy: [{ family: "asc" }, { version: "desc" }] },
      tasks: { where: { status: "OPEN" }, orderBy: { severity: "asc" } },
      approvals: { orderBy: { createdAt: "desc" } },
      buyerLinks: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } },
      messages: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { seq: "desc" }, take: 60 },
    },
  });
  if (!shipment) notFound();

  const messagesById = new Map(shipment.messages.map((m) => [m.id, m]));
  const drafts = shipment.messages.filter(
    (m) => m.direction === "OUTBOUND" && (m.parsedPayload as any)?.draft === true,
  );
  const thread = shipment.messages.filter(
    (m) => !(m.direction === "OUTBOUND" && (m.parsedPayload as any)?.draft === true),
  );

  // Only the newest version of each document family is actionable.
  const latestByFamily = new Map<string, (typeof shipment.documents)[number]>();
  for (const doc of shipment.documents) {
    const seen = latestByFamily.get(doc.family);
    if (!seen || doc.version > seen.version) latestByFamily.set(doc.family, doc);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-fg"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Command center
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-muted">{shipment.reference}</span>
          <StatusPill status={shipment.status} />
          {shipment.tasks.length > 0 ? (
            <Badge tone="warn">{shipment.tasks.length} open</Badge>
          ) : null}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{shipment.title}</h1>
        <p className="mt-1 text-xs text-muted">
          Forward mail for this shipment to{" "}
          <code className="rounded bg-panel-2 px-1.5 py-0.5 text-fg">
            {shipmentInboundAddress(shipment.inboundToken)}
          </code>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6">
          {/* -------------------------------------------- needs you ----- */}
          {shipment.tasks.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Needs you</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                {shipment.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </CardBody>
            </Card>
          ) : null}

          {/* -------------------------------------------- approvals ----- */}
          {shipment.approvals.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Approvals</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                {shipment.approvals.map((a) => (
                  <ApprovalCard
                    key={a.id}
                    approvalId={a.id}
                    shipmentId={shipment.id}
                    subject={a.subject}
                    state={a.state}
                    evidence={
                      a.evidenceMessageId
                        ? (messagesById.get(a.evidenceMessageId)?.sourceSnippet ??
                          messagesById.get(a.evidenceMessageId)?.rawText.slice(0, 160) ??
                          null)
                        : null
                    }
                  />
                ))}
              </CardBody>
            </Card>
          ) : null}

          {/* -------------------------------------------- documents ----- */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> Documents
              </CardTitle>
              <span className="text-xs text-muted">{shipment.documents.length} total</span>
            </CardHeader>
            <CardBody className="space-y-5">
              <UploadDocument shipmentId={shipment.id} />

              {shipment.documents.length === 0 ? (
                <EmptyState
                  title="No documents yet"
                  hint="Upload an invoice, packing list or PO — Kambio extracts the fields and asks you to confirm."
                />
              ) : (
                [...latestByFamily.values()].map((doc) => {
                  const extracted = (doc.extractedData ?? null) as ExtractionResult | null;
                  const versions = shipment.documents.filter((d) => d.family === doc.family);
                  return (
                    <div key={doc.id} className="rounded-lg border border-line">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{doc.name}</span>
                          <Badge>{DOCUMENT_LABEL[doc.type]}</Badge>
                          <Badge>v{doc.version}</Badge>
                          {versions.length > 1 ? (
                            <span className="text-[11px] text-muted">
                              {versions.length} versions
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="info" title={explainVisibility(doc)}>
                            {explainVisibility(doc)}
                          </Badge>
                          {hiddenFrom(doc).length > 0 ? (
                            <Badge
                              tone="danger"
                              title={`Hidden from ${hiddenFrom(doc).map((h) => PARTY_LABEL[h]).join(", ")}`}
                            >
                              hidden from {hiddenFrom(doc).map((h) => PARTY_LABEL[h]).join(", ")}
                            </Badge>
                          ) : null}
                          <Badge
                            tone={
                              doc.extractionStatus === "CONFIRMED"
                                ? "brand"
                                : doc.extractionStatus === "FAILED"
                                  ? "danger"
                                  : doc.extractionStatus === "NEEDS_REVIEW"
                                    ? "warn"
                                    : "neutral"
                            }
                          >
                            {doc.extractionStatus.replace("_", " ").toLowerCase()}
                          </Badge>
                          <ConfidenceChip confidence={doc.confidence} />
                        </div>
                      </div>

                      <div className="p-3">
                        {doc.extractionStatus === "PENDING" ||
                        doc.extractionStatus === "PROCESSING" ? (
                          <p className="text-xs text-muted">
                            Extraction queued — reload in a moment.
                          </p>
                        ) : extracted ? (
                          <ExtractionReview
                            documentId={doc.id}
                            shipmentId={shipment.id}
                            fields={(extracted.fields ?? {}) as never}
                            lineItems={(extracted.lineItems ?? []) as never}
                            threshold={env.EXTRACTION_REVIEW_THRESHOLD}
                            confirmed={doc.extractionStatus === "CONFIRMED"}
                          />
                        ) : (
                          <p className="text-xs text-danger">
                            Extraction failed for this document. Re-upload or enter the fields
                            manually.
                          </p>
                        )}

                        <div className="mt-3 border-t border-line pt-3">
                          <RequestReview
                            shipmentId={shipment.id}
                            documentId={doc.id}
                            parties={shipment.parties.map((p) => ({
                              id: p.id,
                              name: p.name,
                              type: p.type,
                              allowed: canSeeDocument(p.type, doc),
                            }))}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>

          {/* -------------------------------------------- messages ------ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Conversation
              </CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {drafts.map((d) => (
                <DraftReply
                  key={d.id}
                  messageId={d.id}
                  shipmentId={shipment.id}
                  channel={d.channel}
                  to={d.toAddress}
                  subject={d.subject}
                  body={d.rawText}
                  rationale={(d.parsedPayload as any)?.rationale ?? null}
                  confidence={d.intentConfidence}
                />
              ))}

              {thread.length === 0 ? (
                <EmptyState
                  title="No messages yet"
                  hint="Inbound email and WhatsApp land here, interpreted and ready for your confirmation."
                />
              ) : (
                thread.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg border p-3 ${
                      m.direction === "INBOUND"
                        ? "border-line bg-panel-2"
                        : "border-brand-dim/30 bg-brand-dim/5"
                    }`}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone={m.direction === "INBOUND" ? "neutral" : "brand"}>
                        {m.direction === "INBOUND" ? "Received" : "Sent"}
                      </Badge>
                      <Badge>{m.channel}</Badge>
                      {m.parsedIntent !== "UNKNOWN" && m.direction === "INBOUND" ? (
                        <>
                          <Badge tone="info">{m.parsedIntent.replace("_", " ").toLowerCase()}</Badge>
                          <ConfidenceChip
                            confidence={m.intentConfidence}
                            source={m.sourceSnippet}
                          />
                        </>
                      ) : null}
                      <span className="ml-auto text-[11px] text-muted">
                        {m.fromAddress ?? m.toAddress} · {relativeTime(m.createdAt)}
                      </span>
                    </div>
                    {m.subject ? <p className="text-xs font-medium">{m.subject}</p> : null}
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted">
                      {m.rawText.length > 900 ? `${m.rawText.slice(0, 900)}…` : m.rawText}
                    </p>
                    {m.sourceSnippet && m.direction === "INBOUND" ? (
                      <p className="mt-2 border-l-2 border-info/40 pl-2 text-[11px] italic text-info">
                        AI read this as evidence: “{m.sourceSnippet}”
                      </p>
                    ) : null}
                    {(m.parsedPayload as any)?.proposedAction ? (
                      <p className="mt-1 text-[11px] text-muted">
                        Proposed: {(m.parsedPayload as any).proposedAction}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        {/* ---------------------------------------------- right rail ---- */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Shipment</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="PO number">{shipment.poNumber ?? "—"}</Field>
                <Field label="Invoice">{shipment.invoiceNumber ?? "—"}</Field>
                <Field label="Incoterm">{shipment.incoterm ?? "—"}</Field>
                <Field label="Value">{formatMoney(shipment.totalValue, shipment.currency)}</Field>
                <Field label="Origin">{shipment.originPort ?? "—"}</Field>
                <Field label="Destination">{shipment.destPort ?? "—"}</Field>
                <Field label="ETD">{formatDate(shipment.etd)}</Field>
                <Field label="ETA">{formatDate(shipment.eta)}</Field>
                <Field label="Carrier ref">{shipment.carrierRef ?? "—"}</Field>
              </div>
              <div className="border-t border-line pt-3">
                <StatusAdvance shipmentId={shipment.id} options={nextStatuses(shipment.status)} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Parties & access</CardTitle>
            </CardHeader>
            <CardBody>
              <PartyAccess
                shipmentId={shipment.id}
                parties={shipment.parties.map((p) => ({
                  id: p.id,
                  name: p.name,
                  type: p.type,
                  email: p.email,
                  phone: p.phone,
                  channel: p.channel,
                  portalEnabled: p.portalEnabled,
                  portalToken: p.portalToken,
                  viewCount: p.viewCount,
                  hasAccount: Boolean(p.userId),
                }))}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Buyer view</CardTitle>
            </CardHeader>
            <CardBody>
              <BuyerLinkPanel shipmentId={shipment.id} existing={shipment.buyerLinks} />
            </CardBody>
          </Card>

          {/* The ledger, rendered. This is the audit trail. */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Timeline</CardTitle>
              <span className="text-xs text-muted">{shipment.lastEventSeq} events</span>
            </CardHeader>
            <CardBody className="max-h-[520px] space-y-3 overflow-y-auto">
              {shipment.events.map((e) => (
                <div key={e.id} className="flex gap-2.5">
                  <div className="mt-0.5">
                    {e.actorType === "AI" ? (
                      <Bot className="h-3.5 w-3.5 text-info" />
                    ) : e.actorType === "USER" ? (
                      <User className="h-3.5 w-3.5 text-brand" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border border-line" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs">
                      {describeEvent(e.type, e.payload as Record<string, unknown>)}
                    </p>
                    <p className="text-[10px] text-muted">
                      #{e.seq} · {e.actorLabel ?? e.actorType.toLowerCase()} ·{" "}
                      {relativeTime(e.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

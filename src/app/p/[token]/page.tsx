import { notFound } from "next/navigation";
import { FileText, Lock, ShieldCheck } from "lucide-react";
import { contextFromToken, portalPayload } from "@/server/domain/portal";
import { DOCUMENT_LABEL, PARTY_LABEL } from "@/server/domain/visibility";
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, Field, StatusPill } from "@/components/ui";
import { PortalRespond, PortalUpload } from "./portal-client";
import { formatDate, relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The counterparty room.
 *
 * A CHA or forwarder opens this with a link — no signup, no install. They see
 * only the documents their party type is entitled to, and only the requests
 * addressed to them.
 */
export default async function ParticipantPortal({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await contextFromToken(token);
  if (!ctx) notFound();

  const { documents, approvals } = await portalPayload(ctx);
  const pending = approvals.filter((a) => a.state === "REQUESTED");
  const settled = approvals.filter((a) => a.state !== "REQUESTED");

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="text-lg font-semibold tracking-tight">
            kambio<span className="text-brand">.</span>
          </span>
          <p className="mt-1 text-xs text-muted">
            {ctx.orgName} shared this shipment with you as{" "}
            <span className="text-fg">{PARTY_LABEL[ctx.party.type]}</span>
          </p>
        </div>
        <Badge tone="info">
          <Lock className="h-3 w-3" /> Scoped access
        </Badge>
      </header>

      <div className="mb-6">
        <p className="font-mono text-xs text-muted">{ctx.shipment.reference}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ctx.shipment.title}</h1>
        <div className="mt-2">
          <StatusPill status={ctx.shipment.status} />
        </div>
      </div>

      <Card className="mb-6">
        <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Origin">{ctx.shipment.originPort ?? "—"}</Field>
          <Field label="Destination">{ctx.shipment.destPort ?? "—"}</Field>
          <Field label="ETD">{formatDate(ctx.shipment.etd)}</Field>
          <Field label="ETA">{formatDate(ctx.shipment.eta)}</Field>
        </CardBody>
      </Card>

      {/* ------------------------------------------------ needs your action */}
      {pending.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Waiting on you</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {pending.map((a) => (
              <PortalRespond
                key={a.id}
                token={token}
                approvalId={a.id}
                subject={a.subject}
                documentName={a.document?.name ?? null}
                round={a.round}
                askedAt={a.createdAt.toISOString()}
              />
            ))}
          </CardBody>
        </Card>
      ) : null}

      {/* ------------------------------------------------------- documents */}
      <Card className="mb-6">
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Documents shared with you
          </CardTitle>
          <span className="text-xs text-muted">{documents.length}</span>
        </CardHeader>
        <CardBody className="space-y-3">
          {documents.length === 0 ? (
            <EmptyState
              title="Nothing shared yet"
              hint="Documents appear here as soon as they are shared with you."
            />
          ) : (
            <ul className="space-y-2">
              {documents.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{d.name}</p>
                    <p className="text-[11px] text-muted">
                      {DOCUMENT_LABEL[d.type]} · v{d.version} · {relativeTime(d.uploadedAt)}
                    </p>
                  </div>
                  <Badge>v{d.version}</Badge>
                </li>
              ))}
            </ul>
          )}

          {ctx.party.canUpload ? (
            <div className="border-t border-line pt-3">
              <p className="mb-2 text-xs text-muted">
                Upload a document for {ctx.orgName}. Kambio routes it to whoever is entitled to
                see it.
              </p>
              <PortalUpload token={token} partyType={ctx.party.type} />
            </div>
          ) : null}
        </CardBody>
      </Card>

      {settled.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Your past responses</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {settled.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{a.subject}</span>
                <Badge tone={a.state === "GRANTED" ? "brand" : "warn"}>
                  {a.state === "GRANTED" ? "approved" : "changes requested"}
                </Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted">
        <ShieldCheck className="h-3 w-3" />
        You are seeing only the documents shared with you as {PARTY_LABEL[ctx.party.type]}.
      </p>
    </main>
  );
}

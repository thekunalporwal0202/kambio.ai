import { notFound } from "next/navigation";
import { CheckCircle2, Circle, Package } from "lucide-react";
import { prisma } from "@/server/db";
import { appendEvent } from "@/server/domain/ledger";
import { Badge, Card, CardBody, CardHeader, CardTitle, Field, StatusPill } from "@/components/ui";
import { STATUS_LABEL, STATUS_ORDER, formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Zero-install buyer view.
 *
 * Read-only, no signup, reachable with just the link. It deliberately exposes
 * only status/route/dates — never internal tasks, costs, margins or the ledger.
 */
export default async function BuyerView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = await prisma.buyerLink.findUnique({
    where: { token },
    include: {
      shipment: {
        include: {
          documents: {
            where: { extractionStatus: "CONFIRMED" },
            orderBy: { uploadedAt: "desc" },
            select: { id: true, name: true, type: true, version: true, uploadedAt: true },
          },
        },
      },
    },
  });

  if (!link || link.revokedAt) notFound();

  const shipment = link.shipment;

  // Record the view — this is what "status chases avoided" counts in the ROI page.
  await prisma.buyerLink.update({
    where: { id: link.id },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });
  await appendEvent({
    orgId: link.orgId,
    shipmentId: link.shipmentId,
    type: "buyer_link.viewed",
    payload: { buyerLinkId: link.id },
    actor: { type: "COUNTERPARTY", label: link.label },
  }).catch(() => {
    // A tracking failure must never break the buyer's page.
  });

  const currentIndex = STATUS_ORDER.indexOf(shipment.status);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">
          kambio<span className="text-brand">.</span>
        </span>
        <Badge>Live shipment status</Badge>
      </div>

      <div className="mb-6">
        <p className="font-mono text-xs text-muted">{shipment.reference}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{shipment.title}</h1>
        <div className="mt-2">
          <StatusPill status={shipment.status} />
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" /> Progress
          </CardTitle>
        </CardHeader>
        <CardBody>
          <ol className="space-y-3">
            {STATUS_ORDER.map((status, i) => {
              const done = currentIndex >= 0 && i <= currentIndex;
              return (
                <li key={status} className="flex items-center gap-3">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted/40" />
                  )}
                  <span className={done ? "text-sm" : "text-sm text-muted/60"}>
                    {STATUS_LABEL[status]}
                  </span>
                  {i === currentIndex ? <Badge tone="brand">Current</Badge> : null}
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Shipment details</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="PO number">{shipment.poNumber ?? "—"}</Field>
          <Field label="Incoterm">{shipment.incoterm ?? "—"}</Field>
          <Field label="Value">{formatMoney(shipment.totalValue, shipment.currency)}</Field>
          <Field label="Origin">{shipment.originPort ?? "—"}</Field>
          <Field label="Destination">{shipment.destPort ?? "—"}</Field>
          <Field label="Carrier ref">{shipment.carrierRef ?? "—"}</Field>
          <Field label="ETD">{formatDate(shipment.etd)}</Field>
          <Field label="ETA">{formatDate(shipment.eta)}</Field>
        </CardBody>
      </Card>

      {shipment.documents.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Confirmed documents</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2">
              {shipment.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <span>{d.name}</span>
                  <span className="text-xs text-muted">
                    v{d.version} · {formatDate(d.uploadedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {/* The graduation path: read-only link → real account. */}
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Want updates without asking?</p>
            <p className="mt-1 text-xs text-muted">
              Create a free account to follow every shipment from this supplier in one place.
            </p>
          </div>
          <a
            href={`/signup?from=${link.token}`}
            className="rounded-lg bg-brand-dim px-4 py-2 text-sm font-semibold text-[#04120c] transition hover:bg-brand"
          >
            Create free account
          </a>
        </CardBody>
      </Card>

      <p className="mt-6 text-center text-[11px] text-muted">
        Shared by the exporter via Kambio · read-only
      </p>
    </main>
  );
}

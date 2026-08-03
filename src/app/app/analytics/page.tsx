import { Clock, DollarSign, FileCheck2, MessageSquare } from "lucide-react";
import { requireSession } from "@/server/auth";
import { costByShipment, roiSummary } from "@/server/analytics/roi";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await requireSession();
  const [roi, costs] = await Promise.all([
    roiSummary(session.orgId),
    costByShipment(session.orgId),
  ]);

  const tiles = [
    {
      label: "Hours saved (30d)",
      value: roi.hoursSaved.toFixed(1),
      icon: <Clock className="h-4 w-4" />,
      sub: `${roi.minutesSaved} minutes of manual work avoided`,
    },
    {
      label: "Documents extracted",
      value: roi.documentsExtracted,
      icon: <FileCheck2 className="h-4 w-4" />,
      sub: `${roi.assumptions.documentExtracted} min saved each`,
    },
    {
      label: "Status chases avoided",
      value: roi.statusChasesAvoided,
      icon: <MessageSquare className="h-4 w-4" />,
      sub: "buyer self-served instead of emailing you",
    },
    {
      label: "AI spend (30d)",
      value: `$${roi.aiCostUsd.toFixed(4)}`,
      icon: <DollarSign className="h-4 w-4" />,
      sub: "cost of every model call, attributed per shipment",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Return on investment</h1>
        <p className="mt-1 text-sm text-muted">
          Every figure is derived from the event ledger, so the maths is auditable rather than a
          vanity counter.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardBody>
              <div className="flex items-center gap-2 text-muted">
                {t.icon}
                <span className="text-xs">{t.label}</span>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{t.value}</p>
              <p className="mt-1 text-[11px] text-muted">{t.sub}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>How this is calculated</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-3 text-xs text-muted">
              Counts come from immutable ledger events. Minute values are assumptions — shown here
              rather than hidden, so you can challenge them.
            </p>
            <ul className="space-y-2 text-xs">
              <Row
                label="Document extracted"
                count={roi.documentsExtracted}
                minutes={roi.assumptions.documentExtracted}
              />
              <Row
                label="Message interpreted"
                count={roi.messagesInterpreted}
                minutes={roi.assumptions.messageInterpreted}
              />
              <Row
                label="Reply drafted and sent"
                count={roi.repliesSent}
                minutes={roi.assumptions.replyDrafted}
              />
              <Row
                label="Status chase avoided"
                count={roi.statusChasesAvoided}
                minutes={roi.assumptions.statusChaseAvoided}
              />
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
              <span className="font-medium">Total</span>
              <span className="tabular-nums">{roi.minutesSaved} min · {roi.hoursSaved} h</span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI cost per shipment</CardTitle>
          </CardHeader>
          <CardBody>
            {costs.length === 0 ? (
              <p className="text-xs text-muted">
                No model calls recorded yet. In mock mode calls are free, which is why this reads
                $0.0000.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="pb-2 text-left font-medium">Shipment</th>
                    <th className="pb-2 text-right font-medium">Calls</th>
                    <th className="pb-2 text-right font-medium">Tokens</th>
                    <th className="pb-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {costs.map((c) => (
                    <tr key={c.shipmentId}>
                      <td className="py-2">
                        <span className="font-mono text-muted">{c.reference}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{c.calls}</td>
                      <td className="py-2 text-right tabular-nums">{c.tokens.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums">${c.costUsd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, count, minutes }: { label: string; count: number; minutes: number }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">
        {count} × {minutes}m = <span className="text-fg">{count * minutes}m</span>
      </span>
    </li>
  );
}

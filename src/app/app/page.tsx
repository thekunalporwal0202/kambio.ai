import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleDot, Clock, Hourglass, Inbox } from "lucide-react";
import { requireSession } from "@/server/auth";
import { tenantDb } from "@/server/tenant";
import { prisma } from "@/server/db";
import { orgInboundAddress } from "@/server/integrations/routing";
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, StatusPill } from "@/components/ui";
import { PasteEmail } from "@/components/paste-email";
import { FollowUpSweep } from "@/components/relay";
import { PARTY_LABEL } from "@/server/domain/visibility";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The ops command center. EXCEPTIONS FIRST: the top of the page answers
 * "what needs me today", not "here are all your shipments".
 */
export default async function CommandCenter() {
  const session = await requireSession();
  const db = tenantDb(session.orgId);

  const [org, exceptions, shipments, awaitingApproval, drafts] = await Promise.all([
    prisma.org.findUnique({ where: { id: session.orgId }, select: { inboundKey: true } }),
    db.task.findMany({
      where: { status: "OPEN" },
      orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
      take: 25,
      include: { shipment: { select: { id: true, reference: true, title: true, status: true } } },
    }),
    db.shipment.findMany({
      where: { status: { notIn: ["CLOSED", "CANCELLED"] } },
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: {
        _count: { select: { tasks: { where: { status: "OPEN" } }, documents: true } },
      },
    }),
    db.approval.findMany({
      where: { state: "REQUESTED", partyId: { not: null } },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: 12,
      include: {
        party: { select: { name: true, type: true } },
        shipment: { select: { id: true, reference: true } },
      },
    }),
    db.message.count({ where: { direction: "OUTBOUND", parsedPayload: { path: ["draft"], equals: true } } }),
  ]);

  const blockers = exceptions.filter((t) => t.severity === "BLOCKER");
  const warnings = exceptions.filter((t) => t.severity !== "BLOCKER");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">What needs you today</h1>
          <p className="mt-1 text-sm text-muted">
            {blockers.length} blocker{blockers.length === 1 ? "" : "s"} · {warnings.length} to
            review · 
            {awaitingApproval.length} waiting on others · {drafts} draft repl
            {drafts === 1 ? "y" : "ies"} to send
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------- exceptions --- */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warn" />
            Exceptions
          </CardTitle>
          <span className="text-xs text-muted">{exceptions.length} open</span>
        </CardHeader>
        <CardBody className="p-0">
          {exceptions.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="Nothing is blocked"
                hint="When AI needs a decision — a low-confidence field, an approval claim, a change request — it lands here."
                icon={<CircleDot className="h-5 w-5" />}
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {exceptions.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/app/shipments/${task.shipmentId}`}
                    className="flex items-start gap-3 px-4 py-3 transition hover:bg-panel-2"
                  >
                    <Badge tone={task.severity === "BLOCKER" ? "danger" : "warn"}>
                      {task.severity === "BLOCKER" ? "Blocker" : "Review"}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      {task.detail ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{task.detail}</p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-muted">
                        {task.shipment.reference} · {task.shipment.title}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted">
                      {relativeTime(task.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ------------------------------------------- waiting on others --- */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Hourglass className="h-4 w-4" />
            Waiting on others
          </CardTitle>
          <FollowUpSweep />
        </CardHeader>
        <CardBody className="p-0">
          {awaitingApproval.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="Nobody owes you a reply"
                hint="Requests you send to a buyer, CHA or forwarder are tracked here, and chased automatically if they go quiet."
                icon={<Hourglass className="h-5 w-5" />}
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {awaitingApproval.map((a) => {
                const overdue = a.dueAt !== null && a.dueAt.getTime() < Date.now();
                return (
                  <li key={a.id}>
                    <Link
                      href={`/app/shipments/${a.shipmentId}`}
                      className="flex items-start gap-3 px-4 py-3 transition hover:bg-panel-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.subject}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {a.party?.name}
                          {a.party ? ` · ${PARTY_LABEL[a.party.type]}` : ""} ·{" "}
                          {a.shipment.reference}
                          {a.round > 1 ? ` · round ${a.round}` : ""}
                        </p>
                      </div>
                      {a.reminderCount > 0 ? (
                        <Badge>
                          {a.reminderCount} chase{a.reminderCount === 1 ? "" : "s"} sent
                        </Badge>
                      ) : null}
                      <Badge tone={overdue ? "warn" : undefined}>
                        {overdue ? "overdue" : `asked ${relativeTime(a.createdAt)}`}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ------------------------------------------------- shipments --- */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Active shipments</CardTitle>
            <span className="text-xs text-muted">{shipments.length}</span>
          </CardHeader>
          <CardBody className="p-0">
            {shipments.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No shipments yet"
                  hint="Paste a buyer email on the right to create your first one."
                  icon={<Inbox className="h-5 w-5" />}
                />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {shipments.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/app/shipments/${s.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-panel-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted">{s.reference}</span>
                          <StatusPill status={s.status} />
                          {s._count.tasks > 0 ? (
                            <Badge tone="warn">{s._count.tasks} open</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-sm">{s.title}</p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {s.originPort || s.destPort
                            ? `${s.originPort ?? "?"} → ${s.destPort ?? "?"} · `
                            : ""}
                          {s._count.documents} doc{s._count.documents === 1 ? "" : "s"}
                          {s.poNumber ? ` · PO ${s.poNumber}` : ""}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
                        <Clock className="h-3 w-3" />
                        {relativeTime(s.updatedAt)}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* ------------------------------------------------- intake ------ */}
        <PasteEmail inboundAddress={orgInboundAddress(org?.inboundKey ?? "your-key")} />
      </div>
    </div>
  );
}

import "server-only";
import { tenantDb } from "../tenant";

/**
 * ROI instrumentation.
 *
 * Every number below is derived from the event ledger, so the methodology is
 * auditable rather than a vanity counter. The minute values are explicit
 * assumptions — shown in the UI — not hidden constants.
 */
export const TIME_SAVED_MINUTES = {
  /** Keying an invoice/PO into a spreadsheet by hand. */
  documentExtracted: 12,
  /** Reading a counterparty email and deciding what it means. */
  messageInterpreted: 4,
  /** Composing a reply from scratch. */
  replyDrafted: 6,
  /** A "where is my shipment?" email the buyer did NOT have to send. */
  statusChaseAvoided: 8,
} as const;

export type RoiSummary = {
  documentsExtracted: number;
  messagesInterpreted: number;
  repliesSent: number;
  statusChasesAvoided: number;
  minutesSaved: number;
  hoursSaved: number;
  aiCostUsd: number;
  activeShipments: number;
  exceptionsOpen: number;
  assumptions: typeof TIME_SAVED_MINUTES;
};

export async function roiSummary(orgId: string, sinceDays = 30): Promise<RoiSummary> {
  const db = tenantDb(orgId);
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const [events, aiCalls, activeShipments, exceptionsOpen] = await Promise.all([
    db.event.groupBy({
      by: ["type"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    db.aiCall.aggregate({
      where: { createdAt: { gte: since }, ok: true },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    }),
    db.shipment.count({ where: { status: { notIn: ["CLOSED", "CANCELLED"] } } }),
    db.task.count({ where: { status: "OPEN", severity: { in: ["BLOCKER", "WARNING"] } } }),
  ]);

  const count = (type: string) => events.find((e) => e.type === type)?._count._all ?? 0;

  const documentsExtracted = count("document.extraction_completed");
  const messagesInterpreted = count("message.intent_classified");
  const repliesSent = count("message.sent");
  // Each buyer self-serve view is a status chase the exporter didn't field.
  const statusChasesAvoided = count("buyer_link.viewed");

  const minutesSaved =
    documentsExtracted * TIME_SAVED_MINUTES.documentExtracted +
    messagesInterpreted * TIME_SAVED_MINUTES.messageInterpreted +
    repliesSent * TIME_SAVED_MINUTES.replyDrafted +
    statusChasesAvoided * TIME_SAVED_MINUTES.statusChaseAvoided;

  return {
    documentsExtracted,
    messagesInterpreted,
    repliesSent,
    statusChasesAvoided,
    minutesSaved,
    hoursSaved: Math.round((minutesSaved / 60) * 10) / 10,
    aiCostUsd: Number(aiCalls._sum.costUsd ?? 0),
    activeShipments,
    exceptionsOpen,
    assumptions: TIME_SAVED_MINUTES,
  };
}

/** Per-shipment AI spend — the unit-economics view. */
export async function costByShipment(orgId: string, limit = 10) {
  const db = tenantDb(orgId);
  const grouped = await db.aiCall.groupBy({
    by: ["shipmentId"],
    where: { ok: true, shipmentId: { not: null } },
    _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    _count: { _all: true },
  });

  const ids = grouped.map((g) => g.shipmentId).filter((id): id is string => Boolean(id));
  const shipments = await db.shipment.findMany({
    where: { id: { in: ids } },
    select: { id: true, reference: true, title: true },
  });
  const byId = new Map(shipments.map((s) => [s.id, s]));

  return grouped
    .map((g) => ({
      shipmentId: g.shipmentId!,
      reference: byId.get(g.shipmentId!)?.reference ?? "—",
      title: byId.get(g.shipmentId!)?.title ?? "—",
      calls: g._count._all,
      costUsd: Number(g._sum.costUsd ?? 0),
      tokens: (g._sum.inputTokens ?? 0) + (g._sum.outputTokens ?? 0),
    }))
    .sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens)
    .slice(0, limit);
}

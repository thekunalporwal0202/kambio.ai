import { prisma } from "./db";

/**
 * Tenant isolation, enforced at the QUERY LAYER.
 *
 * `tenantDb(orgId)` returns a Prisma client where every operation on a
 * tenant-scoped model is rewritten to include `orgId`:
 *   - reads/updates/deletes get `orgId` merged into `where`;
 *   - creates get `data.orgId` forced to the scoped org;
 *   - a write that names a DIFFERENT orgId throws TenantViolationError.
 *
 * A call site that forgets to filter by org therefore still cannot read or
 * write another tenant's rows. Nested writes inherit the parent row's org
 * because they are only reachable through an already-scoped parent.
 */
const TENANT_MODELS = new Set<string>([
  "User",
  "Shipment",
  "Party",
  "Document",
  "Message",
  "Task",
  "Approval",
  "Event",
  "BuyerLink",
  "AiCall",
]);

/** `where` is a *unique* input: merge scalars (AND is not always accepted). */
const UNIQUE_WHERE_OPS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);

/** `where` is a filter input: AND so the caller cannot widen the scope. */
const FILTER_WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "updateMany",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantViolationError";
  }
}

function assertOrg(data: unknown, orgId: string, model: string) {
  if (data && typeof data === "object" && "orgId" in data) {
    const given = (data as { orgId?: unknown }).orgId;
    if (typeof given === "string" && given !== orgId) {
      throw new TenantViolationError(
        `Refusing to write ${model} for org ${given} from a client scoped to ${orgId}`,
      );
    }
  }
}

function withOrg<T extends object>(data: T, orgId: string, model: string): T {
  assertOrg(data, orgId, model);
  return { ...data, orgId };
}

export type TenantClient = ReturnType<typeof tenantDb>;

export function tenantDb(orgId: string) {
  if (!orgId) throw new TenantViolationError("tenantDb() requires an orgId");

  return prisma.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);

          const next = { ...(args as Record<string, unknown>) };
          const where = next.where as Record<string, unknown> | undefined;

          if (UNIQUE_WHERE_OPS.has(operation)) {
            // orgId last so a caller-supplied value can never win.
            next.where = { ...(where ?? {}), orgId };
          } else if (FILTER_WHERE_OPS.has(operation)) {
            next.where = where ? { AND: [where, { orgId }] } : { orgId };
          }

          if (operation === "createMany" || operation === "createManyAndReturn") {
            const d = next.data;
            next.data = Array.isArray(d)
              ? d.map((row) => withOrg(row as object, orgId, model))
              : withOrg((d ?? {}) as object, orgId, model);
          } else if (operation === "upsert") {
            next.create = withOrg((next.create ?? {}) as object, orgId, model);
            assertOrg(next.update, orgId, model);
          } else if (operation === "create") {
            next.data = withOrg((next.data ?? {}) as object, orgId, model);
          }

          if (operation === "update" || operation === "updateMany") {
            assertOrg(next.data, orgId, model);
          }

          return query(next);
        },
      },
    },
  });
}

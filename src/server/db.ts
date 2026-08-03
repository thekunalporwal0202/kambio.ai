import { PrismaClient } from "@prisma/client";
import { env } from "@/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Raw, UNSCOPED client. Only use this for cross-tenant work (auth lookup by
 * email, inbound webhook routing, migrations, seed). Application code should
 * go through `tenantDb(orgId)` — see ./tenant.ts.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

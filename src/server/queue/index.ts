import { env } from "@/env";
import { z } from "zod";

/**
 * Job contracts. Every handler must be IDEMPOTENT: jobs can be retried and, in
 * inline mode, may run in the same process as the request that enqueued them.
 */
export const jobSchemas = {
  "document.extract": z.object({
    orgId: z.string(),
    shipmentId: z.string(),
    documentId: z.string(),
  }),
  "message.interpret": z.object({
    orgId: z.string(),
    shipmentId: z.string(),
    messageId: z.string(),
    /** Draft a reply after classifying. */
    draftReply: z.boolean().default(true),
  }),
} as const;

export type JobName = keyof typeof jobSchemas;
export type JobData<T extends JobName> = z.infer<(typeof jobSchemas)[T]>;

export type JobHandler<T extends JobName> = (data: JobData<T>) => Promise<void>;

export interface QueueDriver {
  readonly name: string;
  enqueue<T extends JobName>(name: T, data: JobData<T>): Promise<void>;
  close(): Promise<void>;
}

/** Handlers are registered by src/server/queue/handlers.ts (server-side only). */
const handlers = new Map<JobName, JobHandler<JobName>>();

export function registerHandler<T extends JobName>(name: T, handler: JobHandler<T>) {
  handlers.set(name, handler as JobHandler<JobName>);
}

export async function runJob<T extends JobName>(name: T, data: unknown) {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`No handler registered for job "${name}"`);
  const parsed = jobSchemas[name].parse(data) as JobData<T>;
  await handler(parsed as JobData<JobName>);
}

export const QUEUE_NAME = "kambio";
export const jobNames = Object.keys(jobSchemas) as JobName[];

/**
 * Runs jobs in-process. Default driver: no Redis needed for the demo, and the
 * exact same handler code runs as in production.
 */
class InlineQueue implements QueueDriver {
  readonly name = "inline";

  async enqueue<T extends JobName>(name: T, data: JobData<T>) {
    // Deliberately not awaited: mirrors async queue semantics so callers can't
    // accidentally depend on the job having finished.
    void (async () => {
      try {
        await runJob(name, data);
      } catch (err) {
        console.error(`[queue:inline] job "${name}" failed:`, err);
      }
    })();
  }

  async close() {}
}

/** BullMQ + Redis for real deployments. */
class RedisQueue implements QueueDriver {
  readonly name = "redis";
  private queue: any;

  constructor() {
    const { Queue } = require("bullmq") as typeof import("bullmq");
    this.queue = new Queue(QUEUE_NAME, {
      connection: { url: env.REDIS_URL } as never,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    });
  }

  async enqueue<T extends JobName>(name: T, data: JobData<T>) {
    await this.queue.add(name, data);
  }

  async close() {
    await this.queue?.close();
  }
}

let driver: QueueDriver | null = null;

export function queue(): QueueDriver {
  if (!driver) {
    try {
      driver = env.QUEUE_DRIVER === "redis" ? new RedisQueue() : new InlineQueue();
    } catch (err) {
      console.error("[queue] falling back to inline driver:", err);
      driver = new InlineQueue();
    }
  }
  return driver;
}

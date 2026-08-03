/**
 * Background worker.
 *
 * Runs the SAME handlers the web process registers, so inline (dev) and queued
 * (production) execution can never diverge. Start with `npm run worker` when
 * QUEUE_DRIVER=redis.
 */
import { Queue, Worker } from "bullmq";
import { env } from "../src/env";
import { QUEUE_NAME, runJob, type JobName } from "../src/server/queue";
import { registerJobHandlers } from "../src/server/queue/handlers";

registerJobHandlers();

if (env.QUEUE_DRIVER !== "redis") {
  console.warn(
    `[worker] QUEUE_DRIVER is "${env.QUEUE_DRIVER}" — jobs run in the web process. ` +
      `Set QUEUE_DRIVER=redis to use this worker.`,
  );
}

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    console.info(`[worker] ${job.name} (${job.id}) starting`);
    await runJob(job.name as JobName, job.data);
    console.info(`[worker] ${job.name} (${job.id}) done`);
  },
  {
    connection: { url: env.REDIS_URL } as never,
    concurrency: 5,
  },
);

worker.on("failed", (job, err) => {
  console.error(`[worker] ${job?.name} (${job?.id}) failed:`, err.message);
});

// Schedule the follow-up sweep. Repeatable jobs are deduplicated by BullMQ,
// so restarting the worker does not create duplicates.
const scheduler = new Queue(QUEUE_NAME, { connection: { url: env.REDIS_URL } as never });
await scheduler.add(
  "followups.sweep",
  { triggeredBy: "schedule" },
  {
    repeat: { pattern: "*/15 * * * *" }, // every 15 minutes
    jobId: "followups-sweep",
    removeOnComplete: 50,
  },
);
console.info("[worker] follow-up sweep scheduled every 15 minutes");

console.info(`[worker] listening on queue "${QUEUE_NAME}" via ${env.REDIS_URL}`);

async function shutdown(signal: string) {
  console.info(`[worker] ${signal} received, draining…`);
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

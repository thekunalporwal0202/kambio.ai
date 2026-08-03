import "server-only";
import { extractDocument } from "../domain/documents";
import { interpretMessage } from "../domain/messages";
import { registerHandler } from "./index";

/**
 * Single registration point for job handlers. Imported by both the web process
 * (inline driver) and the worker process (redis driver) so the two can never
 * drift apart.
 *
 * All handlers must be idempotent — see each implementation for how.
 */
let registered = false;

export function registerJobHandlers() {
  if (registered) return;
  registered = true;

  registerHandler("document.extract", async (data) => {
    await extractDocument(data);
  });

  registerHandler("message.interpret", async (data) => {
    await interpretMessage(data);
  });
}

registerJobHandlers();

import { env } from "@/env";
import { prisma } from "../db";
import { MockProvider } from "./providers/mock";
import type {
  AiProvider,
  AiResult,
  AiTaskName,
  ClassifyMessageInput,
  DraftReply,
  DraftReplyInput,
  ExtractDocumentInput,
  ExtractionResult,
  MessageClassification,
} from "./types";

type ProviderName = "mock" | "anthropic" | "openai";

const cache = new Map<ProviderName, AiProvider>();

function build(name: ProviderName): AiProvider {
  switch (name) {
    case "anthropic": {
      // Required lazily so a missing vendor SDK/key never breaks mock mode.
      const { AnthropicProvider } = require("./providers/anthropic") as typeof import("./providers/anthropic");
      return new AnthropicProvider();
    }
    case "openai": {
      const { OpenAiProvider } = require("./providers/openai") as typeof import("./providers/openai");
      return new OpenAiProvider();
    }
    default:
      return new MockProvider();
  }
}

function providerFor(task: AiTaskName): AiProvider {
  const override =
    task === "extract_document"
      ? env.AI_PROVIDER_EXTRACT_DOCUMENT
      : task === "classify_message"
        ? env.AI_PROVIDER_CLASSIFY_MESSAGE
        : env.AI_PROVIDER_DRAFT_REPLY;

  const name = (override ?? env.AI_PROVIDER) as ProviderName;

  let provider = cache.get(name);
  if (!provider) {
    try {
      provider = build(name);
    } catch (err) {
      // Misconfiguration must not take the product down; degrade to mock and
      // make the degradation visible in the logs.
      console.error(`[ai] provider "${name}" unavailable, falling back to mock:`, err);
      provider = new MockProvider();
    }
    cache.set(name, provider);
  }
  return provider;
}

/** Reset the provider cache — used by tests. */
export function resetAiGateway() {
  cache.clear();
}

type CallContext = { orgId: string; shipmentId?: string | null };

async function record(
  task: AiTaskName,
  ctx: CallContext,
  usage: AiResult<unknown>["usage"],
  ok: boolean,
  error?: string,
) {
  try {
    await prisma.aiCall.create({
      data: {
        orgId: ctx.orgId,
        shipmentId: ctx.shipmentId ?? null,
        task,
        provider: usage.provider,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
        latencyMs: usage.latencyMs,
        ok,
        error: error ?? null,
      },
    });
  } catch (err) {
    // Telemetry must never fail the caller.
    console.error("[ai] failed to record AiCall:", err);
  }
}

async function invoke<T>(
  task: AiTaskName,
  ctx: CallContext,
  fn: (p: AiProvider) => Promise<AiResult<T>>,
): Promise<AiResult<T>> {
  const provider = providerFor(task);
  const started = Date.now();
  try {
    const result = await fn(provider);
    await record(task, ctx, result.usage, true);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await record(
      task,
      ctx,
      {
        provider: provider.name,
        model: env.AI_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: Date.now() - started,
      },
      false,
      message,
    );
    throw err;
  }
}

/**
 * The only AI surface the rest of the app may import.
 * No call site knows which vendor answered.
 */
export const ai = {
  extractDocument(ctx: CallContext, input: ExtractDocumentInput): Promise<AiResult<ExtractionResult>> {
    return invoke("extract_document", ctx, (p) => p.extractDocument(input));
  },
  classifyMessage(ctx: CallContext, input: ClassifyMessageInput): Promise<AiResult<MessageClassification>> {
    return invoke("classify_message", ctx, (p) => p.classifyMessage(input));
  },
  draftReply(ctx: CallContext, input: DraftReplyInput): Promise<AiResult<DraftReply>> {
    return invoke("draft_reply", ctx, (p) => p.draftReply(input));
  },
  activeProvider(task: AiTaskName = "extract_document") {
    return providerFor(task).name;
  },
};

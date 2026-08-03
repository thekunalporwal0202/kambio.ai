import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/env";
import {
  CLASSIFICATION_SCHEMA,
  CLASSIFY_SYSTEM,
  DRAFT_SCHEMA,
  DRAFT_SYSTEM,
  EXTRACTION_SCHEMA,
  EXTRACTION_SYSTEM,
  classifyUserPrompt,
  draftUserPrompt,
  extractionUserPrompt,
} from "../prompts";
import {
  DraftReplySchema,
  ExtractionResultSchema,
  MessageClassificationSchema,
  type AiProvider,
  type AiResult,
  type ClassifyMessageInput,
  type DraftReply,
  type DraftReplyInput,
  type ExtractDocumentInput,
  type ExtractionResult,
  type MessageClassification,
} from "../types";

/** Published per-MTok rates, used for cost attribution. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(model = env.AI_MODEL) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY");
    }
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    this.model = model;
  }

  private async run<T>(
    system: string,
    user: string,
    schema: Record<string, unknown>,
    parse: (raw: unknown) => T,
    maxTokens = 8000,
  ): Promise<AiResult<T>> {
    const started = Date.now();
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: user }],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Model declined this request");
    }

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("No text content in model response");

    const data = parse(JSON.parse(text.text));
    const price = PRICING[this.model] ?? { input: 5, output: 25 };

    return {
      data,
      usage: {
        provider: this.name,
        model: this.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        costUsd:
          (response.usage.input_tokens / 1_000_000) * price.input +
          (response.usage.output_tokens / 1_000_000) * price.output,
        latencyMs: Date.now() - started,
      },
    };
  }

  extractDocument(input: ExtractDocumentInput): Promise<AiResult<ExtractionResult>> {
    return this.run(
      EXTRACTION_SYSTEM,
      extractionUserPrompt(input.fileName, input.text, input.hintedType),
      EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
      (raw) => ExtractionResultSchema.parse(raw),
    );
  }

  classifyMessage(input: ClassifyMessageInput): Promise<AiResult<MessageClassification>> {
    return this.run(
      CLASSIFY_SYSTEM,
      classifyUserPrompt(input),
      CLASSIFICATION_SCHEMA as unknown as Record<string, unknown>,
      (raw) => MessageClassificationSchema.parse(raw),
      2000,
    );
  }

  draftReply(input: DraftReplyInput): Promise<AiResult<DraftReply>> {
    return this.run(
      DRAFT_SYSTEM,
      draftUserPrompt(input),
      DRAFT_SCHEMA as unknown as Record<string, unknown>,
      (raw) => DraftReplySchema.parse(raw),
      2000,
    );
  }
}

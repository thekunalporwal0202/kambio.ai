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

/**
 * OpenAI-compatible provider, implemented over plain fetch so we carry no
 * second vendor SDK. Works against any OpenAI-shaped endpoint via
 * OPENAI_BASE_URL (Azure, together.ai, a local vLLM, ...).
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

export class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  private model: string;

  constructor(model = env.AI_MODEL === "claude-opus-5" ? "gpt-4o" : env.AI_MODEL) {
    if (!env.OPENAI_API_KEY) throw new Error("AI_PROVIDER=openai requires OPENAI_API_KEY");
    this.model = model;
  }

  private async run<T>(
    system: string,
    user: string,
    schemaName: string,
    schema: Record<string, unknown>,
    parse: (raw: unknown) => T,
  ): Promise<AiResult<T>> {
    const started = Date.now();
    const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: schemaName, schema, strict: false },
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI request failed (${res.status}): ${await res.text()}`);
    }

    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenAI");

    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;
    const price = PRICING[this.model] ?? { input: 2.5, output: 10 };

    return {
      data: parse(JSON.parse(content)),
      usage: {
        provider: this.name,
        model: this.model,
        inputTokens,
        outputTokens,
        costUsd: (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output,
        latencyMs: Date.now() - started,
      },
    };
  }

  extractDocument(input: ExtractDocumentInput): Promise<AiResult<ExtractionResult>> {
    return this.run(
      EXTRACTION_SYSTEM,
      extractionUserPrompt(input.fileName, input.text, input.hintedType),
      "extraction",
      EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
      (raw) => ExtractionResultSchema.parse(raw),
    );
  }

  classifyMessage(input: ClassifyMessageInput): Promise<AiResult<MessageClassification>> {
    return this.run(
      CLASSIFY_SYSTEM,
      classifyUserPrompt(input),
      "classification",
      CLASSIFICATION_SCHEMA as unknown as Record<string, unknown>,
      (raw) => MessageClassificationSchema.parse(raw),
    );
  }

  draftReply(input: DraftReplyInput): Promise<AiResult<DraftReply>> {
    return this.run(
      DRAFT_SYSTEM,
      draftUserPrompt(input),
      "draft",
      DRAFT_SCHEMA as unknown as Record<string, unknown>,
      (raw) => DraftReplySchema.parse(raw),
    );
  }
}

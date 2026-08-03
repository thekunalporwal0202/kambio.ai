import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are Kambio, the AI assistant behind Kambio.AI.
Help users with questions, writing, analysis, and planning.
Keep responses focused, brief, and concise; give a high-level answer unless an in-depth one is specifically requested.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Server is missing ANTHROPIC_API_KEY. See .env.example." },
      { status: 500 },
    );
  }

  let messages: ChatMessage[];
  try {
    const body = await req.json();
    messages = body.messages;
    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      !messages.every(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.length > 0,
      )
    ) {
      throw new Error("invalid");
    }
  } catch {
    return Response.json(
      { error: "Body must be { messages: [{ role, content }, ...] }" },
      { status: 400 },
    );
  }

  const client = new Anthropic();

  const stream = client.messages.stream({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    start(controller) {
      stream.on("text", (delta) => {
        controller.enqueue(encoder.encode(delta));
      });
      stream.on("error", (err) => {
        controller.enqueue(
          encoder.encode(`\n\n[Error: ${err.message ?? "request failed"}]`),
        );
        controller.close();
      });
      stream.on("end", () => controller.close());
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

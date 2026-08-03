"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistant = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        assistant += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: assistant }]);
      }
    } catch (err) {
      setMessages([
        ...history,
        {
          role: "assistant",
          content: `Something went wrong: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex h-[calc(100vh-65px)] max-w-3xl flex-col px-6">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-8">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-foreground/50">
            <p className="text-2xl font-semibold text-foreground/80">
              Hi, I&apos;m Kambio 👋
            </p>
            <p className="mt-2 max-w-sm">
              Ask me anything — questions, drafts, analysis, planning.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-2xl rounded-br-sm bg-accent-dim px-4 py-3 text-background"
                  : "max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-border-soft bg-surface px-4 py-3"
              }
            >
              {m.content || (busy && i === messages.length - 1 ? "…" : "")}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={send} className="flex gap-3 border-t border-border-soft py-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message Kambio…"
          className="flex-1 rounded-xl border border-border-soft bg-surface px-4 py-3 outline-none placeholder:text-foreground/40 focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-accent-dim px-6 py-3 font-semibold text-background transition hover:bg-accent disabled:opacity-40"
        >
          {busy ? "…" : "Send"}
        </button>
      </form>
    </main>
  );
}

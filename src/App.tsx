import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import type { UIMessage } from "ai";
import { type FormEvent, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";

const starterQuestions = [
  "What has Nathan built?",
  "What is TaskRatchet?",
  "What's his experience with Cloudflare?",
];

/** One Conversation per browser: a random ID kept in localStorage, so a returning visitor resumes it. */
function conversationId(): string {
  try {
    const saved = localStorage.getItem("conversation");
    if (saved) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem("conversation", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Failed turns can leave assistant messages with no text; there is nothing to show for them. */
const hasText = (m: UIMessage) => m.parts.some((p) => p.type === "text" && p.text.trim());

export function App() {
  const [name] = useState(conversationId);
  const agent = useAgent({ agent: "ChatAgent", name });
  const { messages, sendMessage, status, error } = useAgentChat({ agent });
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    sendMessage({ role: "user", parts: [{ type: "text", text: question }] });
    setInput("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-12 text-stone-900 dark:text-stone-100">
      <h1 className="text-2xl font-semibold">Ask about Nathan Arthur's career</h1>
      <p className="mt-2 text-stone-600 dark:text-stone-400">
        Ask a question about Nathan's work and get an answer drawn from his career profile.
      </p>

      {messages.length === 0 && (
        <ul className="mt-8 flex flex-wrap gap-2">
          {starterQuestions.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => ask(q)}
                className="rounded-full border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ol className="mt-8 flex flex-col gap-4" aria-live="polite">
        {messages.filter(hasText).map((m: UIMessage) => (
          <li key={m.id} className={m.role === "user" ? "self-end" : "self-start"}>
            <span className="sr-only">{m.role === "user" ? "You asked:" : "Answer:"}</span>
            <div
              className={
                m.role === "user"
                  ? "rounded-2xl bg-stone-200 px-4 py-2 dark:bg-stone-800"
                  : "prose prose-stone max-w-none dark:prose-invert"
              }
            >
              {m.parts.map((p, i) =>
                p.type !== "text" ? null : m.role === "user" ? (
                  <p key={i}>{p.text}</p>
                ) : (
                  <Markdown key={i}>{p.text}</Markdown>
                ),
              )}
            </div>
          </li>
        ))}
        {status === "submitted" && <li className="text-stone-500">Thinking…</li>}
        {error && <li className="text-red-700 dark:text-red-400">{error.message}</li>}
      </ol>
      <div ref={endRef} />

      <form className="mt-auto flex gap-2 pt-8" onSubmit={onSubmit}>
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <input
          id="question"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          placeholder="Ask about Nathan's career"
          className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-transparent px-4 py-3 dark:border-stone-700"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-stone-900 px-4 py-3 text-white disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900"
        >
          Ask
        </button>
      </form>
      <p className="mt-3 text-xs text-stone-500">
        Answers come only from Nathan's{" "}
        <a className="underline" href="https://github.com/narthur/natbot/blob/main/profile.md">
          public profile
        </a>
        . Nathan may read these conversations to improve the assistant.
      </p>
    </main>
  );
}

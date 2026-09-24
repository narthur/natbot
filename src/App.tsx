import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import type { UIMessage } from "ai";
import { type FormEvent, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { HandoffCard } from "./HandoffCard";
import { useTurnstile } from "./turnstile";
import type { ChatAgent, ChatState } from "./worker/chat";

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

type Part = UIMessage["parts"][number];
/** The model's draftHandoff call (ADR 0003), if this part is one. */
const draft = (p: Part) =>
  p.type === "tool-draftHandoff" && "state" in p && (p.state === "input-available" || p.state === "output-available")
    ? { id: p.toolCallId, question: (p.input as { question?: string } | undefined)?.question ?? "" }
    : undefined;

/** Failed turns can leave assistant messages with nothing to show. */
const hasContent = (m: UIMessage) => m.parts.some((p) => (p.type === "text" && p.text.trim()) || draft(p));

export function App() {
  const [name] = useState(conversationId);
  const agent = useAgent<ChatAgent, ChatState>({ agent: "ChatAgent", name });
  const { messages, sendMessage, status, error } = useAgentChat({ agent });
  const [input, setInput] = useState("");
  // The id of a Handoff opened from the "Ask Nathan directly" link, if any.
  const [directHandoff, setDirectHandoff] = useState<string>();
  const endRef = useRef<HTMLDivElement>(null);
  // Unknown until the Conversation's state arrives; the server only wants a token until the Conversation passes.
  const needsCheck = agent.state !== undefined && !agent.state.verified;
  const turnstile = useTurnstile(needsCheck);
  const busy = status === "submitted" || status === "streaming";
  const ready = !busy && agent.state !== undefined && (!needsCheck || turnstile.token !== undefined);
  const sentHandoffs = agent.state?.sentHandoffs ?? [];

  const handoffCard = (id: string, question: string) => (
    <HandoffCard
      key={id}
      id={id}
      question={question}
      sent={sentHandoffs.includes(id)}
      needsToken={needsCheck}
      token={turnstile.token}
      onTokenUsed={turnstile.reset}
      send={(request) => agent.call("sendHandoff", [request])}
    />
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function ask(text: string) {
    const question = text.trim();
    if (!question || !ready) return;
    sendMessage(
      { role: "user", parts: [{ type: "text", text: question }] },
      { body: needsCheck ? { turnstileToken: turnstile.token } : {} },
    );
    if (needsCheck) turnstile.reset();
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
                disabled={!ready}
                className="rounded-full border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-900"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ol className="mt-8 flex flex-col gap-4" aria-live="polite">
        {messages.filter(hasContent).map((m: UIMessage) => (
          <li key={m.id} className={m.role === "user" ? "self-end" : "self-start"}>
            <span className="sr-only">{m.role === "user" ? "You asked:" : "Answer:"}</span>
            <div
              className={
                m.role === "user"
                  ? "rounded-2xl bg-stone-200 px-4 py-2 dark:bg-stone-800"
                  : "prose prose-stone max-w-none dark:prose-invert"
              }
            >
              {m.parts.map((p, i) => {
                const d = m.role === "assistant" ? draft(p) : undefined;
                if (d) return handoffCard(d.id, d.question);
                if (p.type !== "text") return null;
                return m.role === "user" ? (
                  <p key={i}>{p.text}</p>
                ) : (
                  <Markdown key={i} disallowedElements={["img"]}>
                    {p.text}
                  </Markdown>
                );
              })}
            </div>
          </li>
        ))}
        {status === "submitted" && <li className="text-stone-500">Thinking…</li>}
        {error && <li className="text-red-700 dark:text-red-400">{error.message}</li>}
      </ol>
      {directHandoff && <div className="mt-4">{handoffCard(directHandoff, "")}</div>}
      <div ref={endRef} />

      <div ref={turnstile.ref} className="mt-auto pt-8" />
      {needsCheck && turnstile.failed && (
        <p className="text-sm text-red-700 dark:text-red-400">
          The check that keeps bots out couldn't load, so asking is turned off. Try reloading the page, or allow
          challenges.cloudflare.com if a content blocker is on.
        </p>
      )}
      <form className="flex gap-2 pt-2" onSubmit={onSubmit}>
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
          disabled={!ready || !input.trim()}
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
        . Nathan may read these conversations to improve the assistant.{" "}
        <button
          type="button"
          onClick={() => setDirectHandoff(crypto.randomUUID())}
          disabled={agent.state === undefined}
          className="underline"
        >
          Ask Nathan directly
        </button>
      </p>
    </main>
  );
}

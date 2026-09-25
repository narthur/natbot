import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import type { UIMessage } from "ai";
import { type FormEvent, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { About } from "./About";
import { HandoffCard } from "./HandoffCard";
import { useTurnstile } from "./turnstile";
import type { ChatAgentClass, ChatState } from "./worker/chat";
import type { Hit } from "./worker/writing";

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

/**
 * The posts a search of Nathan's writing returned, once per post. Listed from the tool's result, not the model's
 * text, so the Visitor sees what was searched whether or not the answer cites it (issue #28).
 */
const searched = (p: Part): Hit[] | "unavailable" | undefined => {
  if (p.type !== "tool-searchWriting" || !("state" in p) || p.state !== "output-available") return undefined;
  if (!Array.isArray(p.output)) return "unavailable";
  // Only https links: the URLs come from the feeds, which this page doesn't control.
  const hits = (p.output as Hit[]).filter((h) => h.url?.startsWith("https://"));
  return [...new Map(hits.map((h) => [h.url, h])).values()];
};

/** Display order within an answer: the text, then the posts it searched, then a draft. */
const rank = (p: Part) => (draft(p) ? 2 : searched(p) ? 1 : 0);

/** Failed turns can leave assistant messages with nothing to show. */
const hasContent = (m: UIMessage) =>
  m.parts.some((p) => (p.type === "text" && p.text.trim()) || draft(p) || (m.role === "assistant" && searched(p)));

export function App() {
  const [name] = useState(conversationId);
  const agent = useAgent<ChatAgentClass, ChatState>({ agent: "ChatAgent", name });
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

  const handoffCard = (id: string, question: string, autoFocus = false) => (
    <HandoffCard
      key={id}
      id={id}
      question={question}
      autoFocus={autoFocus}
      sent={sentHandoffs.includes(id)}
      needsToken={needsCheck}
      token={turnstile.token}
      onTokenUsed={turnstile.reset}
      send={(request) => agent.call("sendHandoff", [request])}
    />
  );

  useEffect(() => {
    // Not on an empty Conversation: that would scroll a phone past the header.
    if (messages.length) endRef.current?.scrollIntoView({ behavior: "smooth" });
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
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[25rem_minmax(0,1fr)]">
      <About />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pt-6 lg:min-h-dvh lg:px-18 lg:pt-14">
        {messages.length === 0 && (
          <>
            <h2 className="font-serif text-4xl leading-none font-medium tracking-tight lg:text-6xl">
              Interview the résumé.
            </h2>
            <p className="mt-4 font-serif text-lg text-muted lg:text-xl">
              Put a question to his career profile. Anything it can't answer goes to him by email.
            </p>
            <p className="label mt-8 mb-2.5 text-muted">Opening questions</p>
            <ol className="border-t border-rule">
              {starterQuestions.map((q) => (
                <li key={q} className="border-b border-rule">
                  <button
                    type="button"
                    onClick={() => ask(q)}
                    disabled={!ready}
                    className="flex min-h-14 w-full items-baseline gap-4 py-3 text-left font-serif text-xl hover:text-accent disabled:opacity-50 lg:text-2xl"
                  >
                    <span className="label text-accent">Q.</span>
                    {q}
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}

        <ol className="flex flex-col gap-5" aria-live="polite">
          {messages.filter(hasContent).map((m: UIMessage, i) => (
            <li
              key={m.id}
              className={`grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 gap-y-4 ${m.role === "user" && i > 0 ? "border-t border-rule pt-4" : ""}`}
            >
              <span className={`label pt-1.5 ${m.role === "user" ? "text-accent" : "text-muted"}`}>
                <span aria-hidden="true">{m.role === "user" ? "Q." : "A."}</span>
                <span className="sr-only">{m.role === "user" ? "You asked:" : "Answer:"}</span>
              </span>
              <div
                className={
                  m.role === "user"
                    ? "font-serif text-xl leading-snug font-semibold"
                    : "prose prose-lg max-w-none font-serif text-body prose-a:text-accent"
                }
              >
                {/* The answer reads first, whatever order the model's steps came in. */}
                {[...m.parts]
                  .sort((a, b) => rank(a) - rank(b))
                  .map((p, i) => {
                    const d = m.role === "assistant" ? draft(p) : undefined;
                    if (d) return handoffCard(d.id, d.question);
                    const posts = m.role === "assistant" ? searched(p) : undefined;
                    if (posts) {
                      return (
                        <div key={i} className="not-prose font-sans text-sm text-muted">
                          <p className="label">Searched Nathan's writing</p>
                          {posts === "unavailable" ? (
                            <p className="mt-1">His writing couldn't be searched just now.</p>
                          ) : posts.length ? (
                            <ul className="mt-1">
                              {posts.map((h) => (
                                <li key={h.url}>
                                  <a className="text-accent underline" href={h.url} target="_blank" rel="noreferrer">
                                    {h.title}
                                  </a>{" "}
                                  ({h.source === "beeminder" ? "Beeminder blog" : "newsletter"}, {h.date})
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1">Nothing relevant found.</p>
                          )}
                        </div>
                      );
                    }
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
          {status === "submitted" && <li className="pl-11 font-serif text-muted italic">Thinking…</li>}
          {error && <li className="pl-11 text-accent">{error.message}</li>}
        </ol>
        {directHandoff && <div className="mt-5">{handoffCard(directHandoff, "", true)}</div>}
        <div ref={endRef} />

        <div className="sticky bottom-0 mt-auto bg-paper pt-6 pb-5">
          <div ref={turnstile.ref} />
          {needsCheck && turnstile.failed && (
            <p className="text-sm text-accent">
              The check that keeps bots out couldn't load, so asking is turned off. Try reloading the page, or allow
              challenges.cloudflare.com if a content blocker is on.
            </p>
          )}
          <form className="flex items-end gap-4 border-b-2 border-ink pt-2" onSubmit={onSubmit}>
            <label htmlFor="question" className="sr-only">
              Your question
            </label>
            <input
              id="question"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2000}
              placeholder={messages.length ? "Next question…" : "Your question…"}
              className="min-h-14 min-w-0 flex-1 bg-transparent font-serif text-xl placeholder:text-muted lg:text-2xl"
            />
            <button
              type="submit"
              disabled={!ready || !input.trim()}
              className="label mb-1 min-h-11 rounded-xs bg-accent px-5 text-card hover:bg-accent-dark disabled:opacity-50"
            >
              Ask
            </button>
          </form>
          <p className="mt-3 text-sm text-muted">
            Answers come only from Nathan's{" "}
            <a className="text-accent underline" href="https://github.com/narthur/natbot/blob/main/profile.md">
              public profile
            </a>{" "}
            and his published writing, and Nathan may read these conversations to improve the assistant.{" "}
            <button
              type="button"
              onClick={() => setDirectHandoff(crypto.randomUUID())}
              disabled={agent.state === undefined}
              className="text-accent underline"
            >
              Ask Nathan directly
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}

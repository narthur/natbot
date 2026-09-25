import { type FormEvent, useState } from "react";
import type { HandoffResult } from "./worker/handoff";

type Props = {
  id: string;
  /** The model's draft: the Visitor's question as they asked it. Empty when opened from the link. */
  question: string;
  sent: boolean;
  /** True until the Conversation passes Turnstile; then no token is sent. */
  needsToken: boolean;
  /** Undefined until the page's Turnstile widget has produced one. */
  token: string | undefined;
  onTokenUsed: () => void;
  send: (request: { id: string; message: string; email: string; turnstileToken?: string }) => Promise<HandoffResult>;
};

/** A Handoff the Visitor can edit and send to Nathan. Nothing is sent until they press Send (ADR 0003). */
export function HandoffCard({ id, question, sent, needsToken, token, onTokenUsed, send }: Props) {
  const [message, setMessage] = useState(question);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string>();

  if (sent) {
    return (
      <p className="not-prose border border-ink bg-card px-5 py-4 font-serif text-lg">
        Sent to Nathan. He'll reply to the email address you gave.
      </p>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setProblem(undefined);
    try {
      const result = await send({ id, message, email: email.trim(), turnstileToken: needsToken ? token : undefined });
      if (!result.sent) setProblem(result.reason);
    } catch {
      setProblem("Something went wrong sending that. Please try again.");
    } finally {
      if (needsToken) onTokenUsed();
      setSending(false);
    }
  }

  const canSend = !sending && message.trim() !== "" && email.trim() !== "" && (!needsToken || token !== undefined);
  return (
    <form
      onSubmit={onSubmit}
      className="not-prose flex flex-col gap-3 border border-ink bg-card px-5 py-4 font-sans text-base text-ink"
    >
      <p className="label text-accent">Letter to Nathan</p>
      <p className="font-serif text-lg">
        {question ? "The profile doesn't cover this. Send it to Nathan?" : "Send a question to Nathan"}{" "}
        He gets it by email and replies to you directly.
      </p>
      <label className="flex flex-col gap-1">
        <span className="label text-muted">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          rows={2}
          required
          className="border-b border-rule bg-transparent py-1.5 font-serif text-lg focus:border-ink focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label text-muted">Your email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={254}
          required
          autoComplete="email"
          placeholder="you@company.com"
          className="min-h-11 border-b border-ink bg-transparent font-serif text-lg placeholder:text-muted focus:outline-none"
        />
      </label>
      {problem && <p className="text-accent">{problem}</p>}
      <button
        type="submit"
        disabled={!canSend}
        className="label min-h-11 rounded-xs bg-accent px-5 text-card hover:bg-accent-dark disabled:opacity-50 sm:self-end"
      >
        {sending ? "Sending…" : "Send to Nathan"}
      </button>
    </form>
  );
}

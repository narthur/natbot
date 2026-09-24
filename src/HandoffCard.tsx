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
      <p className="rounded-lg border border-stone-300 px-4 py-3 text-sm dark:border-stone-700">
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
      className="not-prose flex flex-col gap-2 rounded-lg border border-stone-300 p-4 text-sm dark:border-stone-700"
    >
      <p className="font-medium">
        {question ? "The profile doesn't cover this. Send it to Nathan?" : "Send a question to Nathan"}
      </p>
      <p className="text-stone-600 dark:text-stone-400">He gets it by email and replies to you directly.</p>
      <label className="flex flex-col gap-1">
        <span>Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          rows={3}
          required
          className="rounded-md border border-stone-300 bg-transparent px-3 py-2 dark:border-stone-700"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>Your email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={254}
          required
          autoComplete="email"
          className="rounded-md border border-stone-300 bg-transparent px-3 py-2 dark:border-stone-700"
        />
      </label>
      {problem && <p className="text-red-700 dark:text-red-400">{problem}</p>}
      <button
        type="submit"
        disabled={!canSend}
        className="self-start rounded-lg bg-stone-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900"
      >
        {sending ? "Sending…" : "Send to Nathan"}
      </button>
    </form>
  );
}

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type LanguageModel,
  type ModelMessage,
  streamText,
  type UIMessage,
} from "ai";
import { SYSTEM_PROMPT } from "./prompt";

export const MAX_QUESTION_CHARS = 2000;
// Keeps the prompt well inside Llama 3.3's 24k-token context alongside the Profile (ADR 0002).
const HISTORY_TURNS = 10;

/** A completed exchange this server produced. The only history the model ever sees. */
export type Turn = { question: string; answer: string };

export type AnswerDeps = {
  /** False when this Conversation is asking too fast. */
  withinRateLimit: () => Promise<boolean>;
  /** Claims one of today's model calls; false when none are left. */
  spendBudget: () => Promise<boolean>;
  /** The Conversation's recorded turns, oldest first. */
  history: { recent: (limit: number) => Turn[]; record: (turn: Turn) => void };
  model: LanguageModel;
};

/**
 * Answers the visitor's latest message: checks the rate limit and daily budget, then streams the
 * model's answer and records it as a turn. Always returns a UI message stream the chat client can show.
 */
export async function answer(messages: UIMessage[], deps: AnswerDeps, abortSignal?: AbortSignal): Promise<Response> {
  const question = latestQuestion(messages);
  if (!question) return reply("Please type a question about Nathan's career.");

  if (!(await deps.withinRateLimit())) {
    return reply("That's a lot of questions at once. Please wait a minute and try again.");
  }

  if (!(await deps.spendBudget())) {
    console.warn("daily answer budget exhausted");
    return reply(
      "This assistant has answered all the questions it can for today. Please check back tomorrow, or email Nathan at nathan@nathanarthur.com.",
    );
  }

  const result = streamText({
    model: deps.model,
    system: SYSTEM_PROMPT,
    messages: modelMessages(deps.history.recent(HISTORY_TURNS), question),
    maxOutputTokens: 600,
    // One accepted question spends one Budget slot, so keep retries from multiplying the real calls behind it.
    maxRetries: 1,
    abortSignal,
    onFinish: ({ text }) => {
      // An empty answer would be replayed as history on every later call.
      if (text.trim()) deps.history.record({ question, answer: text });
    },
  });
  // The default hides error details from the client; this gives the visitor something to act on.
  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error("chat stream error", error);
      return "Sorry, something went wrong. Please try again.";
    },
  });
}

/** The visitor's latest message as plain text, or null if there isn't one. */
function latestQuestion(messages: UIMessage[]): string | null {
  const last = messages.at(-1);
  if (last?.role !== "user") return null;
  const text = last.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
  return text ? text.slice(0, MAX_QUESTION_CHARS) : null;
}

/**
 * Model input built only from server-recorded turns plus the new question.
 * Client-sent history is ignored, so a visitor can't plant fake assistant turns (prefill attacks).
 */
function modelMessages(turns: Turn[], question: string): ModelMessage[] {
  return [
    ...turns.flatMap((t): ModelMessage[] => [
      { role: "user", content: t.question },
      { role: "assistant", content: t.answer },
    ]),
    { role: "user", content: question },
  ];
}

/** A fixed assistant message, sent without calling the model. */
function reply(text: string) {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "text-start", id: "notice" });
      writer.write({ type: "text-delta", id: "notice", delta: text });
      writer.write({ type: "text-end", id: "notice" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

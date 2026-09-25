import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { SYSTEM_PROMPT } from "./prompt";

// Chosen by the adversarial eval (evals/): 78/87 against 61/87 for Llama 3.3, with none of Llama's
// tool-use failures (empty answers, tool calls written out as text, drafts for questions it had answered).
export const MODEL = "@cf/qwen/qwen3.8-27b";
// Qwen reasons silently before answering by default: slow, and it can spend the whole output budget on it.
export const MODEL_SETTINGS = { chat_template_kwargs: { enable_thinking: false } };
export const MAX_QUESTION_CHARS = 2000;
// Bounds the input tokens every call pays for, alongside the whole Profile (ADR 0002).
export const HISTORY_TURNS = 10;

/**
 * The model's only tool, and it has no effect (ADR 0003): it just puts a draft Handoff on the page.
 * Sending takes the Visitor pressing Send, which calls a method the model can't reach.
 */
const draftHandoff = tool({
  description:
    "Offer the visitor a draft message to Nathan containing their question, which they can edit and choose to send. Use only when the question is about Nathan's career and the profile doesn't answer it.",
  inputSchema: z.object({ question: z.string().describe("The visitor's question, as they asked it") }),
  execute: async () => ({ drafted: true }),
});

export const OFFERED_HANDOFF = "The profile doesn't answer this, so I offered to send the question to Nathan.";

/** A completed exchange this server produced. The only history the model ever sees. */
export type Turn = { question: string; answer: string };

export type AnswerDeps = {
  /** False when this Conversation is asking too fast. */
  withinRateLimit: () => Promise<boolean>;
  /** Whether this Conversation's Visitor has passed Turnstile, checked on their first question (ADR 0005). */
  human: {
    verified: () => boolean;
    verify: (token: string | undefined) => Promise<boolean>;
    markVerified: () => void;
  };
  /** Claims one of today's model calls; false when none are left. */
  spendBudget: () => Promise<boolean>;
  /** The Conversation's recorded turns, oldest first. */
  history: { recent: (limit: number) => Turn[]; record: (turn: Turn) => void };
  model: LanguageModel;
};

/** What the chat client sent alongside the messages. */
export type AnswerRequest = { turnstileToken?: string; abortSignal?: AbortSignal };

/**
 * Answers the visitor's latest message: checks the rate limit, Turnstile, and daily budget, then streams the
 * model's answer and records it as a turn. Always returns a UI message stream the chat client can show.
 */
export async function answer(
  messages: UIMessage[],
  deps: AnswerDeps,
  { turnstileToken, abortSignal }: AnswerRequest = {},
): Promise<Response> {
  const question = latestQuestion(messages);
  if (!question) return reply("Please type a question about Nathan's career.");

  if (!(await deps.withinRateLimit())) {
    return reply("That's a lot of questions at once. Please wait a minute and try again.");
  }

  if (!deps.human.verified()) {
    if (!(await deps.human.verify(turnstileToken))) {
      return reply("Please complete the check next to the question box, then ask again.");
    }
    deps.human.markVerified();
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
    tools: { draftHandoff },
    // After drafting, the model gets one more step to write its answer; without it, a turn that opens with the
    // tool call ends with only a card. At most two model calls per question.
    stopWhen: stepCountIs(2),
    // One draft per question: the second step can only write text.
    prepareStep: ({ stepNumber }) => (stepNumber > 0 ? { activeTools: [] } : undefined),
    maxOutputTokens: 600,
    // One accepted question spends one Budget slot, so keep retries from multiplying the real calls behind it.
    maxRetries: 1,
    abortSignal,
    onFinish: ({ steps }) => {
      // `text` would be only the last step's, so join every step's. If the model offered a draft without writing
      // anything, record that, so history and Handoff emails still show the question. A truly empty answer would
      // be replayed as history, so skip it.
      const text = steps.map((s) => s.text.trim()).filter(Boolean).join("\n\n");
      const offered = steps.some((s) => s.toolCalls.some((c) => c.toolName === "draftHandoff"));
      const recorded = text || (offered ? OFFERED_HANDOFF : "");
      if (recorded) deps.history.record({ question, answer: recorded });
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

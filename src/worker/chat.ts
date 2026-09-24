import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { createUIMessageStream, createUIMessageStreamResponse, streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { latestQuestion, modelMessages, SYSTEM_PROMPT, type Turn } from "./prompt";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
// Counts attempts, not successful answers: a failed call can still cost tokens.
// About $2/day for short conversations, up to ~$6/day if every call carries 10 turns of history.
const DAILY_ANSWER_LIMIT = 1000;
// Keeps the prompt well inside Llama 3.3's 24k-token context alongside the Profile (ADR 0002).
const HISTORY_TURNS = 10;

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;

  onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS turns (question TEXT NOT NULL, answer TEXT NOT NULL)`;
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const question = latestQuestion(this.messages);
    if (!question) return reply("Please type a question about Nathan's career.");

    const { success } = await this.env.MESSAGE_LIMITER.limit({ key: this.name });
    if (!success) return reply("That's a lot of questions at once. Please wait a minute and try again.");

    if (!(await this.env.Budget.getByName("daily").spend(DAILY_ANSWER_LIMIT))) {
      console.warn("daily answer budget exhausted");
      return reply(
        "This assistant has answered all the questions it can for today. Please check back tomorrow, or email Nathan at nathan@nathanarthur.com.",
      );
    }

    const turns = this.sql<Turn>`
      SELECT question, answer FROM (SELECT rowid, question, answer FROM turns ORDER BY rowid DESC LIMIT ${HISTORY_TURNS})
      ORDER BY rowid`;
    const workersai = createWorkersAI({ binding: this.env.AI, gateway: { id: "natbot" } });

    const result = streamText({
      model: workersai(MODEL),
      system: SYSTEM_PROMPT,
      messages: modelMessages(turns, question),
      maxOutputTokens: 600,
      // One accepted question spends one Budget slot, so keep retries from multiplying the real calls behind it.
      maxRetries: 1,
      abortSignal: options?.abortSignal,
      onFinish: ({ text }) => {
        // An empty answer would be replayed as history on every later call.
        if (text.trim()) this.sql`INSERT INTO turns (question, answer) VALUES (${question}, ${text})`;
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

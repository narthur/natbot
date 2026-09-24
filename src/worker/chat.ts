import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { createWorkersAI } from "workers-ai-provider";
import { answer, type Turn } from "./answer";
import { verifyTurnstile } from "./turnstile";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
// Counts attempts, not successful answers: a failed call can still cost tokens.
// About $2/day for short conversations, up to ~$6/day if every call carries a full window of history (HISTORY_TURNS in answer.ts).
const DAILY_ANSWER_LIMIT = 1000;
// A Conversation is forgotten 30 days after its latest question (CONTEXT.md).
const FORGET_AFTER_SECONDS = 30 * 24 * 60 * 60;

/** Adapts one Conversation's Durable Object to the answer module. */
export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;

  async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS turns (question TEXT NOT NULL, answer TEXT NOT NULL)`;
    // Every Conversation gets a timer, including ones created before forgetting existed and ones that never
    // ask a question. Never extend an existing timer here: waking up isn't a new question.
    try {
      if (!(await this.forgetSchedules()).length) {
        await this.schedule(FORGET_AFTER_SECONDS, "forget", undefined, { idempotent: true });
      }
    } catch (error) {
      console.error("couldn't set a Conversation's forget timer on start", error);
    }
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    // A recovery replay after an interruption isn't a new question.
    if (!options?.continuation) await this.forgetLater();
    const token = options?.body?.turnstileToken;
    return answer(
      this.messages,
      {
        withinRateLimit: async () => (await this.env.MESSAGE_LIMITER.limit({ key: this.name })).success,
        human: {
          verified: () => this.ctx.storage.kv.get("human") === true,
          verify: (token) => verifyTurnstile(this.env.TURNSTILE_SECRET_KEY, token),
          markVerified: () => this.ctx.storage.kv.put("human", true),
        },
        spendBudget: () => this.env.Budget.getByName("daily").spend(DAILY_ANSWER_LIMIT),
        history: {
          recent: (limit) => this.sql<Turn>`
            SELECT question, answer FROM (SELECT rowid, question, answer FROM turns ORDER BY rowid DESC LIMIT ${limit})
            ORDER BY rowid`,
          record: ({ question, answer }) => this.sql`INSERT INTO turns (question, answer) VALUES (${question}, ${answer})`,
        },
        model: createWorkersAI({ binding: this.env.AI, gateway: { id: "natbot" } })(MODEL),
      },
      { turnstileToken: typeof token === "string" ? token : undefined, abortSignal: options?.abortSignal },
    );
  }

  /** Moves this Conversation's deletion to FORGET_AFTER_SECONDS from now. */
  private async forgetLater() {
    try {
      for (const s of await this.forgetSchedules()) await this.cancelSchedule(s.id);
      await this.schedule(FORGET_AFTER_SECONDS, "forget");
    } catch (error) {
      // Answering matters more than moving the deletion date; the old timer, if any, still stands.
      console.error("couldn't reschedule forgetting a Conversation", error);
    }
  }

  private async forgetSchedules() {
    return (await this.listSchedules()).filter((s) => s.callback === "forget");
  }

  /** Deletes everything in this Conversation: turns, persisted messages, the Turnstile pass, and its schedules. */
  async forget() {
    try {
      await this.destroy();
    } catch (error) {
      console.error("forgetting a Conversation failed", error);
      throw error;
    }
  }
}

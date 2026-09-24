import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { createWorkersAI } from "workers-ai-provider";
import { answer, type Turn } from "./answer";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
// Counts attempts, not successful answers: a failed call can still cost tokens.
// About $2/day for short conversations, up to ~$6/day if every call carries a full window of history (HISTORY_TURNS in answer.ts).
const DAILY_ANSWER_LIMIT = 1000;

/** Adapts one Conversation's Durable Object to the answer module. */
export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;

  onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS turns (question TEXT NOT NULL, answer TEXT NOT NULL)`;
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    return answer(
      this.messages,
      {
        withinRateLimit: async () => (await this.env.MESSAGE_LIMITER.limit({ key: this.name })).success,
        spendBudget: () => this.env.Budget.getByName("daily").spend(DAILY_ANSWER_LIMIT),
        history: {
          recent: (limit) => this.sql<Turn>`
            SELECT question, answer FROM (SELECT rowid, question, answer FROM turns ORDER BY rowid DESC LIMIT ${limit})
            ORDER BY rowid`,
          record: ({ question, answer }) => this.sql`INSERT INTO turns (question, answer) VALUES (${question}, ${answer})`,
        },
        model: createWorkersAI({ binding: this.env.AI, gateway: { id: "natbot" } })(MODEL),
      },
      options?.abortSignal,
    );
  }
}

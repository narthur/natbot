import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { instrumentAgentWithSentry, setTag } from "@sentry/cloudflare";
import { callable } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import { type AnswerDeps, answer, MODEL, MODEL_SETTINGS, type Turn } from "./answer";
import { type Claims, DAILY_HANDOFF_LIMIT, sendHandoff } from "./handoff";
import { isSafe } from "./moderate";
import { sentryOptions } from "./sentry";
import { verifyTurnstile } from "./turnstile";
import { EMBEDDING_MODEL, searchWriting, vectorizeNearest } from "./writing";

// Counts attempts, not successful answers: a failed call can still cost tokens.
// About $0.003 per model call with a short history (roughly 5k input tokens, mostly the Profile). A question that
// searches Nathan's writing or drafts a Handoff takes up to MAX_STEPS calls (answer.ts), so at most ~$3-9/day; a
// search's embedding and Vectorize query add a small fraction of a call.
const DAILY_ANSWER_LIMIT = 1000;
// A Conversation is forgotten 30 days after its latest question (CONTEXT.md).
const FORGET_AFTER_SECONDS = 30 * 24 * 60 * 60;

/**
 * Synced to the page. Only the server writes it. The page uses it to stop asking for Turnstile and to show which
 * Handoffs were sent. `sentHandoffs` is missing on Conversations from before Handoffs existed.
 */
export type ChatState = { verified: boolean; sentHandoffs?: string[] };

/** Adapts one Conversation's Durable Object to the answer module. */
class ChatAgent extends AIChatAgent<Env, ChatState> {
  maxPersistedMessages = 100;
  initialState: ChatState = { verified: false, sentHandoffs: [] };

  async onStart() {
    setTag("conversation", this.name);
    this.sql`CREATE TABLE IF NOT EXISTS turns (question TEXT NOT NULL, answer TEXT NOT NULL)`;
    // Conversations that passed before the page could see it.
    if (this.passedTurnstile() && !this.state.verified) this.setState({ ...this.state, verified: true });
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
    setTag("conversation", this.name);
    // A recovery replay after an interruption isn't a new question.
    if (!options?.continuation) await this.forgetLater();
    const token = options?.body?.turnstileToken;
    return answer(
      this.messages,
      {
        withinRateLimit: async () => (await this.env.MESSAGE_LIMITER.limit({ key: this.name })).success,
        human: this.human(),
        spendBudget: () => this.env.Budget.getByName("daily").spend(DAILY_ANSWER_LIMIT),
        history: {
          recent: (limit) => this.recentTurns(limit),
          record: ({ question, answer }) => this.sql`INSERT INTO turns (question, answer) VALUES (${question}, ${answer})`,
        },
        searchWriting: (query) => this.searchWriting(query),
        model: this.workersAI()(MODEL, MODEL_SETTINGS),
      },
      { turnstileToken: typeof token === "string" ? token : undefined, abortSignal: options?.abortSignal },
    );
  }

  /** Called by the page when the Visitor presses Send on a Handoff. The model has no way to call it (ADR 0003). */
  @callable()
  async sendHandoff(request: unknown) {
    setTag("conversation", this.name);
    return sendHandoff(request, {
      human: this.human(),
      claims: () => this.ctx.storage.kv.get<Claims>("handoffs") ?? {},
      setClaims: (claims) => this.ctx.storage.kv.put("handoffs", claims),
      confirm: (id) => this.setState({ ...this.state, sentHandoffs: [...(this.state.sentHandoffs ?? []), id] }),
      spendDaily: () => this.env.Budget.getByName("handoffs").spend(DAILY_HANDOFF_LIMIT),
      isSafe: (text) => isSafe(this.env.AI, text),
      recentTurns: (limit) => this.recentTurns(limit),
      start: async (params) => {
        await this.env.HANDOFF_WORKFLOW.create({ params });
      },
      conversation: this.name,
      now: () => new Date(),
    });
  }

  private workersAI() {
    return createWorkersAI({ binding: this.env.AI, gateway: { id: "natbot" } });
  }

  private searchWriting(query: string) {
    return searchWriting(query, this.workersAI().textEmbedding(EMBEDDING_MODEL), vectorizeNearest(this.env.WRITING));
  }

  private human(): AnswerDeps["human"] {
    return {
      verified: () => this.passedTurnstile(),
      verify: (token) => verifyTurnstile(this.env.TURNSTILE_SECRET_KEY, token),
      markVerified: () => {
        this.ctx.storage.kv.put("human", true);
        this.setState({ ...this.state, verified: true });
      },
    };
  }

  private recentTurns(limit: number) {
    return this.sql<Turn>`
      SELECT question, answer FROM (SELECT rowid, question, answer FROM turns ORDER BY rowid DESC LIMIT ${limit})
      ORDER BY rowid`;
  }

  // The gates read KV, never the synced state, so a bug in state syncing can only affect the page.
  private passedTurnstile() {
    return this.ctx.storage.kv.get("human") === true;
  }

  validateStateChange(_next: ChatState, source: unknown) {
    if (source !== "server") throw new Error("Conversation state is written by the server only");
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

  /**
   * Called by the page when the Visitor starts over: forgets this Conversation now instead of 30 days from now.
   * Scheduled rather than run here, because destroy() ends the Durable Object before this call could reply.
   */
  @callable()
  async startOver() {
    setTag("conversation", this.name);
    await this.schedule(0, "forget");
  }

  /** Deletes everything in this Conversation: turns, persisted messages, the Turnstile pass, Handoff ids, and its schedules. */
  async forget() {
    setTag("conversation", this.name);
    try {
      await this.destroy();
    } catch (error) {
      console.error("forgetting a Conversation failed", error);
      throw error;
    }
  }
}

// Errors in the Conversation's handlers, callables and scheduled callbacks reach Sentry (issue #16).
// The class keeps its name: the agents SDK and Sentry label logs and spans with it.
const InstrumentedChatAgent = instrumentAgentWithSentry(sentryOptions, ChatAgent);
export { InstrumentedChatAgent as ChatAgent };
export type { ChatAgent as ChatAgentClass };

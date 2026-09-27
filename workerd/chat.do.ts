import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, test, vi } from "vitest";
import type { Turn } from "../src/worker/answer";

// 30 days, mirroring FORGET_AFTER_SECONDS in ../src/worker/chat.ts (not exported).
const FORGET_AFTER_SECONDS = 30 * 24 * 60 * 60;

/**
 * The private surface of `ChatAgent` (../src/worker/chat.ts) this suite pokes directly via
 * `runInDurableObject`. TypeScript's `private` is compile-time only, so a cast through this type is the normal
 * way to reach it from a Durable Object test without changing the adapter's public API.
 */
type ChatAgentInternals = {
  onStart(): Promise<void>;
  forget(): Promise<void>;
  recentTurns(limit: number): Turn[];
  sql<T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: (string | number | boolean | null)[]): T[];
  listSchedules(): Promise<{ id: string; callback: string; time: number }[]>;
  schedule(delaySeconds: number, callback: string): Promise<unknown>;
  cancelSchedule(id: string): Promise<boolean>;
};

let counter = 0;
/** A fresh Conversation name per test; @cloudflare/vitest-pool-workers isolates storage per test regardless, but
 * distinct names make failures easier to attribute. */
function conversationName() {
  return `chat-do-test-${++counter}`;
}

/**
 * Records a turn the same way `onChatMessage`'s `history.record` does in chat.ts — that closure is defined
 * inline and isn't exported, so this issues the identical INSERT against the Durable Object's real SQLite
 * storage rather than re-testing through the full `answer()` pipeline (already covered by
 * src/worker/answer.test.ts in plain Node).
 */
function record(chat: ChatAgentInternals, turn: Turn) {
  chat.sql`INSERT INTO turns (question, answer) VALUES (${turn.question}, ${turn.answer})`;
}

test("onStart creates the turns table with question and answer columns", async () => {
  const stub = env.ChatAgent.getByName(conversationName());
  await runInDurableObject(stub, async (instance) => {
    const chat = instance as unknown as ChatAgentInternals;
    await chat.onStart();
    record(chat, { question: "q1", answer: "a1" });
    expect(chat.sql<Turn>`SELECT question, answer FROM turns`).toEqual([{ question: "q1", answer: "a1" }]);
  });
});

test("a recorded turn comes back from recentTurns", async () => {
  const stub = env.ChatAgent.getByName(conversationName());
  await runInDurableObject(stub, async (instance) => {
    const chat = instance as unknown as ChatAgentInternals;
    await chat.onStart();
    record(chat, { question: "What did he build?", answer: "TaskRatchet." });
    expect(chat.recentTurns(10)).toEqual([{ question: "What did he build?", answer: "TaskRatchet." }]);
  });
});

test("recentTurns windows to the last N turns, oldest first", async () => {
  const stub = env.ChatAgent.getByName(conversationName());
  await runInDurableObject(stub, async (instance) => {
    const chat = instance as unknown as ChatAgentInternals;
    await chat.onStart();
    for (let i = 1; i <= 5; i++) record(chat, { question: `q${i}`, answer: `a${i}` });
    // 5 recorded, windowed to the last 3: the oldest 2 (q1, q2) are dropped, the rest come back oldest first.
    expect(chat.recentTurns(3)).toEqual([
      { question: "q3", answer: "a3" },
      { question: "q4", answer: "a4" },
      { question: "q5", answer: "a5" },
    ]);
  });
});

test("recentTurns returns everything when fewer than N turns are recorded", async () => {
  const stub = env.ChatAgent.getByName(conversationName());
  await runInDurableObject(stub, async (instance) => {
    const chat = instance as unknown as ChatAgentInternals;
    await chat.onStart();
    record(chat, { question: "q1", answer: "a1" });
    record(chat, { question: "q2", answer: "a2" });
    expect(chat.recentTurns(10)).toEqual([
      { question: "q1", answer: "a1" },
      { question: "q2", answer: "a2" },
    ]);
  });
});

test("onStart schedules forget roughly FORGET_AFTER_SECONDS out", async () => {
  const stub = env.ChatAgent.getByName(conversationName());
  await runInDurableObject(stub, async (instance) => {
    const chat = instance as unknown as ChatAgentInternals;
    const before = Date.now() / 1000;
    await chat.onStart();
    const forgets = (await chat.listSchedules()).filter((s) => s.callback === "forget");
    expect(forgets).toHaveLength(1);
    expect(forgets[0].time).toBeGreaterThanOrEqual(before + FORGET_AFTER_SECONDS - 5);
    expect(forgets[0].time).toBeLessThanOrEqual(before + FORGET_AFTER_SECONDS + 5);
  });
});

test("onStart never arms a second forget schedule", async () => {
  const stub = env.ChatAgent.getByName(conversationName());
  await runInDurableObject(stub, async (instance) => {
    const chat = instance as unknown as ChatAgentInternals;
    await chat.onStart();
    await chat.onStart();
    const forgets = (await chat.listSchedules()).filter((s) => s.callback === "forget");
    expect(forgets).toHaveLength(1);
  });
});

test("forget() destroys the Conversation: further calls on the same id are refused", async () => {
  const name = conversationName();
  const stub = env.ChatAgent.getByName(name);
  await runInDurableObject(stub, async (instance) => {
    const chat = instance as unknown as ChatAgentInternals;
    await chat.onStart();
    record(chat, { question: "q", answer: "a" });
    expect(chat.recentTurns(10)).toHaveLength(1);
    await chat.forget();
  });

  // destroy() ends the Durable Object for good (agents/dist: "drop tables, delete alarm, delete all storage,
  // dispose connections"); its id refuses further work rather than quietly starting over.
  await expect(runInDurableObject(stub, async () => {})).rejects.toThrow("destroyed");
});

test("the forget schedule firing destroys the Conversation the same way", async () => {
  const name = conversationName();
  const stub = env.ChatAgent.getByName(name);
  await runInDurableObject(stub, async (instance) => {
    const chat = instance as unknown as ChatAgentInternals;
    await chat.onStart();
    record(chat, { question: "q", answer: "a" });
    // Move the 30-day forget schedule onStart armed up to fire soon, the same way forgetLater() moves it
    // earlier (cancel, then reschedule) — so the alarm can be run without waiting 30 days for real.
    for (const s of (await chat.listSchedules()).filter((s) => s.callback === "forget")) {
      await chat.cancelSchedule(s.id);
    }
    await chat.schedule(60, "forget");
  });

  // Fast-forward past the schedule's due time, then let the alarm actually run it (agents' job queue only
  // dispatches a callback once its time has passed, so runDurableObjectAlarm() alone isn't enough).
  vi.setSystemTime(Date.now() + 61_000);
  try {
    const fired = await runDurableObjectAlarm(stub);
    expect(fired).toBe(true);
    await expect(runInDurableObject(stub, async () => {})).rejects.toThrow("destroyed");
  } finally {
    vi.useRealTimers();
  }
});

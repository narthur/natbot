import { expect, test, vi } from "vitest";
import type { Turn } from "./answer";
import { DAILY_HANDOFF_LIMIT, HANDOFF_TURNS, type HandoffDeps, HANDOFFS_PER_CONVERSATION, sendHandoff } from "./handoff";

const request = { id: "h1", message: "  Has he used Kafka?  ", email: "recruiter@example.com", turnstileToken: "tok" };
const turns: Turn[] = [{ question: "q", answer: "a" }];

/** A verified Conversation with nothing sent, a daily budget left, and a safe message. Override any part. */
function setup(overrides: Partial<HandoffDeps> = {}) {
  const sent: string[] = [];
  const deps: HandoffDeps = {
    human: { verified: () => true, verify: vi.fn(async () => true), markVerified: vi.fn() },
    sent: () => sent,
    markSent: (id) => sent.push(id),
    spendDaily: vi.fn(async () => true),
    isSafe: vi.fn(async () => true),
    recentTurns: vi.fn(() => turns),
    start: vi.fn(async () => {}),
    conversation: "c1",
    now: () => new Date("2026-09-24T12:00:00Z"),
    ...overrides,
  };
  return { deps, sent };
}

test("a valid Handoff starts the Workflow with the trimmed message and recent turns", async () => {
  const { deps, sent } = setup();
  expect(await sendHandoff(request, deps)).toEqual({ sent: true });
  expect(deps.start).toHaveBeenCalledWith({
    conversation: "c1",
    message: "Has he used Kafka?",
    email: "recruiter@example.com",
    turns,
    sentAt: "2026-09-24T12:00:00.000Z",
  });
  expect(deps.recentTurns).toHaveBeenCalledWith(HANDOFF_TURNS);
  expect(sent).toEqual(["h1"]);
  expect(DAILY_HANDOFF_LIMIT).toBe(20);
});

test("invalid fields are refused before anything is spent", async () => {
  for (const bad of [
    null,
    { ...request, id: "" },
    { ...request, message: "   " },
    { ...request, message: "x".repeat(2001) },
    { ...request, email: "not an email" },
    { ...request, email: "a@b.com\r\nBcc: victim@example.com" },
    { ...request, email: "a@b.com, c@d.com" },
    { ...request, email: 42 },
  ]) {
    const { deps } = setup();
    expect(await sendHandoff(bad, deps)).toMatchObject({ sent: false });
    expect(deps.spendDaily).not.toHaveBeenCalled();
    expect(deps.start).not.toHaveBeenCalled();
  }
});

test("resending the same Handoff doesn't send it twice", async () => {
  const { deps } = setup();
  await sendHandoff(request, deps);
  expect(await sendHandoff(request, deps)).toEqual({ sent: true });
  expect(deps.start).toHaveBeenCalledTimes(1);
});

test(`a Conversation can send at most ${HANDOFFS_PER_CONVERSATION} Handoffs`, async () => {
  const { deps } = setup();
  for (const id of ["a", "b", "c"]) expect(await sendHandoff({ ...request, id }, deps)).toEqual({ sent: true });
  expect(await sendHandoff({ ...request, id: "d" }, deps)).toMatchObject({ sent: false });
  expect(deps.spendDaily).toHaveBeenCalledTimes(3);
});

test("an unverified Conversation needs a passing Turnstile token, before any budget is spent", async () => {
  const human = { verified: () => false, verify: vi.fn(async () => false), markVerified: vi.fn() };
  const { deps } = setup({ human });
  expect(await sendHandoff(request, deps)).toMatchObject({ sent: false, reason: expect.stringContaining("check") });
  expect(human.verify).toHaveBeenCalledWith("tok");
  expect(deps.spendDaily).not.toHaveBeenCalled();

  human.verify.mockResolvedValue(true);
  expect(await sendHandoff(request, deps)).toEqual({ sent: true });
  expect(human.markVerified).toHaveBeenCalled();
});

test("the daily limit stops Handoffs before moderation runs", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const { deps } = setup({ spendDaily: vi.fn(async () => false) });
  expect(await sendHandoff(request, deps)).toMatchObject({ sent: false, reason: expect.stringContaining("today") });
  expect(deps.isSafe).not.toHaveBeenCalled();
  expect(deps.start).not.toHaveBeenCalled();
});

test("an unsafe message is blocked; a moderation outage lets it through", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const blocked = setup({ isSafe: vi.fn(async () => false) });
  expect(await sendHandoff(request, blocked.deps)).toEqual({ sent: false, reason: "This message can't be sent." });
  expect(blocked.deps.start).not.toHaveBeenCalled();
  expect(blocked.sent).toEqual([]);

  const outage = setup({ isSafe: vi.fn(async () => Promise.reject(new Error("AI down"))) });
  expect(await sendHandoff(request, outage.deps)).toEqual({ sent: true });
  expect(console.error).toHaveBeenCalledWith("handoff moderation failed; sending anyway", expect.any(Error));
});

test("a Workflow that won't start isn't recorded as sent", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { deps, sent } = setup({ start: vi.fn(async () => Promise.reject(new Error("no"))) });
  expect(await sendHandoff(request, deps)).toMatchObject({ sent: false });
  expect(sent).toEqual([]);
});

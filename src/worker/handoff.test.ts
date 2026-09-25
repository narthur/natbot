import { expect, test, vi } from "vitest";
import type { Turn } from "./answer";
import {
  type Claims,
  DAILY_HANDOFF_LIMIT,
  HANDOFF_TURNS,
  type HandoffDeps,
  HANDOFFS_PER_CONVERSATION,
  STALE_CLAIM_MS,
  sendHandoff,
} from "./handoff";

const request = { id: "h1", message: "  Has he used Kafka?  ", email: "recruiter@example.com", turnstileToken: "tok" };
const turns: Turn[] = [{ question: "q", answer: "a" }];

/** A verified Conversation with nothing sent, a daily budget left, and a safe message. Override any part. */
function setup(overrides: Partial<HandoffDeps> = {}, initial: Claims = {}) {
  let claims = initial;
  const sent: string[] = [];
  const deps: HandoffDeps = {
    human: { verified: () => true, verify: vi.fn(async () => true), markVerified: vi.fn() },
    claims: () => claims,
    setClaims: (next) => {
      claims = next;
    },
    confirm: (id) => sent.push(id),
    spendDaily: vi.fn(async () => true),
    isSafe: vi.fn(async () => true),
    recentTurns: vi.fn(() => turns),
    start: vi.fn(async () => {}),
    conversation: "c1",
    now: () => new Date("2026-09-24T12:00:00Z"),
    ...overrides,
  };
  return { deps, sent, claimed: () => Object.keys(claims) };
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
  expect(deps.isSafe).toHaveBeenCalledWith("Has he used Kafka?");
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
  expect(blocked.claimed()).toEqual([]);

  const outage = setup({ isSafe: vi.fn(async () => Promise.reject(new Error("AI down"))) });
  expect(await sendHandoff(request, outage.deps)).toEqual({ sent: true });
  expect(console.error).toHaveBeenCalledWith("handoff moderation failed; sending anyway", expect.any(Error));
});

test("a Workflow that won't start isn't recorded as sent", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { deps, sent, claimed } = setup({ start: vi.fn(async () => Promise.reject(new Error("no"))) });
  expect(await sendHandoff(request, deps)).toMatchObject({ sent: false });
  expect(sent).toEqual([]);
  expect(claimed()).toEqual([]);
});

test("an email address pasted with spaces around it is accepted, trimmed", async () => {
  const { deps } = setup();
  expect(await sendHandoff({ ...request, email: "  recruiter@example.com\n" }, deps)).toEqual({ sent: true });
  expect(deps.start).toHaveBeenCalledWith(expect.objectContaining({ email: "recruiter@example.com" }));
});

test("concurrent sends can't double-send or pass the cap while earlier sends are still in flight", async () => {
  // Moderation stays pending until released, so every send is mid-flight at once.
  let release = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const { deps } = setup({ isSafe: vi.fn(() => gate.then(() => true)) });
  const sends = ["a", "a", "b", "c", "d"].map((id) => sendHandoff({ ...request, id }, deps));
  release();
  const results = await Promise.all(sends);
  expect(deps.start).toHaveBeenCalledTimes(3);
  expect(results.map((r) => (r.sent ? "sent" : r.reason))).toEqual([
    "sent",
    "That message is still sending.",
    "sent",
    "sent",
    expect.stringContaining("several messages"),
  ]);
});

test("a claim abandoned mid-send stops counting after a while, and can be retried", async () => {
  const abandoned = { sent: false, at: new Date("2026-09-24T12:00:00Z").getTime() - STALE_CLAIM_MS };
  const { deps } = setup({}, { h1: abandoned, x: abandoned, y: abandoned });
  expect(await sendHandoff(request, deps)).toEqual({ sent: true });
  expect(deps.start).toHaveBeenCalledTimes(1);
});

test("an unexpected throw releases the claim instead of stranding the card", async () => {
  const human = {
    verified: () => false,
    verify: vi.fn(async () => true),
    markVerified: () => {
      throw new Error("storage error");
    },
  };
  const { deps, claimed } = setup({ human });
  await expect(sendHandoff(request, deps)).rejects.toThrow("storage error");
  expect(claimed()).toEqual([]);
});

test("a failing daily-limit check refuses the send and frees the slot", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { deps, claimed } = setup({ spendDaily: vi.fn(async () => Promise.reject(new Error("DO down"))) });
  expect(await sendHandoff(request, deps)).toMatchObject({ sent: false });
  expect(console.error).toHaveBeenCalledWith("handoff daily limit check failed", expect.any(Error));
  expect(claimed()).toEqual([]);
});

test("once the Workflow has started, a later failure never frees the claim for a second email", async () => {
  const { deps, claimed } = setup({
    confirm: () => {
      throw new Error("setState failed");
    },
  });
  await expect(sendHandoff(request, deps)).rejects.toThrow("setState failed");
  expect(claimed()).toEqual(["h1"]);
  expect(await sendHandoff(request, deps)).toEqual({ sent: true });
  expect(deps.start).toHaveBeenCalledTimes(1);
});

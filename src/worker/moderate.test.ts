import { expect, test, vi } from "vitest";
import { isSafe } from "./moderate";

const ai = (response: unknown) => ({ run: vi.fn(async () => ({ response })) }) as unknown as Ai;

test("reads Llama Guard's JSON and plain-text verdicts", async () => {
  expect(await isSafe(ai({ safe: true }), "hi")).toBe(true);
  expect(await isSafe(ai({ safe: false, categories: ["S10"] }), "hi")).toBe(false);
  expect(await isSafe(ai("safe"), "hi")).toBe(true);
  expect(await isSafe(ai("unsafe\nS1"), "hi")).toBe(false);
});

test("an unreadable verdict throws instead of guessing", async () => {
  // The output can quote the Handoff, and the error goes to Sentry, so the error carries none of it.
  await expect(isSafe(ai("maybe: I'll quote the visitor"), "hi")).rejects.toThrow(/^unreadable llama guard output \(string\)$/);
  await expect(isSafe(ai({}), "hi")).rejects.toThrow("unreadable");
});

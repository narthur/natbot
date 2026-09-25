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
  await expect(isSafe(ai("maybe"), "hi")).rejects.toThrow("unreadable");
  await expect(isSafe(ai({}), "hi")).rejects.toThrow("unreadable");
});

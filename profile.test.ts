import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// ADR 0002: the whole Profile goes in every prompt, so its size is the main cost of every answer.
// ponytail: ~4 characters per token for English prose; use the real tokenizer if the Profile nears the limit.
const TOKEN_BUDGET = 10_000;

test("the Profile fits its token budget", () => {
  const profile = readFileSync(new URL("./profile.md", import.meta.url), "utf8");
  expect(profile.length / 4).toBeLessThanOrEqual(TOKEN_BUDGET);
});

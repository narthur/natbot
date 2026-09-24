import { expect, test } from "vitest";
import { SYSTEM_PROMPT } from "./prompt";

test("the system prompt carries the whole Profile", () => {
  expect(SYSTEM_PROMPT).toContain("# Nathan Arthur — Profile");
});

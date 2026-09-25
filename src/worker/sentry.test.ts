import type { ErrorEvent } from "@sentry/cloudflare";
import { expect, test } from "vitest";
import { scrub } from "./sentry";

test("drops extra data and request bodies, where Visitor text can hide", () => {
  const event = scrub({
    type: undefined,
    message: "chat stream error",
    extra: { arguments: ["chat stream error", { requestBodyValues: { messages: "What is Nathan's salary?" } }] },
    request: { url: "https://ask.nathanarthur.com/agents/chat-agent/x", data: "visitor@example.com", cookies: { a: "b" } },
  } as ErrorEvent);
  expect(JSON.stringify(event)).not.toMatch(/salary|visitor@example\.com/);
  expect(event.message).toBe("chat stream error");
  expect(event.request?.url).toBe("https://ask.nathanarthur.com/agents/chat-agent/x");
});

test("redacts AI SDK error messages, which can quote the model's input, and keeps the rest", () => {
  const event = scrub({
    type: undefined,
    exception: {
      values: [
        { type: "AI_InvalidToolInputError", value: 'Invalid input for tool draftHandoff: {"question":"secret"}' },
        { type: "Error", value: "mailgun 500: server error" },
      ],
    },
  } as ErrorEvent);
  expect(event.exception?.values).toEqual([
    { type: "AI_InvalidToolInputError", value: "[redacted]" },
    { type: "Error", value: "mailgun 500: server error" },
  ]);
});

import type { ErrorEvent } from "@sentry/cloudflare";
import { expect, test } from "vitest";
import { scrub } from "./sentry";

test("drops extra data and request bodies, where Visitor text can hide", () => {
  // The shape console.error("chat stream error", error) produces: the exception comes from the error, and both
  // arguments, including the AI SDK error's request body, land in extra.
  const event = scrub({
    type: undefined,
    exception: { values: [{ type: "Error", value: "Conversation state is written by the server only" }] },
    extra: { arguments: ["chat stream error", { requestBodyValues: { messages: "What is Nathan's salary?" } }] },
    request: { url: "https://ask.nathanarthur.com/agents/chat-agent/x", data: "visitor@example.com", cookies: { a: "b" } },
  } as ErrorEvent);
  expect(JSON.stringify(event)).not.toMatch(/salary|visitor@example\.com/);
  expect(event.exception?.values?.[0]?.value).toBe("Conversation state is written by the server only");
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

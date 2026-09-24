import { expect, test } from "vitest";
import { CONVERSATION_PATH } from "./conversation-path";

const id = "0f8fad5b-d9cb-469f-a165-70867728950e";

test("only chat-agent paths named by a lowercase UUID reach a Durable Object", () => {
  expect(CONVERSATION_PATH.test(`/agents/chat-agent/${id}`)).toBe(true);
  expect(CONVERSATION_PATH.test(`/agents/chat-agent/${id}/get-messages`)).toBe(true);

  expect(CONVERSATION_PATH.test("/agents/chat-agent/")).toBe(false);
  expect(CONVERSATION_PATH.test("/agents/chat-agent/nathan")).toBe(false);
  expect(CONVERSATION_PATH.test(`/agents/chat-agent/${id.toUpperCase()}`)).toBe(false);
  expect(CONVERSATION_PATH.test(`/agents/chat-agent/${id}extra`)).toBe(false);
  expect(CONVERSATION_PATH.test(`/agents/budget/${id}`)).toBe(false);
});

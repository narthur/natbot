// Conversation names are browser-generated UUIDs, so one visitor can't guess another's conversation.
export const CONVERSATION_PATH =
  /^\/agents\/chat-agent\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/|$)/;

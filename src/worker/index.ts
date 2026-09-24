import { routeAgentRequest } from "agents";

export { Budget } from "./budget";
export { ChatAgent } from "./chat";

// Conversation names are browser-generated UUIDs, so one visitor can't guess another's conversation.
const CONVERSATION_PATH = /^\/agents\/chat-agent\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/|$)/;

export default {
  async fetch(request, env) {
    if (!CONVERSATION_PATH.test(new URL(request.url).pathname)) {
      return new Response("Not found", { status: 404 });
    }
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    if (!(await env.CONNECT_LIMITER.limit({ key: ip })).success) {
      return new Response("Too many requests", { status: 429 });
    }
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

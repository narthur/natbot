import { routeAgentRequest } from "agents";
import { CONVERSATION_PATH } from "./conversation-path";

export { Budget } from "./budget";
export { ChatAgent } from "./chat";
export { HandoffWorkflow } from "./workflow";

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

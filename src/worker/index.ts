import { withSentry } from "@sentry/cloudflare";
import { routeAgentRequest } from "agents";
import { CONVERSATION_PATH } from "./conversation-path";
import { sentryOptions } from "./sentry";

export { Budget } from "./budget";
export { ChatAgent } from "./chat";
export { HandoffWorkflow } from "./workflow";
export { WritingIndexWorkflow } from "./writing-index";

export default withSentry(sentryOptions, {
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
  async scheduled(_controller, env) {
    await env.INDEX_WORKFLOW.create();
  },
} satisfies ExportedHandler<Env>);

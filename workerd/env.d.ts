import type { Budget } from "../src/worker/budget";
import type { ChatAgentClass } from "../src/worker/chat";

/** Only the bindings wrangler.test.jsonc declares (see there for why it's not the full app Env). */
interface WorkerdTestEnv {
  ChatAgent: DurableObjectNamespace<ChatAgentClass>;
  Budget: DurableObjectNamespace<Budget>;
}

declare module "cloudflare:test" {
  interface ProvidedEnv extends WorkerdTestEnv {}
}

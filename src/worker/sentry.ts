import { captureConsoleIntegration, type ErrorEvent } from "@sentry/cloudflare";

/**
 * Sentry options shared by the fetch handler, ChatAgent and HandoffWorkflow (issue #16). Every `console.error`
 * becomes an event, so the existing failure logs are the reporting points.
 *
 * Conversations hold Visitor text and email addresses, which must not reach Sentry. Breadcrumbs are dropped
 * entirely: the Agent instrumentation and console capture both add them, and they can carry anything. Events
 * lose `extra` (console capture puts every logged argument there, and the AI SDK's errors carry the prompt) and
 * any request body. The Conversation ID, a random UUID, is enough to trace an event.
 */
export const sentryOptions = (env: Env) => ({
  dsn: env.SENTRY_DSN,
  // `pnpm dev` runs with the production vars; its errors would only be noise.
  enabled: !import.meta.env.DEV,
  // Sentry collects all of these by default. Headers, bodies, AI inputs and outputs, and stack-frame locals can
  // all hold a Visitor's text or email address.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    stackFrameVariables: false,
  },
  integrations: [captureConsoleIntegration({ levels: ["error"] })],
  beforeBreadcrumb: () => null,
  beforeSend: scrub,
});

/** AI SDK errors (`AI_InvalidToolInputError` and friends) can quote the model's input, so keep only their type. */
export function scrub(event: ErrorEvent): ErrorEvent {
  return {
    ...event,
    extra: undefined,
    request: event.request && { ...event.request, data: undefined, cookies: undefined },
    exception: event.exception && {
      ...event.exception,
      values: event.exception.values?.map((e) => (e.type?.startsWith("AI_") ? { ...e, value: "[redacted]" } : e)),
    },
  };
}

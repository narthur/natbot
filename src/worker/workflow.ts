import { instrumentWorkflowWithSentry, setTag } from "@sentry/cloudflare";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { HandoffParams } from "./handoff";
import { handoffEmail, sendMail } from "./mail";
import { sentryOptions } from "./sentry";

/** Delivers one Handoff to Nathan, retrying through Mailgun outages. The instance keeps the Handoff either way. */
class HandoffWorkflow extends WorkflowEntrypoint<Env, HandoffParams> {
  async run(event: WorkflowEvent<HandoffParams>, step: WorkflowStep) {
    setTag("conversation", event.payload.conversation);
    try {
      await step.do(
        "email Nathan",
        { retries: { limit: 5, delay: "1 minute", backoff: "exponential" }, timeout: "30 seconds" },
        () => sendMail(this.env.MAILGUN_API_KEY, handoffEmail(event.payload, this.env.HANDOFF_TO)),
      );
    } catch (error) {
      console.error("handoff email failed after retries", error);
      throw error;
    }
  }
}

// A Handoff that fails for good must reach Nathan some other way (issue #16).
const InstrumentedHandoffWorkflow = instrumentWorkflowWithSentry(sentryOptions, HandoffWorkflow);
export { InstrumentedHandoffWorkflow as HandoffWorkflow };

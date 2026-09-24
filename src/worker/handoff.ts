import type { AnswerDeps, Turn } from "./answer";

export const MAX_HANDOFF_CHARS = 2000;
export const HANDOFFS_PER_CONVERSATION = 3;
export const DAILY_HANDOFF_LIMIT = 20;
export const HANDOFF_TURNS = 5;
// One plain address: no whitespace or header punctuation, so it's safe as a Reply-To value.
const EMAIL = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]+$/;

/** What a Handoff email carries into the Workflow. */
export type HandoffParams = { conversation: string; message: string; email: string; turns: Turn[]; sentAt: string };

export type HandoffResult = { sent: true } | { sent: false; reason: string };

export type HandoffDeps = {
  human: AnswerDeps["human"];
  /** Handoff ids this Conversation has sent. */
  sent: () => string[];
  markSent: (id: string) => void;
  /** Claims one of today's Handoff emails; false when none are left. */
  spendDaily: () => Promise<boolean>;
  /** Llama Guard's verdict; throws when it can't give one. */
  isSafe: (text: string) => Promise<boolean>;
  recentTurns: (limit: number) => Turn[];
  /** Starts the Workflow that emails Nathan. */
  start: (params: HandoffParams) => Promise<void>;
  conversation: string;
  now: () => Date;
};

const refuse = (reason: string): HandoffResult => ({ sent: false, reason });

/**
 * Sends a Handoff the Visitor wrote and pressed Send on (ADR 0003: the model can't reach this).
 * Checks run cheapest and most certain first; only then does the Workflow start.
 */
export async function sendHandoff(request: unknown, deps: HandoffDeps): Promise<HandoffResult> {
  const { id, message, email, turnstileToken } = (request ?? {}) as Record<string, unknown>;
  const text = typeof message === "string" ? message.trim() : "";
  if (typeof id !== "string" || id.length === 0 || id.length > 100) return refuse("Something went wrong. Please reload.");
  if (!text) return refuse("Please write a message.");
  if (text.length > MAX_HANDOFF_CHARS) return refuse(`Please keep the message under ${MAX_HANDOFF_CHARS} characters.`);
  if (typeof email !== "string" || email.length > 254 || !EMAIL.test(email)) {
    return refuse("Please enter one valid email address.");
  }

  const sent = deps.sent();
  if (sent.includes(id)) return { sent: true };
  if (sent.length >= HANDOFFS_PER_CONVERSATION) {
    return refuse("This conversation has already sent Nathan several messages. Please email him directly.");
  }

  if (!deps.human.verified()) {
    if (!(await deps.human.verify(typeof turnstileToken === "string" ? turnstileToken : undefined))) {
      return refuse("Please complete the check, then send again.");
    }
    deps.human.markVerified();
  }

  if (!(await deps.spendDaily())) {
    console.warn("daily handoff limit reached");
    return refuse("Nathan has received all the messages he can today. Please email him at nathan@nathanarthur.com.");
  }

  // Moderation failing open is deliberate: Nathan reads every Handoff, so he's the last filter anyway.
  const safe = await deps.isSafe(text).catch((error) => {
    console.error("handoff moderation failed; sending anyway", error);
    return true;
  });
  if (!safe) {
    console.warn("handoff blocked by moderation");
    return refuse("This message can't be sent.");
  }

  try {
    await deps.start({
      conversation: deps.conversation,
      message: text,
      email,
      turns: deps.recentTurns(HANDOFF_TURNS),
      sentAt: deps.now().toISOString(),
    });
  } catch (error) {
    console.error("couldn't start the handoff workflow", error);
    return refuse("Something went wrong sending that. Please try again.");
  }
  deps.markSent(id);
  return { sent: true };
}

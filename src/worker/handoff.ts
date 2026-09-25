import type { AnswerDeps, Turn } from "./answer";

export const MAX_HANDOFF_CHARS = 2000;
export const HANDOFFS_PER_CONVERSATION = 3;
export const DAILY_HANDOFF_LIMIT = 20;
export const HANDOFF_TURNS = 5;
// A claim that hasn't confirmed by now was abandoned (the Durable Object was evicted mid-send), so it's reclaimable.
// This assumes every step of a send finishes well within it: siteverify and moderation both have timeouts.
export const STALE_CLAIM_MS = 5 * 60 * 1000;
// One plain address: no whitespace or header punctuation, so it's safe as a Reply-To value.
const EMAIL = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]+$/;

/** What a Handoff email carries into the Workflow. */
export type HandoffParams = { conversation: string; message: string; email: string; turns: Turn[]; sentAt: string };

export type HandoffResult = { sent: true } | { sent: false; reason: string };

/** A Handoff id this Conversation has sent, or started sending at `at` (ms). */
export type Claims = Record<string, { sent: boolean; at: number }>;

export type HandoffDeps = {
  human: AnswerDeps["human"];
  /** This Conversation's Handoff claims. Both must be synchronous, so claiming can't be interleaved. */
  claims: () => Claims;
  setClaims: (claims: Claims) => void;
  /** Tells the page a Handoff was sent. */
  confirm: (id: string) => void;
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
  const { id, message, email: rawEmail, turnstileToken } = (request ?? {}) as Record<string, unknown>;
  const text = typeof message === "string" ? message.trim() : "";
  const email = typeof rawEmail === "string" ? rawEmail.trim() : "";
  if (typeof id !== "string" || id.length === 0 || id.length > 100) return refuse("Something went wrong. Please reload.");
  if (!text) return refuse("Please write a message.");
  if (text.length > MAX_HANDOFF_CHARS) return refuse(`Please keep the message under ${MAX_HANDOFF_CHARS} characters.`);
  if (email.length > 254 || !EMAIL.test(email)) return refuse("Please enter one valid email address.");

  // Claim the slot before the first await. The Durable Object can interleave calls at any await, so checking
  // here but recording only after sending would let a double-click send twice, or two cards pass the cap.
  const now = deps.now().getTime();
  const live: Claims = Object.fromEntries(
    Object.entries(deps.claims()).filter(([, c]) => c.sent || now - c.at < STALE_CLAIM_MS),
  );
  if (live[id]?.sent) return { sent: true };
  if (live[id]) return refuse("That message is still sending.");
  if (Object.keys(live).length >= HANDOFFS_PER_CONVERSATION) {
    return refuse("This conversation has already sent Nathan several messages. Please email him directly.");
  }
  deps.setClaims({ ...live, [id]: { sent: false, at: now } });

  // Anything short of a confirmed send releases the claim, including an unexpected throw.
  const release = () => {
    const { [id]: _released, ...rest } = deps.claims();
    deps.setClaims(rest);
  };
  try {
    const result = await deliver({ text, email, turnstileToken }, deps);
    if (!result.sent) release();
    else {
      deps.setClaims({ ...deps.claims(), [id]: { sent: true, at: now } });
      deps.confirm(id);
    }
    return result;
  } catch (error) {
    release();
    throw error;
  }
}

async function deliver(
  { text, email, turnstileToken }: { text: string; email: string; turnstileToken: unknown },
  deps: HandoffDeps,
): Promise<HandoffResult> {
  if (!deps.human.verified()) {
    if (!(await deps.human.verify(typeof turnstileToken === "string" ? turnstileToken : undefined))) {
      return refuse("Please complete the check, then send again.");
    }
    deps.human.markVerified();
  }

  // Like the answer Budget, this caps attempts: a message that moderation blocks has still used a slot.
  const withinDaily = await deps.spendDaily().catch((error) => {
    console.error("handoff daily limit check failed", error);
    return undefined;
  });
  if (withinDaily === undefined) return refuse("Something went wrong sending that. Please try again.");
  if (!withinDaily) {
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
  return { sent: true };
}

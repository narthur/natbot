export const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
// The widget covers all of nathanarthur.com, so a token must also prove it came from this page's widget.
export const HOSTNAME = "ask.nathanarthur.com";
export const ACTION = "ask"; // Matches `action` in src/turnstile.ts.
// These mean the Worker's secret is wrong, not the visitor's token: every visitor is being turned away.
const SECRET_ERRORS = ["missing-input-secret", "invalid-input-secret"];

type Outcome = {
  success: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
  metadata?: { result_with_testing_key?: boolean };
};

/** Asks Cloudflare whether a Turnstile token is valid. Tokens are single-use and expire after five minutes. */
export async function verifyTurnstile(secret: string, token: string | undefined): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`siteverify returned ${res.status}`);
    const outcome = (await res.json()) as Outcome;
    const codes = outcome["error-codes"] ?? [];
    if (codes.some((c) => SECRET_ERRORS.includes(c))) {
      console.error("turnstile secret is missing or invalid", codes);
      return false;
    }
    if (!outcome.success) {
      console.warn("turnstile rejected a token", codes);
      return false;
    }
    // Cloudflare's test keys (local dev) pass every token and report hostname example.com with no action.
    // Skipping the checks for them opens nothing: a test secret already lets every token through.
    if (outcome.metadata?.result_with_testing_key) return true;
    if (outcome.hostname !== HOSTNAME || outcome.action !== ACTION) {
      console.warn("turnstile token came from another page", { hostname: outcome.hostname, action: outcome.action });
      return false;
    }
    return true;
  } catch (error) {
    console.error("turnstile siteverify failed", error);
    return false;
  }
}

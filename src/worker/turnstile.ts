export const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
// These mean the Worker's secret is wrong, not the visitor's token: every visitor is being turned away.
const SECRET_ERRORS = ["missing-input-secret", "invalid-input-secret"];

/** Asks Cloudflare whether a Turnstile token is valid. Tokens are single-use and expire after five minutes. */
export async function verifyTurnstile(secret: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(SITEVERIFY, { method: "POST", body: new URLSearchParams({ secret, response: token }) });
    const outcome = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    const codes = outcome["error-codes"] ?? [];
    if (codes.some((c) => SECRET_ERRORS.includes(c))) console.error("turnstile secret is missing or invalid", codes);
    else if (!outcome.success) console.warn("turnstile rejected a token", codes);
    return outcome.success;
  } catch (error) {
    console.error("turnstile siteverify failed", error);
    return false;
  }
}

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Asks Cloudflare whether a Turnstile token is valid. Tokens are single-use and expire after five minutes. */
export async function verifyTurnstile(secret: string, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(SITEVERIFY, { method: "POST", body: new URLSearchParams({ secret, response: token }) });
    const outcome = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    if (!outcome.success) console.warn("turnstile rejected a token", outcome["error-codes"]);
    return outcome.success;
  } catch (error) {
    console.error("turnstile siteverify failed", error);
    return false;
  }
}

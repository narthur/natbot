const GUARD = "@cf/meta/llama-guard-3-8b";

/** Llama Guard's verdict on text a Visitor wrote. Throws when the output can't be read. */
export async function isSafe(ai: Ai, text: string): Promise<boolean> {
  const { response } = await ai.run(
    GUARD,
    { messages: [{ role: "user", content: text }], response_format: { type: "json_object" } },
    // Bounded so a live send never looks abandoned (STALE_CLAIM_MS in handoff.ts).
    { gateway: { id: "natbot" }, signal: AbortSignal.timeout(20_000) },
  );
  if (typeof response === "object" && typeof response.safe === "boolean") return response.safe;
  // Llama Guard doesn't always honor JSON mode; then it answers "safe", or "unsafe" followed by category codes.
  if (typeof response === "string") {
    const verdict = response.trim().split(/\s/)[0]?.toLowerCase();
    if (verdict === "safe") return true;
    if (verdict === "unsafe") return false;
  }
  throw new Error(`unreadable llama guard output: ${JSON.stringify(response)}`);
}

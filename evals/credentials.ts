import { execSync } from "node:child_process";

/** Workers AI credentials: CI passes them in; locally they come from your wrangler login. */
export function credentials(): { accountId: string; apiKey: string } {
  const wrangler = (args: string) => JSON.parse(execSync(`pnpm -s wrangler ${args} --json`, { encoding: "utf8" }));
  try {
    const apiKey: string = process.env.CLOUDFLARE_AI_TOKEN ?? wrangler("auth token").token;
    const accountId: string = process.env.CLOUDFLARE_ACCOUNT_ID ?? wrangler("whoami").accounts[0].id;
    if (!apiKey || !accountId) throw new Error("wrangler returned no token or account");
    return { accountId, apiKey };
  } catch (cause) {
    throw new Error("No Cloudflare credentials: run `wrangler login`, or set CLOUDFLARE_AI_TOKEN and CLOUDFLARE_ACCOUNT_ID.", {
      cause,
    });
  }
}

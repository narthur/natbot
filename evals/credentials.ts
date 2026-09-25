import { execSync } from "node:child_process";

/** Workers AI credentials: CI passes them in; locally they come from your wrangler login. */
export function credentials(): { accountId: string; apiKey: string } {
  const wrangler = (args: string) => JSON.parse(execSync(`pnpm -s wrangler ${args} --json`, { encoding: "utf8" }));
  const apiKey = process.env.CLOUDFLARE_AI_TOKEN ?? wrangler("auth token").token;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? wrangler("whoami").accounts[0].id;
  return { accountId, apiKey };
}

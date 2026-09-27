import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import agents from "agents/vite";
import { defineConfig } from "vitest/config";

// Runs the Conversation Durable Object adapter (../src/worker/chat.ts) inside workerd via
// @cloudflare/vitest-pool-workers: the only way to exercise real SQLite storage and alarms, which the root
// project's plain-Node `vitest.config.ts` can't touch. This lives in its own pnpm workspace package (see
// ../pnpm-workspace.yaml) rather than the root project because the pool only supports Vitest 4, and the root
// suite runs Vitest 5 (`pnpm test:workerd` at the repo root runs this; see package.json there).
export default defineConfig({
  test: { include: ["*.do.ts"] },
  plugins: [
    // Vite 8 (via oxc) doesn't lower TC39 standard decorators, and workerd can't parse them natively; this
    // plugin runs esbuild over just the files that use `@` syntax (chat.ts's `@callable()`, from the `agents`
    // SDK) so the pool receives already-lowered JS. Must come before `cloudflareTest`.
    agents(),
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.jsonc" },
    }),
  ],
});

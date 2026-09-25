import { defineConfig } from "vitest/config";

// Evals call Workers AI for real, so they stay out of `pnpm test` and run only via `pnpm eval`.
export default defineConfig({
  test: { include: ["evals/**/*.eval.ts"], testTimeout: 180_000, maxConcurrency: 5 },
});

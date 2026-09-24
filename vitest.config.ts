import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests don't load the Cloudflare plugin.
export default defineConfig({ test: { restoreMocks: true, unstubGlobals: true } });

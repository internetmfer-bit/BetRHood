import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // All test files share one Anvil instance (see test/setup.ts) — must run in a single
    // process, sequentially, or multiple files would race to bind the same port.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

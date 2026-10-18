import { defineConfig } from "vitest/config"

// Atlas test harness — the executable floor for the per-WP execution machine
// (EXECUTION-PROTOCOL.md). Each WP's RED/GREEN authors vitest cases that
// transcribe the frozen goldens (docs/requirements/goldens-*.md) + fast-check
// properties (docs/requirements/properties-*.md) against the ref/*.ts oracle.
// Held-out `-2` fixtures run only at GATE. No test may import dist/ or ref/ as
// a source of truth beyond the frozen oracle surface.
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "packages/*/src/**/*.test.ts", "harness/**/*.test.mjs"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // deterministic: no clock/network in the identity path (KERNEL guardrail)
    environment: "node",
    testTimeout: 10_000,
  },
})

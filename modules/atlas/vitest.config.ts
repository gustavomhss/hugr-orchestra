import { defineConfig } from "vitest/config"

// Atlas test harness — the executable floor for the per-WP execution machine
// (EXECUTION-PROTOCOL.md). Each WP's RED/GREEN authors vitest cases that
// transcribe the frozen goldens (docs/requirements/goldens-*.md) + fast-check
// properties (docs/requirements/properties-*.md) against the ref/*.ts oracle.
// Held-out `-2` fixtures run only at GATE. No test may import dist/ or ref/ as
// a source of truth beyond the frozen oracle surface.
//
// Two projects so the black-box suite gets its own wall-clock budget without touching the global 10s cap that
// guards the pure/total unit suites (a pure function taking 10s is itself a bug). `packages/e2e-blackbox/test/**`
// stories spawn real `atlas` CLI subprocesses and a real MCP stdio server, so their time is process startup and
// degrades under host CPU load; a project keyed by the glob applies to every new story automatically.
//
// `e2e-blackbox` does not extend the root on purpose: Vite's config merge concatenates array-valued `test.include`,
// so extending would re-admit the unit glob alongside its own narrower one.
export default defineConfig({
  test: {
    // deterministic: no clock/network in the identity path (KERNEL guardrail)
    environment: "node",
    testTimeout: 10_000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["packages/*/test/**/*.test.ts", "packages/*/src/**/*.test.ts", "harness/**/*.test.mjs"],
          exclude: ["**/node_modules/**", "**/dist/**", "packages/e2e-blackbox/test/**"],
        },
      },
      {
        test: {
          name: "e2e-blackbox",
          include: ["packages/e2e-blackbox/test/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/dist/**"],
          environment: "node",
          // Real subprocess spawn dominates wall-clock here. 30s was sized against a 10s red under sustained
          // synthetic CPU load; raised to 60s 2026-09-03 after SCN-MCP-4b-1 (8 subprocess pairs) measured 37s
          // on a quiet box.
          testTimeout: 60000,
        },
      },
    ],
  },
})

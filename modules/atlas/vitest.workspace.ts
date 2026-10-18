import { defineWorkspace } from "vitest/config"

// SEAT TIMEOUT fix — split the suite into two vitest "projects" so the black-box suite gets its own,
// higher wall-clock budget WITHOUT touching the global 10s cap that guards the pure/total unit suites
// (vitest.config.ts — this codebase is emphatic that a pure function taking 10s is itself a bug).
//
// WHY a project, not a per-file/per-`it` `testTimeout`: `packages/e2e-blackbox/test/**` stories spawn REAL
// `atlas` CLI subprocesses + a real MCP stdio server (packages/e2e-blackbox/test/support.ts,
// packages/e2e-blackbox/src/harness.ts — `spawnSync`/`StdioClientTransport`), so their wall-clock is
// dominated by process startup, not test logic, and degrades sharply under host CPU contention (measured:
// a full `vitest run` on a loaded box timed out `s16-sameas` at the 10s global cap; the same suite is green
// on a quiet CI runner — see the reproduction this fix carries in its commit). A per-`it`/per-file override
// would have to be copy-pasted into every new `*.blackbox.test.ts` story and silently forgotten the next
// time someone adds one; a project keyed by the `packages/e2e-blackbox/test/**` glob applies automatically
// to any file that lands there, no matter who writes it.
//
// The `unit` project is NOT `extends: './vitest.config.ts'` merged for its `include` on purpose either way
// — Vite's config merge CONCATENATES array-valued `test.include` rather than replacing it, so giving the
// `e2e-blackbox` project its own `extends` base would silently re-admit the whole-repo glob alongside its
// own narrower one (empirically verified while building this fix: a 168-file leak). The `e2e-blackbox`
// project is therefore fully self-contained; `unit` keeps `extends` because it only ADDS an `exclude`
// entry, where concatenation is the correct, intended effect.
export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "unit",
      exclude: ["**/node_modules/**", "**/dist/**", "packages/e2e-blackbox/test/**"],
    },
  },
  {
    test: {
      name: "e2e-blackbox",
      include: ["packages/e2e-blackbox/test/**/*.test.ts"],
      exclude: ["**/node_modules/**", "**/dist/**"],
      environment: "node",
      // Real subprocess spawn dominates wall-clock here, not test purity — see file banner. 30s was
      // sized against the measured red (10s cap tripped under sustained synthetic CPU load; this
      // suite's individual subtests ran 5-20s under the SAME load once given headroom) and re-verified
      // green under the identical load as part of this fix. Re-sized to 60s 2026-09-03 after
      // SCN-MCP-4b-1 (8 subprocess pairs, adversarial claims) measured 37s even on a quiet box.
      testTimeout: 60000,
    },
  },
])

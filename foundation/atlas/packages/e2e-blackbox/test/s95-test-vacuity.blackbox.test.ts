// @atlas/e2e-blackbox — test/s95-test-vacuity.blackbox.test.ts  (#95 · ADR-0015 D5 — the test-vacuity e2e anchor)
//
// ── RED until Wave 2 wires `atlas test-vacuity`; this is the shape's acceptance anchor (0-false-proven
// end-to-end). ────────────────────────────────────────────────────────────────────────────────────────────
//
// This story is written TEST-FIRST, ahead of the compose+CLI wiring, and is deliberately RED: the
// `atlas test-vacuity` command does not exist yet at this branch's base (`f8d2c5a`, the L1 fact-type
// scaffolding). The author of the acceptance gate is NOT the implementer — independence is the point. Wave 2
// (compose leg + CLI wiring targeting the FROZEN contract below) turns it GREEN. It imports NO test-vacuity
// runtime type; it shells the BUILT `atlas` CLI and asserts stdout strings, so it COMPILES against f8d2c5a
// even though the command is absent, and it RUNS red (the command errors / admits nothing).
//
// THE FROZEN CLI CONTRACT (mirror `atlas transition`, packages/cli/src/transition.ts — do not deviate):
//   `atlas test-vacuity <path>` scans the repo's test files, runs the `scanTestVacuity` oracle
//   (adapter-io/src/test-vacuity.ts), and admits every PROVEN `assertion-only-in-catch` fact THROUGH the
//   governed emit door (KNOW-11 authz + ARCH-9 anchor).
//     · exit 0 — ≥1 proven test-vacuity fact was admitted AND the governed door committed it durably.
//     · exit 2 — 0 vacuous tests found (nothing to admit) OR the governed door REFUSED. Nothing fabricated;
//                on a refusal nothing is written.
//     · stdout — a `status:` line, an admitted-count, and an `invariant:` line naming the shape.
//
// THE 0-FALSE-PROVEN RAIL (the load-bearing assertion). The fixture holds TWO named tests in one unit:
//   · a GENUINELY VACUOUS test whose only assertion sits inside a `catch` — the oracle PROVES it.
//   · a SOUND test whose assertion is on the SUCCESS path — the oracle MUST NOT prove it.
// The shape works end-to-end iff EXACTLY the first is admitted `proven` and the second is never named. Recall
// is the prompt; PRECISION is the gate — the sound test is the control that proves the gate never fabricates.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

// The unit under test lives under `test/` — so `unitScopeOf('test/sample.test.ts') === 'test'`. The governed
// emit door authorizes the durable write ONLY for an actor in that subject scope; the intruder owns nothing.
const UNIT = "test/sample.test.ts"
const SCOPE = "test"
const OWNER = "seat:owner"
const AUTH_ENV = { ATLAS_ACTOR: OWNER, ATLAS_RATIFY_TOKEN: OWNER }
const POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { [SCOPE]: [OWNER] } },
})

// Two DISTINCT test names so the 0-false-proven assertion is decisive by substring (never a 1-char collision).
const VACUOUS_NAME = "vacuous-catch-only"
const SOUND_NAME = "sound-success-path"

// ONE vacuous test (assertion-only-in-catch: if `mustThrow()` does not throw, the `catch` never runs and the
// test passes with NO assertion executed — the oracle PROVES this shape) + ONE sound test (its `expect` is on
// the success path, so the oracle ABSTAINS — the 0-false-proven control). Parses as TS; never executed — the
// oracle is a pure AST scan.
const TEST_FILE_BOTH =
  `import { test, expect } from 'vitest';\n` +
  `declare function mustThrow(): void;\n` +
  `declare function f(): number;\n\n` +
  `test('${VACUOUS_NAME}', () => {\n` +
  `  try {\n` +
  `    mustThrow();\n` +
  `  } catch (e) {\n` +
  `    expect(e).toBe(1);\n` +
  `  }\n` +
  `});\n\n` +
  `test('${SOUND_NAME}', () => {\n` +
  `  expect(f()).toBe(1);\n` +
  `});\n`

// A repo whose ONLY test is sound — nothing to admit (abstain-by-design).
const TEST_FILE_SOUND_ONLY =
  `import { test, expect } from 'vitest';\n` +
  `declare function f(): number;\n\n` +
  `test('${SOUND_NAME}', () => {\n` +
  `  expect(f()).toBe(1);\n` +
  `});\n`

let repo: FixtureRepo
// The durable CAS id of the admitted proven fact, scraped from `atlas test-vacuity`'s stdout (mirror s37).
let vacuousAddr = ""

beforeAll(() => {
  repo = makeFixtureRepo({ files: { [UNIT]: TEST_FILE_BOTH }, policy: POLICY })
})
afterAll(() => repo?.cleanup())

describe("S95 — `atlas test-vacuity` proves + persists the assertion-only-in-catch shape end-to-end (0-false-proven)", () => {
  it("1. `atlas test-vacuity .` admits EXACTLY the one vacuous test through the governed door (exit 0)", () => {
    const run = runAtlas(repo.repoPath, ["test-vacuity", "."], AUTH_ENV)
    // The whole contract a script has is the exit code: 0 == ≥1 proven fact admitted AND committed durably.
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("status: ok")
    // Exactly ONE admitted fact — the vacuous test — and the invariant names the proven shape.
    expect(run.stdout).toContain("admitted 1")
    expect(run.stdout).toContain("assertion-only-in-catch")
    // Defensive scrape (never throws): if a 64-hex CAS id is present, keep it for the read-back below.
    vacuousAddr = run.stdout.match(/\b([0-9a-f]{64})\b/)?.[1] ?? ""
  })

  it("2. `atlas node <addr>` reads the vacuous fact back as `seal: proven` with the re-runnable witness", () => {
    const node = runAtlas(repo.repoPath, ["node", vacuousAddr])
    expect(node.exitCode).toBe(0)
    expect(node.stdout).toContain("status: ok")
    expect(node.stdout).toContain("seal: proven")
    expect(node.stdout).toContain("witness:")
    // The witness names the proven shape + the test it re-finds at HEAD (TestVacuityWitness).
    expect(node.stdout).toContain("assertion-only-in-catch")
    expect(node.stdout).toContain(VACUOUS_NAME)
  })

  it("3. 0-FALSE-PROVEN — the SOUND test is NEVER admitted: no proven fact names it (the load-bearing rail)", () => {
    const run = runAtlas(repo.repoPath, ["test-vacuity", "."], AUTH_ENV)
    expect(run.exitCode).toBe(0)
    // Exactly one admission, and it is the vacuous test — the success-path assertion is never proven.
    expect(run.stdout).toContain("admitted 1")
    expect(run.stdout).toContain(VACUOUS_NAME)
    expect(run.stdout).not.toContain(SOUND_NAME)
  })

  it("4. a repo with NO vacuous test exits 2 and admits NOTHING (abstain-by-design, not an error)", () => {
    const solo = makeFixtureRepo({ files: { [UNIT]: TEST_FILE_SOUND_ONLY }, policy: POLICY })
    try {
      const run = runAtlas(solo.repoPath, ["test-vacuity", "."], AUTH_ENV)
      // exit 2 is abstention (nothing to admit), NOT a usage error (exit 1). Nothing fabricated.
      expect(run.exitCode).toBe(2)
      expect(run.stdout).toContain("status: rejected")
      expect(run.stdout).toContain("admitted 0")
    } finally {
      solo.cleanup()
    }
  })
})

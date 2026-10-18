// @atlas/e2e-blackbox — test/s32-verify-fact.blackbox.test.ts  (S32 — the sound-genesis PROVEN family is REACHED)
//
// NARRATIVE. The `verify{Dependency,Count,Negation}` oracles (@atlas/genesis) are pure, total, $0-LLM proofs
// over the live symbol-reverse index — the program-checkable half of the sound-genesis gate. Until an edge
// carried them to a caller they were LEDGERED REFERENCE MODELS: a specification with no production caller,
// exactly the class the reference-model-guard exists to track. This story is the proof they moved dead → live:
// it drives the SHIPPED `atlas verify-fact` binary against a real `.atlas/index.scip` and shows the door is
// REACHED and returns each oracle's verdict — never the "runtime is not composed yet" fail-closed, and never a
// throw. Nothing here imports product runtime code into an assertion; it is the built CLI, end to end.
//
// THE CORPUS. `src/lib/def.ts` DEFINES a global symbol GREET; `src/app/use.ts` REFERENCES it (⇒ one resolved
// caller under `src/app`). Nothing defines PHANTOM. From that one edge the four soundness postures fall out:
//   - dependency GREET under src/app  ⇒ PROVEN  (a witnessed caller, sound in any world)
//   - count GREET ≥1 under src        ⇒ PROVEN  (a witnessed lower bound)
//   - negation GREET under src/app    ⇒ REFUTED (a witnessed counterexample — only negation can refute)
//   - negation GREET under src/lib    ⇒ PROVEN  (closed scope, no caller: a grounded negative)
//   - dependency PHANTOM              ⇒ ABSTAIN (unresolvable target, #220 — an honest non-answer, exit 0)
//   - a missing --scope               ⇒ a structured error + non-zero exit (malformed, never a throw)

import { afterAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

// GLOBAL SCIP symbols (NOT `local ` — the groundable case), in the same descriptor form s31 uses.
const GREET = "scip . . `greet`#"
const PHANTOM = "scip . . `phantom`#"

const FILES = {
  "src/lib/def.ts": "export function greet() { return 1; }\n",
  "src/app/use.ts": "export function use() { return 2; }\n",
}

// The real SCIP the product reads: def.ts DEFINES greet (⇒ it RESOLVES), app/use.ts REFERENCES it (⇒ a caller
// under src/app). Nothing defines PHANTOM ⇒ it is unresolvable.
const INDEX = [
  { path: "src/lib/def.ts", defines: [GREET] },
  { path: "src/app/use.ts", references: [GREET] },
]

let repo: FixtureRepo | undefined
function indexedRepo(): FixtureRepo {
  repo ??= makeFixtureRepo({ files: FILES, index: INDEX })
  return repo
}
afterAll(() => repo?.cleanup())

describe("S32 — atlas verify-fact PROVES/REFUTES/ABSTAINS over the shipped binary (the sound gate is reached)", () => {
  it("dependency: a witnessed caller under scope ⇒ PROVEN, exit 0", () => {
    // teeth (breaks-on "verifyFact leg is not wired"): without the compose→bin→cli seam this reads the
    // "runtime is not composed yet" error + exit 1, the exact reference-model state this story ends.
    const run = runAtlas(indexedRepo().repoPath, ["verify-fact", "dependency", GREET, "--scope", "src/app"])
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("PROVEN")
    expect(run.stdout).not.toContain("runtime is not composed")
  })

  it("count: ≥1 caller under scope ⇒ PROVEN, exit 0", () => {
    const run = runAtlas(indexedRepo().repoPath, ["verify-fact", "count", GREET, "--scope", "src", "--min", "1"])
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("PROVEN")
  })

  it("negation: a witnessed caller under scope ⇒ REFUTED (only negation refutes), exit 0", () => {
    const run = runAtlas(indexedRepo().repoPath, ["verify-fact", "negation", GREET, "--scope", "src/app"])
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("REFUTED")
  })

  it("negation: a closed scope with no caller ⇒ PROVEN (a grounded negative), exit 0", () => {
    const run = runAtlas(indexedRepo().repoPath, ["verify-fact", "negation", GREET, "--scope", "src/lib"])
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("PROVEN")
  })

  it("an unresolvable target ⇒ ABSTAIN (an honest non-answer), exit 0 — not an error", () => {
    const run = runAtlas(indexedRepo().repoPath, ["verify-fact", "dependency", PHANTOM, "--scope", "src"])
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("ABSTAIN")
  })

  it("a missing --scope ⇒ a structured error + non-zero exit, never a throw", () => {
    const run = runAtlas(indexedRepo().repoPath, ["verify-fact", "dependency", GREET])
    expect(run.exitCode).not.toBe(0)
    expect(run.stdout + run.stderr).toContain("--scope")
  })
})

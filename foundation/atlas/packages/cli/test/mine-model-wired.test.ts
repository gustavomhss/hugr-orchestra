// @atlas/cli — test/mine-model-wired.test.ts  (ADR-0011: what the CLI knows about the model it just ran)
//
// THREE FINDINGS, one door.
//
//   R1 — `modelWired` was `deps?.proposer !== undefined`, and `withDefaults` installs the RESOLVED proposer
//        on the right-hand side of a `??`. On the CLI path that expression is ALWAYS FALSE, so a run that
//        spent two calls on a configured command printed "no proposer model is wired" four lines under its
//        own `llmCalls 2`. It is now read off the RESOLUTION.
//
//   R2 — `resolveProposer` called `loadModelConfig` with the default `process.env`, with no injection seam,
//        so `runMine(repo)` read the DEVELOPER'S OWN `~/.config/atlas/model.json` — and, now that the source
//        reader actually resolves, would EXECUTE the binary it names from inside a unit test. `env` is
//        threaded (the parameter `loadModelConfig` already had), and pinned by every case here.
//
//   GEN-15c — a structural seed with no path is DROPPED; the count leaves the pass and reaches the render,
//        because a frontier that shrinks in silence reads as "we covered everything" (#130).
//
// The stand-in "model" is `echo`: offline, deterministic, and non-empty on stdout ⇒ a proposal rather than
// an abstention (llm.ts:117). What is under test is the CLI's REPORT of the run, never a model's answer.

import { describe, it, expect, afterAll } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runMine, driveMinePass } from "../src/mine.js"
import { NO_MODEL_ENV, makeIndexedRepo, cleanupIndexedRepos } from "./mine-fixtures.js"

const CLAIM = "greet() formats through a template literal, not concatenation"
const scratch: string[] = []

/** An operator config on disk, OUTSIDE the repo under analysis (the ADR-0011 two-scope split). */
function operatorConfig(cmd: string, args: readonly string[] = []): string {
  const d = mkdtempSync(join(tmpdir(), "atlas-cli-operator-"))
  scratch.push(d)
  const p = join(d, "model.json")
  writeFileSync(p, JSON.stringify({ roles: { propose: { cmd, args } } }))
  return p
}

/** The env a pass sees when the operator HAS configured a model. */
const withModel = (cfg: string): NodeJS.ProcessEnv => ({ ATLAS_MODEL_CONFIG: cfg })

afterAll(() => {
  cleanupIndexedRepos()
  while (scratch.length > 0) rmSync(scratch.pop()!, { recursive: true, force: true })
})

describe("R1 — the CLI reports the model as WIRED when the operator config resolves one", () => {
  it("names the abstention without blaming an absent model, on a run that made real calls", async () => {
    // teeth (breaks-on "modelWired reads deps again"): no proposer is injected here, so a `deps`-derived
    // flag is false and the render falls into the "no proposer model is wired" branch — on a run whose own
    // cost line says it made two calls to a configured command.
    //
    // THE STAND-IN IS `true`, NOT `echo`, and the swap is load-bearing. This case needs a pass that is EMPTY
    // while a model is genuinely WIRED — that combination is the only state in which the render reaches the
    // "why is it 0" branch this test exists to police. It used to get that state for free, because `mine`
    // supplied no admission gate and every site abstained no matter what the model said; REQ-CLI-4d supplies
    // one, so an `echo`ing command now SEEDS and the branch is never reached. `true` exits 0 with empty
    // stdout, which `createCommandClient` reads as a GEN-12 abstention (llm.ts:118) — a real call, no claim.
    const repo = makeIndexedRepo()
    const v = await runMine(repo, { env: withModel(operatorConfig("true")) })

    expect(v.exitCode).toBe(0)
    expect(v.stdout).toContain("cost: llmCalls 2 · budgetSpent 2")
    expect(v.stdout).toContain("2 site(s) visited and every one abstained")
    expect(v.stdout).toContain("nothing was proposed or admitted") //  the MODEL-WIRED branch
    expect(v.stdout).not.toContain("no proposer model is wired") //    the lie this fixes
  })

  it("CONTROL: with no config resolvable, the very same repo DOES blame the absent model", async () => {
    // The other half of the pair — without it, case 1 could pass on a render that simply never says it.
    const repo = makeIndexedRepo()
    const v = await runMine(repo, { env: NO_MODEL_ENV })

    expect(v.stdout).toContain("cost: llmCalls 2 · budgetSpent 2")
    expect(v.stdout).toContain("no proposer model is wired")
  })

  it("carries the PROMPT ARTIFACT DIGEST when a model ran, and nothing when none did (ADR-0011 D3)", async () => {
    const repo = makeIndexedRepo()
    const wired = await runMine(repo, { env: withModel(operatorConfig("echo", [CLAIM])) })
    const bare = await runMine(repo, { env: NO_MODEL_ENV })

    expect(wired.stdout).toMatch(/^prompt: [0-9a-f]{16,} — /m) // the hash the three texts already claim
    expect(bare.stdout).not.toContain("prompt: ") //              no model ⇒ no prompt ⇒ nothing to assert
  })
})

describe("R2 — a pass is HERMETIC: the operator env is a seam, not the machine it runs on", () => {
  it("a hostile ATLAS_MODEL_CONFIG in the ambient environment is never read, and never executed", async () => {
    // teeth (breaks-on "resolveProposer drops the env parameter and reads process.env"): the hostile config
    // names a command that does not exist, so reading it would raise `ModelCommandError` at the first site
    // and `runMine` would THROW instead of returning an abstaining pass.
    const hostile = operatorConfig("atlas-hostile-binary-must-never-run")
    const saved = process.env.ATLAS_MODEL_CONFIG
    process.env.ATLAS_MODEL_CONFIG = hostile
    try {
      const repo = makeIndexedRepo()
      const v = await runMine(repo, { env: NO_MODEL_ENV })

      expect(v.exitCode).toBe(0)
      expect(v.stdout).toContain("no proposer model is wired") // the pinned env, not the ambient one
      expect(v.stdout).not.toContain("atlas-hostile-binary-must-never-run")
    } finally {
      if (saved === undefined) delete process.env.ATLAS_MODEL_CONFIG
      else process.env.ATLAS_MODEL_CONFIG = saved
    }
  })
})

describe("GEN-15c — a dropped structural seed is COUNTED all the way out to the render", () => {
  it("reports the pathless dep-graph node it dropped, and drops nothing when there is nothing to drop", async () => {
    // teeth (breaks-on "the drop becomes silent"): the frontier is one site shorter either way; without the
    // count the two runs below are indistinguishable, which is exactly the shape of a phantom-coverage claim.
    const ghost = driveMinePass(makeIndexedRepo({ ghostDoc: true }), { env: NO_MODEL_ENV })
    const clean = driveMinePass(makeIndexedRepo(), { env: NO_MODEL_ENV })

    expect(ghost.seedsDropped).toBe(1) // `src/ghost.ts` is indexed but is not in the tracked tree
    expect(clean.seedsDropped).toBe(0)
    expect(ghost.report.budgetSpent).toBe(2) // and the two REAL sites are still visited

    const v = await runMine(makeIndexedRepo({ ghostDoc: true }), { env: NO_MODEL_ENV })
    expect(v.stdout).toContain("frontier: 1 dep-graph node(s) dropped")
    const quiet = await runMine(makeIndexedRepo(), { env: NO_MODEL_ENV })
    expect(quiet.stdout).not.toContain("dep-graph node(s) dropped")
  })
})

// @atlas/e2e-blackbox — test/s25-model-reachability.blackbox.test.ts  (S25 — configuring a model must not
// break a working run)
//
// NARRATIVE. Two `atlas mine` runs on the SAME indexed repo, differing only in whether a model is
// configured. MEASURED on the built binary before this story existed:
//
//     without a config:  `cost: llmCalls 2 · budgetSpent 2`, exit 0
//     with a VALID one:  `cost: llmCalls 0 · budgetSpent 0`, exit 1, `partial: resume at rank -1`
//
// Configuring a model turned a working run into a failed one, and the failure was ANONYMOUS. The cause was
// `StructRef.qualifiedPath` carrying two different kinds of value: `git-history.ts` `fileRef` put a
// repo-relative PATH there, `genesis` `structuralSeeds` put a dep-graph NODE-IDENTITY KEY (a hash). Nothing
// consulted that difference until a model was wired — `createFileSourceReader` treats the field as a path
// unconditionally, so on every repo that falls back to the structural frontier (thin history, or an empty
// mined one — which is EVERY repo `atlas mine` runs on today) it returned `null` at every site, the prompt
// factory refused to prompt without the bytes, and the run-controller's GEN-8c catch turned the refusal
// into an anonymous partial.
//
// WHY IT LIVES HERE. The two producers only meet in a full pass, and the failure only appears once a model
// is actually configured. It is invisible to any test that stops at the frontier.
//
// WHY NOT IN S24. S24's "a VALID config reaches the model path" case concedes in its own body that the
// fixture seeds nothing: `propose` is never called there, so it witnesses only that a template was READ at
// construction time. This story hands the product a repo that HAS sites (`spec.index` — real SCIP
// occurrences ⇒ real dep edges ⇒ a real ranked frontier) and a command that ECHOES a claim, so the model
// path is not merely constructed but TRAVELLED.
//
// NO LIVE MODEL. `roles.propose.cmd` is `echo`: a deterministic, offline stand-in that returns a fixed
// non-empty claim. What is under test is REACHABILITY — that the site's bytes could be produced, the prompt
// built, the command run and its answer carried back — never what a model would say.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"

import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

/** The claim text the stand-in "model" emits. [ADR-0020] The advisory arm now uses the reason-freely BLOCK
 *  contract, so a proposal is one fenced `atlas-fact` block carrying `{"claim": ...}`; a bare line abstains. */
const CLAIM_TEXT = "charge() re-reads the ledger before it applies the discount"
const CLAIM = "```atlas-fact\n" + JSON.stringify({ claim: CLAIM_TEXT }) + "\n```"

/** A valid operator config whose command ECHOES `CLAIM` — the model path is travelled, not just built. */
const ECHOING = JSON.stringify({ roles: { propose: { cmd: "echo", args: [CLAIM] } } })

/** The corpus: `greet` is DEFINED in util.ts and REFERENCED in app.ts (⇒ one resolved dep edge, two
 *  participating nodes ⇒ two structural seeds), plus one reference defined nowhere (⇒ an `unresolved`
 *  edge, INDEX-13). Both files are really on disk, so both sites have bytes a prompt can carry. */
const FILES = {
  "src/util.ts": "export function greet(n: string): string {\n  return `hi ${n}`;\n}\n",
  "src/app.ts":
    "import { greet } from './util';\n\nexport function main(): string {\n  return greet('world') + missingHelper();\n}\n",
}
const INDEX = [
  { path: "src/util.ts", defines: ["util/greet()."] },
  { path: "src/app.ts", references: ["util/greet().", "util/missingHelper()."] },
]

let repo: FixtureRepo | undefined
const scratch: string[] = []

function operatorConfig(body: string): string {
  const d = mkdtempSync(join(tmpdir(), "atlas-s25-operator-"))
  scratch.push(d)
  const p = join(d, "model.json")
  writeFileSync(p, body)
  return p
}

function indexedRepo(): FixtureRepo {
  repo ??= makeFixtureRepo({ files: FILES, index: INDEX })
  return repo
}

afterAll(() => {
  repo?.cleanup()
  while (scratch.length > 0) rmSync(scratch.pop()!, { recursive: true, force: true })
})

describe("S25 — a configured model is REACHED at every ranked site, and the run still completes", () => {
  it("CONTROL: with NO model configured the pass visits its sites and completes", () => {
    // The baseline the next case must not regress. It also proves the fixture really has a frontier — an
    // assertion about "with a model" is worth nothing if the repo has no site either way.
    // ATLAS_MINE_SLOT pinned to the advisory arm: this story tests model REACHABILITY at every site, not the
    // multi-arm default (which is proven in s-sound-default + the mine-arms unit suite).
    const run = runAtlas(indexedRepo().repoPath, ["mine", "."], { ATLAS_MODEL_CONFIG: "", ATLAS_MINE_SLOT: "advisory" })

    expect(run.stdout).toContain("cost: llmCalls 2 · budgetSpent 2")
    expect(run.stdout).toContain("no proposer model is wired")
    expect(run.exitCode).toBe(0)
  })

  it("THE BITE: with a VALID config the model is reached at every site and the run exits 0", () => {
    // teeth (breaks-on "structuralSeeds emits the dependency key as qualifiedPath"): the reader resolves
    // `<repo>/<64-hex>`, gets null at every site, the prompt factory refuses, GEN-8c swallows it — and this
    // run becomes `llmCalls 0 · budgetSpent 0`, exit 1, `partial: resume at rank -1`. Verified RED against
    // the unfixed producer before this file was committed.
    const run = runAtlas(indexedRepo().repoPath, ["mine", "."], {
      ATLAS_MODEL_CONFIG: operatorConfig(ECHOING),
      ATLAS_MINE_SLOT: "advisory",
    })

    expect(run.stdout).toContain("cost: llmCalls 2 · budgetSpent 2") // llmCalls > 0: the model WAS called
    expect(run.stdout).not.toContain("partial: resume at rank") //       a completed pass, not an interruption
    expect(run.exitCode).toBe(0)
    // SEEDED — the stronger end of the same claim. This line used to assert "2 site(s) visited and every one
    // abstained", because `mine` supplied no admission gate at all and every site abstained whatever the
    // model answered; REQ-CLI-4d supplies one at the composition root, so the echoed claim now travels the
    // WHOLE path — site bytes → prompt → command → answer → the frozen `admit` verdict → a staged candidate
    // row. Reachability that stops one step short of the store is the weaker story, and this is the step.
    expect(run.stdout).toContain("genesis: seeded 2 candidate fact(s)")
    expect(run.stdout).not.toContain("no proposer model is wired") // never blamed for an absence it does not own
  })

  it("the run carries the PROMPT ARTIFACT DIGEST it proposed under (ADR-0011 D3 provenance)", () => {
    // `PromptFactory.digest` had zero readers, so "hashed into the run's provenance" was asserted by
    // ADR-0011:175 and by propose.md — which leans on it ("the refusal RATE is only readable as a quality
    // signal with this prompt held fixed") — and carried by nothing. teeth (breaks-on "the digest is
    // computed and dropped"): with no reader the line is absent and this fails.
    const run = runAtlas(indexedRepo().repoPath, ["mine", "."], {
      ATLAS_MODEL_CONFIG: operatorConfig(ECHOING),
      ATLAS_MINE_SLOT: "advisory",
    })

    expect(run.stdout).toMatch(/^prompt: [0-9a-f]{16,} — the artifact every proposal on this run was built from$/m)
  })

  it("a MISSING model binary is named, with its command — never an anonymous partial run", () => {
    // The other half of reachability: when the configured command does NOT exist, the failure must be
    // legible. `ModelCommandError` is raised inside a per-site visit and GEN-8c catches that bare, so this
    // used to surface as `exit 1 · llmCalls 0 · resume at rank -1` and nothing else. teeth (breaks-on
    // "ModelCommandError is swallowed by the controller again").
    const missing = JSON.stringify({ roles: { propose: { cmd: "atlas-no-such-model-binary", args: [] } } })
    const run = runAtlas(indexedRepo().repoPath, ["mine", "."], {
      ATLAS_MODEL_CONFIG: operatorConfig(missing),
      ATLAS_MINE_SLOT: "advisory",
    })

    expect(run.exitCode).toBe(2) // a governed refusal, like every other misconfiguration — not a partial
    expect(run.stdout).toContain("the configured model command failed")
    expect(run.stdout).toContain("atlas-no-such-model-binary") // the command is NAMED
    expect(run.stdout).not.toContain("partial: resume at rank")
  })
})

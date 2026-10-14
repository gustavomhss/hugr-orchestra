// @atlas/e2e-blackbox — test/s36-definition-proven.blackbox.test.ts  (#196d — the DEFINITION proven slot)
//
// NARRATIVE. #196d adds `definition` to the sound PROVEN family: "global symbol X is DEFINED under scope S",
// sealed `proven`, witnessed by X's SCIP definition-occurrence lying under S — a positive witnessed existence,
// sound in ANY world (no closed-world assumption). This story drives the REAL chain end to end on a real SCIP
// index, with a deterministic OFFLINE stand-in model (`echo`, ZERO metered spend — the same idiom S33/S239
// use): `atlas mine` (definition arm, `ATLAS_MINE_SLOT=definition`) stages ONE proven definition candidate,
// `atlas promote` writes it to the durable CAS, and `atlas node <addr>` renders it back through the actual
// user door — `seal: proven`, `predicateSlot: definition`, and the re-provable `witness`.
//
// TEETH (the payoff, model-free): the sound `atlas verify-fact definition` door PROVES the SAME symbol under
// its own scope, ABSTAINS on that symbol under a DIFFERENT scope (defined ELSEWHERE — a scoped non-answer, NOT
// a false proof), and ABSTAINS on a phantom target. A claim about a symbol NOT defined under the scope can
// never come back `proven` — that is exactly the 0-false-proven floor the seal exists to hold.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

const CURATOR = "seat:orchestrator"
const CURATOR_ENV = { ATLAS_ACTOR: CURATOR, ATLAS_RATIFY_TOKEN: CURATOR }

/** `greet` is DEFINED in util.ts (and referenced in app.ts). The `createUnitDefs` candidate set for
 *  `src/util.ts` is exactly `['greet']` (its terminal name); `src/app.ts` defines only `main`. */
const FILES = {
  "src/util.ts": "export function greet(n: string): string {\n  return `hi ${n}`;\n}\n",
  "src/app.ts": "import { greet } from './util';\n\nexport function main(): string {\n  return greet('world');\n}\n",
}
const INDEX = [
  { path: "src/util.ts", defines: ["util/greet()."] },
  { path: "src/app.ts", references: ["util/greet()."], defines: ["app/main()."] },
]
const CURATOR_POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { "atlas:mined": [CURATOR] } },
})
/** The `DEFINES:` grammar's ONE candidate name that RESOLVES for this corpus — only `src/util.ts` defines a
 *  symbol whose terminal name is `greet`. Echoed for EVERY site; only the util site resolves it, so the run
 *  stages exactly ONE fact (the app site's `DEFINES: greet` abstains — greet is not defined THERE). NO LIVE
 *  MODEL: `roles.propose.cmd` is `echo`. */
const DEFINES_CLAIM = "DEFINES: greet"

let repo: FixtureRepo
let modelConfigPath: string
let modelConfigDir: string
let addr = ""

beforeAll(() => {
  repo = makeFixtureRepo({ files: FILES, index: INDEX, policy: CURATOR_POLICY })
  // OUTSIDE the repo, deliberately (arbitrary-code-execution guard — see S33).
  modelConfigDir = mkdtempSync(join(tmpdir(), "atlas-s36-operator-"))
  modelConfigPath = join(modelConfigDir, "model.json")
  writeFileSync(modelConfigPath, JSON.stringify({ roles: { propose: { cmd: "echo", args: [DEFINES_CLAIM] } } }))
})
afterAll(() => {
  repo?.cleanup()
  if (modelConfigDir) rmSync(modelConfigDir, { recursive: true, force: true })
})

describe("S36 — a mined definition fact is sealed `proven`, carries its witness, and the sound door holds the 0-false-proven floor", () => {
  it("mine (definition arm) stages ONE proven definition candidate — ZERO metered model spend", () => {
    const mine = runAtlas(repo.repoPath, ["mine", "."], {
      ATLAS_MODEL_CONFIG: modelConfigPath,
      ATLAS_MINE_SLOT: "definition",
    })
    expect(mine.exitCode).toBe(0)
    expect(mine.stdout).toContain("genesis: seeded 1 candidate fact(s)")
  })

  it("promote writes it to the DURABLE CAS", () => {
    const promote = runAtlas(repo.repoPath, ["promote"], CURATOR_ENV)
    expect(promote.exitCode).toBe(0)
    expect(promote.stdout).toContain("promote: 1 of 1 staged candidate(s) promoted; 0 refused")
    const line = promote.stdout.split("\n").find((l) => l.startsWith("  promoted "))
    expect(line).toBeDefined()
    addr = line!.split(" -> ")[1]!.trim()
    expect(addr).toMatch(/^[0-9a-f]{64}$/)
  })

  it("`atlas node <addr>` renders seal:proven and the re-provable definition witness (slot nested under witness:)", () => {
    const node = runAtlas(repo.repoPath, ["node", addr])
    expect(node.exitCode).toBe(0)
    expect(node.stdout).toContain("status: ok")
    expect(node.stdout).toContain("seal: proven")
    // the definition slot is surfaced via the witness (the renderer nests slot/target/scope under `witness:`).
    expect(node.stdout).toContain("witness:")
    expect(node.stdout).toContain("    slot: definition")
    expect(node.stdout).toContain("    target: util/greet().")
    expect(node.stdout).toContain("    scope: src") // the VERIFY-SCOPE (unit dir), NESTED under `witness:`
    // the stored sentence is DERIVED from the witness — "defined under", never the dependency arm's "references".
    expect(node.stdout).toContain("util/greet(). is defined under src (witnessed definition occurrence, sound oracle)")
  })

  it("RE-PROVEN (196d, #240) — `atlas verify-store` replays the promoted definition witness, re-proven not unverifiable, exit 0", () => {
    // The read-side reverify gate (`reverify-store.ts` WITNESSED_SLOTS) must include `definition`, else this
    // proven fact is `unverifiable` and DROPPED from tracked-provable reads — the #240 trap. This is the e2e
    // teeth that the mint-side and read-side verification seams AGREE for the definition slot.
    const verify = runAtlas(repo.repoPath, ["verify-store"])
    expect(verify.exitCode).toBe(0)
    expect(verify.stdout).toContain("status: ok")
    expect(verify.stdout).toContain("verify-store: 1 sealed-proven fact(s) — 1 re-proven, 0 broken, 0 unverifiable")
  })

  it("TEETH — the sound door PROVES greet under `src`, ABSTAINS out-of-scope and on a phantom (never false-proven)", () => {
    const proven = runAtlas(repo.repoPath, ["verify-fact", "definition", "util/greet().", "--scope", "src"])
    expect(proven.exitCode).toBe(0)
    expect(proven.stdout).toContain("PROVEN")

    // Defined in `src/util.ts`, i.e. NOT under `src/app` — a scoped non-answer, NOT a proof it is undefined.
    const outOfScope = runAtlas(repo.repoPath, ["verify-fact", "definition", "util/greet().", "--scope", "src/app"])
    expect(outOfScope.exitCode).toBe(0)
    expect(outOfScope.stdout).toContain("ABSTAIN")
    expect(outOfScope.stdout).not.toContain("PROVEN")

    // A phantom target the index has no definition for — abstains, never proven.
    const phantom = runAtlas(repo.repoPath, ["verify-fact", "definition", "util/nope#", "--scope", "src"])
    expect(phantom.exitCode).toBe(0)
    expect(phantom.stdout).toContain("ABSTAIN")
    expect(phantom.stdout).not.toContain("PROVEN")
  })
})

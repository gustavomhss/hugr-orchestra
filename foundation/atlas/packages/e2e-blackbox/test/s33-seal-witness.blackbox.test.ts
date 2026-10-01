// @atlas/e2e-blackbox — test/s33-seal-witness.blackbox.test.ts  (SEAL-CARRIES-ITS-WITNESS)
//
// NARRATIVE. A fact sealed `proven` used to record THAT something was proved and discard the DERIVATION,
// so it could never be re-proved. This story drives the REAL chain end to end on a real SCIP index, with a
// deterministic OFFLINE stand-in model (`echo`, ZERO metered spend — the same idiom S26's symbol-arm story
// uses): `atlas mine` (dependency arm) stages a proven dependency candidate, `atlas promote` writes it to
// the DURABLE CAS, the raw stored bytes are read straight off disk (this story stays a RAW-CAS read
// deliberately, to pin the durable shape byte-for-byte — the READ-SIDE `atlas node` renderer over this same
// witness is now pinned separately, #239, s239-node-witness.blackbox.test.ts), and the stored `witness` is
// fed back into `atlas verify-fact` — the payoff: the SAME (target, scope) proves AGAIN, from bytes that
// travelled through staging → CAS and back, with no model in the loop the second time.
//
// THE TRAP THIS WP NAMES, pinned as its own assertion: the stored fact ALSO carries a top-level `scope`
// (the KNOW-11a AUTHZ scope, `'atlas:mined'`) — a completely different thing from `witness.scope` (the
// VERIFY-SCOPE directory, `'src'`). Both are asserted, and asserted DIFFERENT, so a reader cannot confuse them.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

const CURATOR = "seat:orchestrator"
const CURATOR_ENV = { ATLAS_ACTOR: CURATOR, ATLAS_RATIFY_TOKEN: CURATOR }

/** `greet` is DEFINED in util.ts and REFERENCED in app.ts ⇒ one resolved cross-unit dep edge — the
 *  `createUnitDeps` candidate set for `src/app.ts` is exactly `['greet']` (its terminal name). */
const FILES = {
  "src/util.ts": "export function greet(n: string): string {\n  return `hi ${n}`;\n}\n",
  "src/app.ts": "import { greet } from './util';\n\nexport function main(): string {\n  return greet('world');\n}\n",
}
const INDEX = [
  { path: "src/util.ts", defines: ["util/greet()."] },
  { path: "src/app.ts", references: ["util/greet()."] },
]
/** Appoints a curator over the mined scope — nothing is granted by default (ADR-0008). */
const CURATOR_POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { "atlas:mined": [CURATOR] } },
})

/** The `DEPENDS-ON:` grammar's ONE candidate name for this corpus (`llm.ts` `DEPENDS_ON_RE` /
 *  `unit-deps.ts` `symbolTerminalName('util/greet().')`). NO LIVE MODEL: `roles.propose.cmd` is `echo`. */
const DEPENDS_ON_CLAIM = "DEPENDS-ON: greet"

let repo: FixtureRepo
let modelConfigPath: string
let modelConfigDir: string
let addr = ""

beforeAll(() => {
  repo = makeFixtureRepo({ files: FILES, index: INDEX, policy: CURATOR_POLICY })
  // OUTSIDE the repo, deliberately: `atlas mine` refuses to read `ATLAS_MODEL_CONFIG` from inside the
  // repository under analysis (arbitrary-code-execution guard) — the same reason S26's `operatorConfig`
  // helper mints its temp dir under the OS tmpdir rather than the fixture repo.
  modelConfigDir = mkdtempSync(join(tmpdir(), "atlas-s33-operator-"))
  modelConfigPath = join(modelConfigDir, "model.json")
  writeFileSync(modelConfigPath, JSON.stringify({ roles: { propose: { cmd: "echo", args: [DEPENDS_ON_CLAIM] } } }))
})
afterAll(() => {
  repo?.cleanup()
  if (modelConfigDir) rmSync(modelConfigDir, { recursive: true, force: true })
})

describe("S33 — a proven seal carries its own witness, through staging, CAS and BACK into the sound oracle", () => {
  it("mine (dependency arm) stages ONE proven dependency candidate — ZERO metered model spend", () => {
    const mine = runAtlas(repo.repoPath, ["mine", "."], {
      ATLAS_MODEL_CONFIG: modelConfigPath,
      ATLAS_MINE_SLOT: "dependency",
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

  it("the RAW durable CAS bytes carry the witness verbatim, and the authz `scope` is a DIFFERENT leg", () => {
    const casPath = join(repo.repoPath, ".atlas", "cas", addr.slice(0, 2), addr)
    const stored = JSON.parse(readFileSync(casPath, "utf8")) as {
      seal?: string
      predicateSlot?: string
      scope?: string // the AUTHZ scope (KNOW-11a) — 'atlas:mined'
      witness?: { slot?: string; target?: string; scope?: string; atLeast?: number } // the VERIFY-SCOPE derivation
    }
    expect(stored.seal).toBe("proven")
    expect(stored.predicateSlot).toBe("dependency")
    expect(stored.witness).toEqual({ slot: "dependency", target: "util/greet().", scope: "src" })
    // THE TRAP: two DIFFERENT `scope` legs on the same fact, and they must not be confused.
    expect(stored.scope).toBe("atlas:mined")
    expect(stored.witness!.scope).toBe("src")
    expect(stored.witness!.scope).not.toBe(stored.scope)
  })

  it("THE PAYOFF — the stored witness fed back into `atlas verify-fact` PROVES again, model-free", () => {
    const casPath = join(repo.repoPath, ".atlas", "cas", addr.slice(0, 2), addr)
    const stored = JSON.parse(readFileSync(casPath, "utf8")) as { witness: { target: string; scope: string } }
    const verify = runAtlas(repo.repoPath, [
      "verify-fact",
      "dependency",
      stored.witness.target,
      "--scope",
      stored.witness.scope,
    ])
    expect(verify.exitCode).toBe(0)
    expect(verify.stdout).toContain("PROVEN")
  })
})

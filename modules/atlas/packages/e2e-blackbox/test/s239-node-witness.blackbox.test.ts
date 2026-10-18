// @atlas/e2e-blackbox — test/s239-node-witness.blackbox.test.ts  (#239 — `atlas node` surfaces its witness)
//
// NARRATIVE. PR #195 (SEAL-CARRIES-ITS-WITNESS) stores `witness: { slot, target, scope, atLeast? }` on a
// `seal:'proven'` fact, but the `atlas node` READ-SIDE renderer (`render.ts`'s `renderData`) was deliberately
// not extended by that WP — its own blackbox story (S33) reads raw CAS bytes instead of the CLI door, so the
// re-check derivation was invisible exactly where an operator would look for it: `atlas node <addr>`.
//
// This story drives the SAME real chain S33 does (mine dependency arm, echo model, zero metered spend →
// promote → durable CAS), then reads the promoted node back through `atlas node <addr>` — the actual user
// door — and asserts the witness now renders.
//
// THE TRAP THIS WP NAMES, pinned here at the RENDER layer (S33 pins it at the stored-bytes layer): a
// `witness.scope` (the VERIFY-SCOPE directory the oracle ranged over, e.g. `'src'`) and the fact's own
// top-level authz `scope` (KNOW-11a, e.g. `'atlas:mined'`) are DIFFERENT things. The render nests
// `witness:`'s `scope:` one level under it — mirroring the stored shape — so the two can never print as the
// same field name at the same indent.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

const CURATOR = "seat:orchestrator"
const CURATOR_ENV = { ATLAS_ACTOR: CURATOR, ATLAS_RATIFY_TOKEN: CURATOR }

const FILES = {
  "src/util.ts": "export function greet(n: string): string {\n  return `hi ${n}`;\n}\n",
  "src/app.ts": "import { greet } from './util';\n\nexport function main(): string {\n  return greet('world');\n}\n",
}
const INDEX = [
  { path: "src/util.ts", defines: ["util/greet()."] },
  { path: "src/app.ts", references: ["util/greet()."] },
]
const CURATOR_POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { "atlas:mined": [CURATOR] } },
})
const DEPENDS_ON_CLAIM = "DEPENDS-ON: greet"

let repo: FixtureRepo
let modelConfigPath: string
let modelConfigDir: string
let addr = ""

beforeAll(() => {
  repo = makeFixtureRepo({ files: FILES, index: INDEX, policy: CURATOR_POLICY })
  modelConfigDir = mkdtempSync(join(tmpdir(), "atlas-s239-operator-"))
  modelConfigPath = join(modelConfigDir, "model.json")
  writeFileSync(modelConfigPath, JSON.stringify({ roles: { propose: { cmd: "echo", args: [DEPENDS_ON_CLAIM] } } }))

  const mine = runAtlas(repo.repoPath, ["mine", "."], {
    ATLAS_MODEL_CONFIG: modelConfigPath,
    ATLAS_MINE_SLOT: "dependency",
  })
  if (mine.exitCode !== 0) throw new Error(`S239 setup: mine failed:\n${mine.stdout}`)

  const promote = runAtlas(repo.repoPath, ["promote"], CURATOR_ENV)
  if (promote.exitCode !== 0) throw new Error(`S239 setup: promote failed:\n${promote.stdout}`)
  const line = promote.stdout.split("\n").find((l) => l.startsWith("  promoted "))
  if (line === undefined) throw new Error(`S239 setup: no promoted line:\n${promote.stdout}`)
  addr = line.split(" -> ")[1]!.trim()
})
afterAll(() => {
  repo?.cleanup()
  if (modelConfigDir) rmSync(modelConfigDir, { recursive: true, force: true })
})

describe("S239 — `atlas node <addr>` renders the proven seal's own witness (REVERT ⇒ RED)", () => {
  it("BY USE: a real mine→promote→node chain surfaces witness.slot/target/scope, distinct from the authz scope", () => {
    const node = runAtlas(repo.repoPath, ["node", addr])
    expect(node.exitCode).toBe(0)
    expect(node.stdout).toContain("status: ok")
    expect(node.stdout).toContain("seal: proven")
    expect(node.stdout).toContain("witness:")
    expect(node.stdout).toContain("    slot: dependency")
    expect(node.stdout).toContain("    target: util/greet().")
    expect(node.stdout).toContain("    scope: src") // the VERIFY-SCOPE, NESTED under `witness:`
    // THE TRAP: the fact's own authz `scope` ('atlas:mined') must never appear as an UNNESTED `  scope:`
    // sibling of `witness:` — that would make it indistinguishable from `witness.scope` by name alone.
    expect(node.stdout).not.toMatch(/^\s{2}scope: /m)
    expect(node.stdout).not.toContain("scope: atlas:mined")
  })
})

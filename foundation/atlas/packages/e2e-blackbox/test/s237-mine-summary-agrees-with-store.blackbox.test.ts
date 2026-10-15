// @atlas/e2e-blackbox — test/s237-mine-summary-agrees-with-store.blackbox.test.ts  (#237)
//
// NARRATIVE. MEASURED 2026-08-18: `atlas mine` pinned to a single arm (`ATLAS_MINE_SLOT=advisory`) prints
// `genesis: seeded 0 candidate fact(s)` and `mine: 0 candidate facts — every one abstained` on a RERUN over
// a repo whose sites are ALREADY staged from an earlier pass — while the SAME run's own per-site ledger says
// `"outcome":"seeded"` for every site and `.atlas/staging.json` durably holds every row. An operator reading
// stdout concludes the run produced nothing when the store says otherwise.
//
// ROOT CAUSE: `mine-decide.ts`'s "never re-author an already-staged key" guard skips minting a candidate
// whose key the store already has, so the write-dedup's `report.seeded` undercounts; the per-site LEDGER
// (written one layer upstream, at the gate's own admission) does not share that skip. `mine-render.ts`'s
// `seededCount` now reads the ledger first, so the header and the ledger it sits above cannot disagree.
//
// ZERO METERED MODEL SPEND — `echo` stands in for the model (the S33 idiom): `ATLAS_MODEL_CONFIG` points
// OUTSIDE the repo (the arbitrary-code-execution guard `atlas mine` enforces against an in-repo config).

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

const FILES = {
  "src/util.ts": "export function greet(n: string): string {\n  return `hi ${n}`;\n}\n",
  "src/app.ts": "import { greet } from './util';\n\nexport function main(): string {\n  return greet('world');\n}\n",
}
const INDEX = [
  { path: "src/util.ts", defines: ["util/greet()."] },
  { path: "src/app.ts", references: ["util/greet()."] },
]
const POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: {} },
})

let repo: FixtureRepo
let modelConfigPath: string
let modelConfigDir: string

beforeAll(() => {
  repo = makeFixtureRepo({ files: FILES, index: INDEX, policy: POLICY })
  modelConfigDir = mkdtempSync(join(tmpdir(), "atlas-s237-operator-"))
  modelConfigPath = join(modelConfigDir, "model.json")
  const claimBlock = '```atlas-fact\n{"claim":"this site does something notable"}\n```'
  writeFileSync(modelConfigPath, JSON.stringify({ roles: { propose: { cmd: "echo", args: [claimBlock] } } }))
})
afterAll(() => {
  repo?.cleanup()
  if (modelConfigDir) rmSync(modelConfigDir, { recursive: true, force: true })
})

describe("S237 — a single-arm `atlas mine` rerun reports what the store actually holds", () => {
  it("BY USE: first run seeds 2, second run (idempotent rerun, same sites already staged) STILL reports 2 — never a false 0/abstained", () => {
    const env = { ATLAS_MODEL_CONFIG: modelConfigPath, ATLAS_MINE_SLOT: "advisory" }

    const run1 = runAtlas(repo.repoPath, ["mine", "."], env)
    expect(run1.exitCode).toBe(0)
    expect(run1.stdout).toContain("genesis: seeded 2 candidate fact(s)")

    const staging1 = JSON.parse(readFileSync(join(repo.repoPath, ".atlas", "staging.json"), "utf8")) as {
      current: unknown[]
    }
    expect(staging1.current).toHaveLength(2)

    // THE MEASURED SCENARIO: rerun over the SAME repo — every site is already staged.
    const run2 = runAtlas(repo.repoPath, ["mine", "."], env)
    expect(run2.exitCode).toBe(0)

    // THE STORE — unchanged (an idempotent rerun writes nothing new).
    const staging2 = JSON.parse(readFileSync(join(repo.repoPath, ".atlas", "staging.json"), "utf8")) as {
      current: unknown[]
    }
    expect(staging2.current).toHaveLength(2)

    // THE SUMMARY must agree with the store it sits beside — this is the #237 fix.
    expect(run2.stdout).toContain("genesis: seeded 2 candidate fact(s)")
    expect(run2.stdout).not.toContain("genesis: seeded 0 candidate fact(s)")
    expect(run2.stdout).not.toContain("every one abstained")
    // and the per-site ledger it must not contradict:
    const seededLines = run2.stdout
      .split("\n")
      .filter((l) => l.startsWith("site: ") && l.includes('"outcome":"seeded"'))
    expect(seededLines).toHaveLength(2)
  })
})

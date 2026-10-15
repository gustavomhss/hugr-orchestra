// @atlas/e2e-blackbox — test/s34-mine-history-frontier.blackbox.test.ts  (#243 WIRE-MINE-HISTORY)
//
// PROVEN BY USE, not by reading the source: this drives the REAL built `atlas` binary end to end
// (`runAtlas`, same harness as S33 — the ONE production caller of `runMineArms` is `cli.ts`'s `command ===
// 'mine'` branch, and this is that branch, over a real repo, over a subprocess) and reads the RAW
// `.atlas/staging.json` sidecar — never the command's stdout summary, which task #237 found misreports in
// some arm configurations.
//
// THE SHAPE THIS PROVES: `src/many.ts` references BOTH `util` exports (structural degree 2, committed
// ONCE — churn 1) and `src/hot.ts` references only ONE (structural degree 1, TOUCHED TWICE — churn 2,
// clears `HOTSPOT_MIN_CHURN`). With NO history signal (`defaultHistory()`, the pre-#243 shipped default),
// `createMine`'s personalization vector is the WHOLE structural frontier — both files are candidates, both
// have a valid `DEPENDS-ON: greetA` claim (they both reference it), so BOTH get staged (measured directly
// against this exact fixture before landing this test — see the WP return card; structural PPR did NOT
// reliably favour one over the other here, so RANK-1 alone is not a safe discriminator). With the real
// mined frontier wired (`createHistorySource`), GEN-15b's personalization vector is the CHURN/COUPLING
// frontier ALONE — `many.ts` (churn 1) is not a member of it at all, so it is never even PLANNED, let alone
// visited: only `hot.ts` can ever be staged. The discriminant this test pins is therefore the STAGED SET,
// not a single winner: {hot.ts} wired vs {hot.ts, many.ts} unwired.
//
// ZERO METERED MODEL SPEND — the same offline `echo` idiom S26/S33 use.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

const FILES = {
  "src/util.ts": "export function greetA(): string { return 'a'; }\nexport function greetB(): string { return 'b'; }\n",
  "src/many.ts":
    "import { greetA, greetB } from './util';\nexport function m(): string { return greetA() + greetB(); }\n",
  "src/hot.ts": "import { greetA } from './util';\nexport function h(): string { return greetA(); }\n",
}
const INDEX = [
  { path: "src/util.ts", defines: ["util/greetA().", "util/greetB()."] },
  { path: "src/many.ts", references: ["util/greetA().", "util/greetB()."] },
  { path: "src/hot.ts", references: ["util/greetA()."] },
]

let repo: FixtureRepo
let modelConfigPath: string
let modelConfigDir: string

beforeAll(() => {
  repo = makeFixtureRepo({ files: FILES, index: INDEX })
  // A SECOND commit touching ONLY `hot.ts`, changing BOTH its lines — `hot.ts` now has 2 touching commits
  // (churn 2, clears `HOTSPOT_MIN_CHURN`); `many.ts` has 1 (the initial commit only — below the bar, never
  // in the mined frontier), despite its higher structural degree. BOTH lines change (not merely appended
  // to) so blame for `hot.ts` moves OFF the initial commit entirely — `makeFixtureRepo` also commits
  // `.atlas/index.scip` + `.atlas/policy.json` + `.gitignore` in that same initial commit, and their
  // (fixed, never-touched-again) line count is enough on its own to trip `BLAME_CONCENTRATION_MAX` (GEN-15's
  // thin-history escape hatch) unless a later commit visibly moves SOME blame away from it — measured
  // directly against this exact fixture shape before landing (see the WP return card).
  repo.commit({
    "src/hot.ts":
      "// touched\nimport { greetA } from './util';\nexport function h(): string { const x = greetA(); return x; }\n",
  })
  modelConfigDir = mkdtempSync(join(tmpdir(), "atlas-s34-operator-"))
  modelConfigPath = join(modelConfigDir, "model.json")
  // `DEPENDS-ON: greetA` is a valid claim at EITHER site (both reference it) — a claim SETTLES regardless
  // of which site(s) are visited, so the staged SET is what distinguishes wired from unwired.
  writeFileSync(modelConfigPath, JSON.stringify({ roles: { propose: { cmd: "echo", args: ["DEPENDS-ON: greetA"] } } }))
})
afterAll(() => {
  repo?.cleanup()
  if (modelConfigDir) rmSync(modelConfigDir, { recursive: true, force: true })
})

describe("#243 — `atlas mine` (shipped binary) mines the HISTORY-DRIVEN frontier, not the whole structural set", () => {
  it("stages ONLY hot.ts (churned) — many.ts (unchurned) is never even PLANNED, let alone staged", () => {
    const mine = runAtlas(repo.repoPath, ["mine", "."], {
      ATLAS_MODEL_CONFIG: modelConfigPath,
      ATLAS_MINE_SLOT: "dependency",
    })
    expect(mine.exitCode).toBe(0)
    // TEETH ANCHOR: unwired, this run stages 2 (`hot.ts` AND `many.ts`) — measured before landing.
    expect(mine.stdout).toContain("genesis: seeded 1 candidate fact(s)")
    expect(mine.stdout).toContain("all 1 planned site(s)")

    // THE RAW SIDECAR, not the stdout summary (#237). `staging.json`'s `current` leg is a serialized `Map`
    // — `[[nodeKey, MintedFact], …]` — never the command's own rendered `site:` lines.
    const stagingPath = join(repo.repoPath, ".atlas", "staging.json")
    const staging = JSON.parse(readFileSync(stagingPath, "utf8")) as {
      current: ReadonlyArray<readonly [string, { primaryAnchor?: string }]>
    }
    const anchors = staging.current.map(([, f]) => f.primaryAnchor)
    expect(anchors).toEqual(["src/hot.ts"])
    expect(anchors).not.toContain("src/many.ts")
  })
})

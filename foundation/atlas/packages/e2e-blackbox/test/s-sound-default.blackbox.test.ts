// @atlas/e2e-blackbox — test/s-sound-default.blackbox.test.ts  (SOUND-DEFAULT-MINE — the default flip is REAL)
//
// The honest black-box proof that `atlas mine` now ships SOUND-by-default: a DEFAULT run (NO `ATLAS_MINE_SLOT`)
// drives ALL THREE arms — advisory PROSE + the two sound arms (dependency + count) — in ONE invocation, and
// the merged render exposes each arm. This is the subprocess counterpart to the in-process `mine-arms` unit
// suite: the multi-arm loop is not just wired in a test double, it reaches the operator over the real CLI door.
//
// NO LIVE MODEL, NO INDEX. With no operator config every arm's proposer is the honest fail-closed default, and
// with no `.atlas/index.scip` the structural frontier is empty — so all THREE passes run and each reports a
// 0-fact outcome with its OWN why-empty next-step (`atlas doctor index`). What is under test is (a) the LOOP +
// MERGE the default now performs, and (b) that the #129/#163 honesty leg survives per arm — never a dead end.
//
// The single-arm isolation the benchmark relies on (an explicit `ATLAS_MINE_SLOT` ⇒ exactly that arm,
// byte-identical to the old default) is proven separately — every other S-story pins its own arm, and the
// `mine-arms` unit suite proves the render equivalence.

import { rmSync } from "node:fs"
import { afterAll, describe, expect, it } from "vitest"

import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

// A bare repo with sources but NO index: the structural pass yields 0 sites, so each arm's why-empty names the
// structural cause and points at `atlas doctor index` (the honesty leg this story guards).
const FILES = {
  "src/util.ts": "export function greet(n: string): string {\n  return `hi ${n}`;\n}\n",
  "src/app.ts": "import { greet } from './util';\n\nexport function main(): string {\n  return greet('world');\n}\n",
}

let repo: FixtureRepo | undefined
const scratch: string[] = []
function bareRepo(): FixtureRepo {
  repo ??= makeFixtureRepo({ files: FILES })
  return repo
}

afterAll(() => {
  repo?.cleanup()
  while (scratch.length > 0) rmSync(scratch.pop()!, { recursive: true, force: true })
})

describe("SOUND-DEFAULT-MINE — a default `atlas mine` mines advisory + dependency + count in ONE run", () => {
  it("with NO ATLAS_MINE_SLOT the merged render names every arm (the ratified default flip is real)", () => {
    const run = runAtlas(bareRepo().repoPath, ["mine", "."]) // deliberately NO ATLAS_MINE_SLOT

    expect(run.exitCode).toBe(0)
    // The per-arm exposure line — the union total plus what each arm produced (foldArms multi-arm path).
    expect(run.stdout).toContain("mine: arms — advisory")
    // Each arm ran and printed its own FULL body under a slot heading — advisory PROSE alongside the two
    // SOUND arms, no env var required to reach them.
    expect(run.stdout).toContain("arm: advisory")
    expect(run.stdout).toContain("arm: dependency")
    expect(run.stdout).toContain("arm: count")
    // NOT the single-pass shape: the old default emitted exactly one un-suffixed genesis line and no `arm:`
    // headings, so this is the observable difference the flip introduces.
    expect(run.stdout).toContain("[union]")
    // THE HONESTY LEG (#129/#163): a 0-site run must still point the operator at the next step, ONCE PER ARM —
    // never a dead-end `coverage CLOSES 0 sites` with no guidance. This repo has no `.atlas/index.scip`, so
    // every arm's why-empty names the structural cause and the command that produces the index.
    const armHeadings = run.stdout.split("\n").filter((l) => l.startsWith("arm: "))
    expect(armHeadings).toHaveLength(3)
    const guidance = run.stdout.split("\n").filter((l) => l.includes("atlas doctor index"))
    expect(guidance).toHaveLength(3) // the next-step is present under each of the three arms
  })
})

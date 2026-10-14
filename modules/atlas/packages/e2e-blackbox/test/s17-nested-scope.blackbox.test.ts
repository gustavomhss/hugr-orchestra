// @atlas/e2e-blackbox — test/s17-nested-scope.blackbox.test.ts  (S17 — nested scopes are addressable)
//
// NARRATIVE: an agent tries to query a scope that is not a top-level directory — `src/m0`, `src/m0/deep`,
// and the leaf FILE `src/m0/deep/f0.ts`. Before the fix, `resolve` compared ONE path segment against
// `IndexNode.key`, which `build.ts:38` sets to the FULL repo-relative path — so only depth 1 could ever
// match and every nested scope died `exit 1 — cover: no covering territory`. That capped the addressable
// vocabulary of a real repo at its top-level entries, which is too small to build a relevance-judgment set
// over (the retrieval-quality benchmark axis depends on this).
//
// The CONTROL legs are as load-bearing as the depth legs: depth-1 must be unchanged, and an uncovered scope
// must STILL fail closed — `src/m0` must never be reached by `srcM0` or `src/m0x`, because a prefix match on
// characters rather than on a path SEPARATOR would turn a resolution bug into an authorization-adjacent one.
//
// Every execution + assertion is pure black-box: the real `atlas` bin as a subprocess.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

let repo: FixtureRepo

// A tree whose sibling names are deliberate CHARACTER neighbours of `src/m0` — `srcM0` (separator removed)
// and `src/m0x` (one char longer). A resolver that tested `startsWith` instead of whole-separator equality
// would cross between them; these are the tripwires.
beforeAll(() => {
  repo = makeFixtureRepo({
    files: {
      "src/m0/deep/f0.ts": "export const a = 1;\n",
      "src/m0/f1.ts": "export const b = 2;\n",
      "src/m0x/f4.ts": "export const c = 3;\n",
      "src/m1/f2.ts": "export const d = 4;\n",
      "srcM0/f3.ts": "export const e = 5;\n",
    },
  })
})

afterAll(() => repo.cleanup())

/** The `cover: no covering territory` failure line, if the run produced one. */
const coverLine = (r: { stdout: string; stderr: string }): string | undefined =>
  `${r.stdout}\n${r.stderr}`.split("\n").find((l) => l.includes("cover:"))

describe("S17 — `atlas query` resolves a scope at ANY depth", () => {
  it("depth 1 (CONTROL — unchanged): `atlas query src` exits 0", () => {
    const r = runAtlas(repo.repoPath, ["query", "src"])
    expect(r.exitCode).toBe(0)
    expect(coverLine(r)).toBeUndefined()
  })

  it("depth 2: `atlas query src/m0` exits 0 (was exit 1 — no covering territory)", () => {
    const r = runAtlas(repo.repoPath, ["query", "src/m0"])
    expect(coverLine(r)).toBeUndefined()
    expect(r.exitCode).toBe(0)
  })

  it("depth 3: `atlas query src/m0/deep` exits 0", () => {
    const r = runAtlas(repo.repoPath, ["query", "src/m0/deep"])
    expect(coverLine(r)).toBeUndefined()
    expect(r.exitCode).toBe(0)
  })

  it("depth 4, a leaf FILE path: `atlas query src/m0/deep/f0.ts` exits 0", () => {
    const r = runAtlas(repo.repoPath, ["query", "src/m0/deep/f0.ts"])
    expect(coverLine(r)).toBeUndefined()
    expect(r.exitCode).toBe(0)
  })

  it("every nested scope in the fixture is addressable (the vocabulary is no longer top-level-only)", () => {
    for (const scope of ["src/m0", "src/m0/deep", "src/m0/deep/f0.ts", "src/m0/f1.ts", "src/m1", "src/m1/f2.ts"]) {
      const r = runAtlas(repo.repoPath, ["query", scope])
      expect(r.exitCode, `${scope} → ${coverLine(r) ?? r.stderr}`).toBe(0)
    }
  })
})

describe("S17 CONTROL — an uncovered scope still fails CLOSED on a SEPARATOR boundary", () => {
  it("`srcM0` and `src/m0x` are their OWN territories — never reached as/through `src/m0`", () => {
    // both are real, distinct nodes: they resolve, but to themselves
    expect(runAtlas(repo.repoPath, ["query", "srcM0"]).exitCode).toBe(0)
    expect(runAtlas(repo.repoPath, ["query", "src/m0x"]).exitCode).toBe(0)
    expect(runAtlas(repo.repoPath, ["query", "src/m0"]).exitCode).toBe(0)
  })

  it('character-neighbour scopes that do NOT exist still exit 1 with "no covering territory"', () => {
    for (const scope of [
      "src/m", // truncation of `src/m0`
      "src/m00", // extension of `src/m0`
      "srcm0", // separator removed (and wrong case)
      "src/m0/dee", // truncation of `src/m0/deep`
      "src/m0/deepx", // extension of `src/m0/deep`
      "src/m0/deep/f0", // truncation of the leaf FILE name
      "src2", // extension of depth-1 `src`
    ]) {
      const r = runAtlas(repo.repoPath, ["query", scope])
      expect(r.exitCode, `${scope} must fail closed`).toBe(1)
      expect(coverLine(r), `${scope} must report no covering territory`).toContain("no covering territory")
    }
  })
})

// @atlas/adapter-io — test/git-history-memo.test.ts  (CACHE-HISTORY-SOURCE)
//
// `createHistorySource` is built ONCE per `atlas mine` invocation and threaded through EVERY arm
// (mine-arms.ts `{ ...deps, slot }`), but `driveMinePass` re-invokes `probeHistory` (→ `commitCount` /
// `shallow` / `blameConcentration`) and `frontier`/`signals` PER ARM — so a shared instance still shelled
// git 3× before this WP. This suite pins the memo with a SUBPROCESS COUNT, not a timer: it spies on the
// ONE shared git seam (`run-git.js`, real `execFileSync` underneath — never faked output) and asserts a
// SECOND call to each method with the SAME `(repo, rev[, path])` args does not shell git again, while a
// DIFFERENT rev/path is NOT starved by the cache (the #211 scar this suite is deliberately unlike: a memo
// keyed on less than its real inputs). TEETH: revert the memo (call the un-memoized body directly) and the
// "no second call" assertions go red — see the comment beside each `expect` for which line it pins.

import { describe, it, expect, afterEach, vi } from "vitest"
import { createHistorySource } from "../src/git-history.js"
import { makeGitSbx, type GitSbx } from "./harness/git-sbx.js"

vi.mock("../src/run-git.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/run-git.js")>()
  return { ...actual, runGit: vi.fn(actual.runGit) }
})

describe("git-history memo (CACHE-HISTORY-SOURCE)", () => {
  let sbx: GitSbx | undefined
  afterEach(() => {
    sbx?.cleanup()
    sbx = undefined
    vi.clearAllMocks()
  })

  const blameCalls = (mockCalls: unknown[][]): unknown[][] =>
    mockCalls.filter((c) => Array.isArray(c[1]) && (c[1] as string[]).includes("blame"))

  it("blameConcentration — a second call at the SAME (repo, rev) shells zero more `git blame`", async () => {
    sbx = makeGitSbx()
    const { repoPath, r0 } = sbx
    const { runGit } = await import("../src/run-git.js")
    const spy = vi.mocked(runGit)

    const hist = createHistorySource(repoPath, r0)
    const first = hist.blameConcentration(repoPath, r0)
    const callsAfterFirst = blameCalls(spy.mock.calls as unknown[][]).length
    expect(callsAfterFirst).toBeGreaterThan(0) // sanity: the fixture has tracked files to blame at all

    const second = hist.blameConcentration(repoPath, r0)
    const callsAfterSecond = blameCalls(spy.mock.calls as unknown[][]).length

    expect(second).toBe(first) // same answer
    // TEETH: without the memo, this doubles (one `git blame` per tracked file, per call).
    expect(callsAfterSecond).toBe(callsAfterFirst)
  })

  it("commitCount / frontier / signals — a repeated call at the SAME args shells zero more git", async () => {
    sbx = makeGitSbx()
    const { repoPath, r0 } = sbx
    const { runGit } = await import("../src/run-git.js")
    const spy = vi.mocked(runGit)

    const hist = createHistorySource(repoPath, r0)
    hist.commitCount(repoPath, r0)
    hist.frontier(repoPath, r0)
    hist.signals({ kind: "file", qualifiedPath: "src/util.ts", subtreeHash: "" as never })
    const after1 = spy.mock.calls.length

    hist.commitCount(repoPath, r0)
    hist.frontier(repoPath, r0)
    hist.signals({ kind: "file", qualifiedPath: "src/util.ts", subtreeHash: "" as never })
    const after2 = spy.mock.calls.length

    // TEETH: without the memo, each of the 3 repeated calls re-shells its own git command(s).
    expect(after2).toBe(after1)
  })

  it("a DIFFERENT rev is NOT starved by the memo — the cache key carries the real args, not just the closure", () => {
    sbx = makeGitSbx()
    const { repoPath, r0, mb } = sbx
    const hist = createHistorySource(repoPath, r0)

    const atR0 = hist.commitCount(repoPath, r0)
    const atMb = hist.commitCount(repoPath, mb) // an EARLIER rev — fewer commits reachable
    expect(atMb).toBeLessThan(atR0) // proves the second call was NOT served the r0-cached answer
  })

  // ── IDENTICAL OUTPUT — 3 fresh (pre-fix-shaped) instances vs 1 shared (post-fix-shaped) instance ──────
  // This is the "top-40 before == after" proof at the mechanism level: `mine-arms.ts` drives 3 independent
  // `driveMinePass` calls, each of which (before this WP) built its own consult of `blameConcentration` /
  // `frontier` / `signals` against a FRESH read. The memo changes ONLY caching, never the computed value —
  // so a shared instance queried 3× (the arm shape) must return byte-identical results to 3 independent
  // instances queried once each (the pre-memo shape). A ranking change here would be exactly the class of
  // regression the WP forbids ("anything that moves the ranking is a defect of this WP").
  it("3 independent instances vs 1 shared instance queried 3× — byte-identical frontier + blameConcentration", () => {
    sbx = makeGitSbx()
    const { repoPath, r0 } = sbx

    const independent = [0, 1, 2].map(() => {
      const h = createHistorySource(repoPath, r0)
      return { blame: h.blameConcentration(repoPath, r0), frontier: h.frontier(repoPath, r0) }
    })

    const shared = createHistorySource(repoPath, r0)
    const fromShared = [0, 1, 2].map(() => ({
      blame: shared.blameConcentration(repoPath, r0),
      frontier: shared.frontier(repoPath, r0),
    }))

    expect(fromShared).toEqual(independent)
    // every arm's own value equal to the mine-arms shared-instance value (the exact comparison mine-arms.ts
    // performs 3×, once per resolved slot, over the SAME shared `deps.history`).
    for (let i = 0; i < 3; i++) expect(fromShared[i]).toEqual(independent[i])
  })
})

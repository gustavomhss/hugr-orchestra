// @atlas/genesis — test/run-failure.test.ts  (genesis-hardening A3 — a caught run error is RECORDED, not erased)
//
// `genesis`/`resume`/`rerun` stay TOTAL (GEN-8c: a report, never a throw), but the empty report a caught
// `plan`/`upsert` error degrades to was byte-identical to a clean zero-findings run. `report.failure` now
// carries the error. A `visit` throw is NOT a failure: it is the resumable interruption GEN-8 defines.

import { describe, expect, it } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { Delta } from "@atlas/index"
import { makeRunController } from "../src/run-controller.js"
import type { ControllerDeps, Plan } from "../src/run-controller.js"
import type { Candidate, Fact, Skeleton } from "../src/types.js"

const cand = (key: string, rank: number): Candidate => ({
  site: { kind: "file", qualifiedPath: `src/${key}.ts`, subtreeHash: asSubtreeHash(key) },
  rank,
  ppr: 1 / rank,
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
})
const SITES = [cand("a", 1), cand("b", 2), cand("c", 3)]
const PLAN: Plan = { malformed: false, sites: SITES }
const NO_DELTA: Delta = { idChanged: false, stateChanged: false, changedBuckets: ["src/a.ts"] }
const SKELETON = {} as unknown as Skeleton

/** Seams that complete cleanly unless told otherwise; every site abstains (no facts). */
const deps = (over: Partial<ControllerDeps> = {}): ControllerDeps => ({
  plan: () => PLAN,
  visit: () => [],
  upsert: (incoming: readonly Fact[]) => incoming,
  changed: () => NO_DELTA,
  handoffTo: () => {},
  ...over,
})

const throwingPlan = (): Plan => {
  throw new Error("corrupt object")
}
const throwingUpsert = (): readonly Fact[] => {
  throw new TypeError("staging door exploded")
}

describe("genesis-hardening A3 — a caught run error rides `report.failure`", () => {
  it("a throwing plan ⇒ genesis and rerun return a report naming the error (still never a throw)", () => {
    const api = makeRunController(deps({ plan: throwingPlan }))
    const g = api.genesis("repo", "rev")
    expect(g.failure).toEqual({ name: "Error", message: "corrupt object" })
    expect(g.resumeToken).toEqual({ lastCompletedRank: -1 })
    expect(g.seeded).toEqual([])
    expect(api.rerun("repo", "rev", SKELETON).failure).toEqual({ name: "Error", message: "corrupt object" })
  })

  it("a throwing upsert ⇒ the genesis report names it, with its own error name", () => {
    const g = makeRunController(deps({ upsert: throwingUpsert })).genesis("repo", "rev")
    expect(g.failure).toEqual({ name: "TypeError", message: "staging door exploded" })
  })

  it("a throwing upsert during resume ⇒ the resume report names it", () => {
    let upserts = 0
    let visits = 0
    const api = makeRunController(
      deps({
        // the first leg is interrupted at site b (a resumable partial), the resume leg then fails to write
        visit: (c) => {
          visits += 1
          if (c.rank === 2 && visits === 2) throw new Error("interrupted at b")
          return []
        },
        upsert: (incoming) => {
          upserts += 1
          if (upserts > 1) throw new Error("disk full")
          return incoming
        },
      }),
    )
    const first = api.genesis("repo", "rev")
    expect(first.failure).toBeUndefined()
    expect(first.resumeToken).toEqual({ lastCompletedRank: 1 })
    const resumed = api.resume(first.resumeToken!)
    expect(resumed.failure).toEqual({ name: "Error", message: "disk full" })
  })

  it("an interrupted visit is NOT a failure — the GEN-8 partial with its resumeToken is unchanged", () => {
    const g = makeRunController(
      deps({
        visit: (c) => {
          if (c.rank === 2) throw new Error("killed")
          return []
        },
      }),
    ).genesis("repo", "rev")
    expect(g.failure).toBeUndefined()
    expect(g.resumeToken).toEqual({ lastCompletedRank: 1 })
  })

  it("a clean run and a resume with no persisted run carry no failure", () => {
    const api = makeRunController(deps())
    const g = api.genesis("repo", "rev")
    expect(g.failure).toBeUndefined()
    expect(g.resumeToken).toBeUndefined()
    expect(makeRunController(deps()).resume({ lastCompletedRank: 5 }).failure).toBeUndefined()
  })
})

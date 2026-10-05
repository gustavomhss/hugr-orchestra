// @atlas/genesis — test/wp-8.30-gen.heldout.test.ts  (WP-8.30.GEN — HELD-OUT gate, reviewer-authored)
//
// Cold transcription of the held_out:true `-2` goldens SCN-GEN-7a-2..7c-2 + 8a-2..8c-2 from
// docs/requirements/goldens-gen.md. Same oracle surface (../src/run-controller.js); DIFFERENT fixtures than
// `-1` (beacon: {G1..G4}, rev-1e2 changes 2 files, h1..h5 with a kill after h3, a truncated-packfile clone,
// a distinct malformed-corner fuzz family). Probes over-fit to the visible `-1` fixtures. No src changes.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asNodeKey } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { Delta } from "@atlas/index"
import type { Candidate, Fact, MinedSignals } from "@atlas/genesis"
import type { Skeleton } from "@atlas/genesis"
import { makeRunController, type Plan, type ControllerDeps } from "../src/run-controller.js"

const ZERO: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }
const siteOf = (file: string, id: string): StructRef => ({
  kind: "symbol",
  qualifiedPath: `${file}::${id}`,
  subtreeHash: asSubtreeHash(`st-${file}-${id}`),
})
const cand = (file: string, id: string, ppr: number, rank: number): Candidate => ({
  site: siteOf(file, id),
  signals: ZERO,
  ppr,
  rank,
})
const factFor = (c: Candidate): Fact =>
  ({
    kind: "advisory",
    id: asNodeKey(`nk-${c.site.qualifiedPath}`),
    tier: "T2",
    claimNorm: `claim@${c.site.qualifiedPath}`,
    grounding: { entries: [{ anchor: c.site, path: c.site.qualifiedPath }] },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }) as unknown as Fact
const SKELETON = { axes: {}, manifest: { territories: [] } } as unknown as Skeleton

interface Harness {
  visited: string[]
  grounded: Map<string, Fact>
  handoffs: number
}
const harness = (): Harness => ({ visited: [], grounded: new Map(), handoffs: 0 })
const deps = (
  h: Harness,
  opts: { plan?: Plan; throwAt?: string; throwOnce?: boolean; delta?: Delta } = {},
): ControllerDeps => {
  const thrown = new Set<string>()
  return {
    plan: () => opts.plan ?? { malformed: false, skeleton: SKELETON, sites: [] },
    visit: (c) => {
      const key = c.site.qualifiedPath.split("::")[1] ?? c.site.qualifiedPath
      h.visited.push(key)
      if (opts.throwAt === key && !(opts.throwOnce && thrown.has(key))) {
        thrown.add(key)
        throw new Error(`interrupted at ${key}`)
      }
      return [factFor(c)]
    },
    upsert: (incoming) => {
      for (const f of incoming) h.grounded.set(f.id as unknown as string, f)
      return [...h.grounded.values()]
    },
    changed: () => opts.delta ?? { idChanged: true, stateChanged: true, changedBuckets: [] },
    handoffTo: () => {
      h.handoffs += 1
    },
  }
}
const planOf = (sites: readonly Candidate[], malformed = false): Plan => ({ malformed, skeleton: SKELETON, sites })

describe("WP-8.30.GEN held-out — GEN-7 (beacon)", () => {
  it("SCN-GEN-7a-2 — beacon genesis hands off exactly once, no sweeper (visits==frontier)", () => {
    const sites = [
      cand("a.ts", "g1", 0.9, 1),
      cand("b.ts", "g2", 0.8, 2),
      cand("c.ts", "g3", 0.7, 3),
      cand("d.ts", "g4", 0.6, 4),
    ]
    const h = harness()
    makeRunController(deps(h, { plan: planOf(sites) })).genesis("beacon", "rev")
    expect(h.handoffs).toBe(1)
    expect(h.visited).toEqual(["g1", "g2", "g3", "g4"])
  })

  it("SCN-GEN-7b-2 — genesis∘genesis on rev-1d0a upserts {G1..G4}: 0 duplicates", () => {
    const sites = [
      cand("a.ts", "G1", 0.9, 1),
      cand("b.ts", "G2", 0.8, 2),
      cand("c.ts", "G3", 0.7, 3),
      cand("d.ts", "G4", 0.6, 4),
    ]
    const h = harness()
    const api = makeRunController(deps(h, { plan: planOf(sites) }))
    expect(api.genesis("beacon", "rev-1d0a").seeded.length).toBe(4)
    expect(api.genesis("beacon", "rev-1d0a").seeded.length).toBe(4)
    expect(h.grounded.size).toBe(4) // append would be 8
  })

  it("SCN-GEN-7c-2 — rev-1e2 changes exactly 2 files → only those 2 buckets re-indexed", () => {
    const sites = [
      cand("a.ts", "sa", 0.9, 1),
      cand("b.ts", "sb", 0.8, 2),
      cand("c.ts", "sc", 0.7, 3),
      cand("d.ts", "sd", 0.6, 4),
    ]
    const h = harness()
    const delta: Delta = { idChanged: true, stateChanged: true, changedBuckets: ["b.ts", "d.ts"] }
    makeRunController(deps(h, { plan: planOf(sites), delta })).rerun("beacon", "rev-1e2", SKELETON)
    expect(h.visited.sort()).toEqual(["sb", "sd"]) // a.ts, c.ts untouched
  })
})

describe("WP-8.30.GEN held-out — GEN-8 (beacon)", () => {
  it("SCN-GEN-8a-2 — killed after h1,h2,h3 of [h1..h5]; resume continues at h4 (h1-3 not re-called)", () => {
    const sites = [
      cand("a.ts", "h1", 0.9, 1),
      cand("b.ts", "h2", 0.8, 2),
      cand("c.ts", "h3", 0.7, 3),
      cand("d.ts", "h4", 0.6, 4),
      cand("e.ts", "h5", 0.5, 5),
    ]
    const h = harness()
    // kill AT h4 so h1,h2,h3 complete; heal on resume.
    const api = makeRunController(deps(h, { plan: planOf(sites), throwAt: "h4", throwOnce: true }))
    const partial = api.genesis("beacon", "rev")
    expect(partial.resumeToken?.lastCompletedRank).toBe(3) // last completed = h3
    expect(h.handoffs).toBe(0)
    h.visited.length = 0
    const resumed = api.resume({ lastCompletedRank: 3 })
    expect(h.visited).toEqual(["h4", "h5"]) // h1,h2,h3 NOT re-called
    expect(resumed.resumeToken).toBeUndefined()
    expect(h.handoffs).toBe(1)
  })

  it("SCN-GEN-8b-2 — truncated-packfile clone → honest partial skeleton + resumeToken, no fabricated full", () => {
    const h = harness()
    // most objects readable (2 reachable sites) + one corrupt pack object ⇒ malformed flagged, partial.
    const plan = planOf([cand("a.ts", "r1", 0.9, 1), cand("b.ts", "r2", 0.8, 2)], true)
    const report = makeRunController(deps(h, { plan })).genesis("beacon", "truncated")
    expect(report.resumeToken).toBeDefined()
    expect(report.seeded.length).toBe(2) // reachable portion, not a fabricated full skeleton
    expect(h.handoffs).toBe(0) // partial never hands off
  })

  it("SCN-GEN-8c-2 — distinct malformed-corner fuzz family → 0 exceptions on every entry point", () => {
    const corners: ControllerDeps[] = [
      {
        ...deps(harness()),
        plan: () => {
          throw new Error("symlink cycle")
        },
      },
      {
        ...deps(harness()),
        plan: () => {
          throw new Error("zero-byte blob")
        },
        changed: () => {
          throw new Error("missing submodule commit")
        },
      },
      { ...deps(harness(), { plan: planOf([cand("x.ts", "crlf", 0.9, 1)]), throwAt: "crlf" }) },
      { ...deps(harness(), { plan: planOf([], true) }) },
    ]
    for (const c of corners) {
      const api = makeRunController(c)
      expect(() => api.genesis("beacon", "fuzz")).not.toThrow()
      expect(() => api.rerun("beacon", "fuzz", SKELETON)).not.toThrow()
      expect(() => api.resume({ lastCompletedRank: 999 })).not.toThrow()
      // each returns a structured report
      expect(api.genesis("beacon", "fuzz")).toHaveProperty("seeded")
    }
  })
})

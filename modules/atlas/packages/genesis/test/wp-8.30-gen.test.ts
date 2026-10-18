// @atlas/genesis — test/wp-8.30-gen.test.ts  (WP-8.30.GEN)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the run controller (resume & robustness):
//   GEN-7 (one-time, then hand off; idempotent + incremental re-run: SCN-GEN-7a..7c-1) ·
//   GEN-8 (total & resumable: SCN-GEN-8a..8c-1).
// The facet is imported DIRECTLY from ../src/run-controller.js (the barrel is wired by the lead at SEAL).
// The S0/S1 frontier build (`plan`), the S2 per-site driver (`visit`), the KNOW-15 upsert write-decision,
// the INDEX-12 `changed` delta, and the born-from-work hand-off are CALLED via injected seams (card
// exclusions: "it calls them") — modelled here as fakes so the controller's CHECKPOINT/RESUME, its
// MALFORMED-DEGRADE totality, and its IDEMPOTENT/INCREMENTAL hand-off are the units under test. Grounded
// identity rides the SEALED @atlas/kernel mint (`asSubtreeHash`/`asNodeKey`), never a hand-rolled digest.
// Held-out `-2` fixtures are NOT transcribed.
//
// FLAG: interface_contract digest is `<filled-at-freeze>` (simulated) — resolved by disciplined judgment,
// not a real freeze hash.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asNodeKey } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { Delta } from "@atlas/index"
import type { Candidate, Fact, MinedSignals } from "@atlas/genesis"
import type { Skeleton } from "@atlas/genesis"
import {
  makeRunController,
  defaultBudget,
  bucketOf,
  CEILING_CAP,
  type Plan,
  type ControllerDeps,
} from "../src/run-controller.js"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────

const ZERO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }

/** A site whose file (bucket) is `file` and symbol is `id` — the bucket is the part before `::`. */
const siteOf = (file: string, id: string): StructRef => ({
  kind: "symbol",
  qualifiedPath: `${file}::${id}`,
  subtreeHash: asSubtreeHash(`st-${file}-${id}`),
})

const cand = (file: string, id: string, ppr: number, rank: number): Candidate => ({
  site: siteOf(file, id),
  signals: ZERO_SIGNALS,
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

/** A record of everything the controller called the seams with — the observation surface for the teeth. */
interface Harness {
  readonly visited: string[] // qualifiedPath per visit, in call order
  readonly grounded: Map<string, Fact> // the KNOW-15 grounded store, keyed by fact id (upsert = idempotent)
  handoffs: number // born-from-work hand-off count (GEN-7a: exactly one on a complete run)
}
const harness = (): Harness => ({ visited: [], grounded: new Map(), handoffs: 0 })

/** Build the injected seams over a harness. `plan` returns the given frontier; `throwAt` makes `visit`
 *  throw at a named site (a mid-run interruption) — `throwOnce` throws only the FIRST time (so a resume
 *  over the same instance sees a healed site); `changed` returns the given delta. */
const deps = (
  h: Harness,
  opts: {
    plan?: Plan
    throwAt?: string
    throwOnce?: boolean
    delta?: Delta
  } = {},
): ControllerDeps => {
  const thrown = new Set<string>()
  return {
    plan: (_repo, _rev, _scope) => opts.plan ?? { malformed: false, skeleton: SKELETON, sites: [] },
    visit: (c) => {
      const key = c.site.qualifiedPath.split("::")[1] ?? c.site.qualifiedPath
      h.visited.push(key)
      const shouldThrow = opts.throwAt === key && !(opts.throwOnce && thrown.has(key))
      if (shouldThrow) {
        thrown.add(key)
        throw new Error(`interrupted at ${key}`) // a killed / corrupt site
      }
      return [factFor(c)]
    },
    // KNOW-15 write-decision: idempotent upsert by fact id (0 duplicates on a re-run).
    upsert: (incoming) => {
      for (const f of incoming) h.grounded.set(f.id as unknown as string, f)
      return [...h.grounded.values()]
    },
    changed: (_prior, _rev) => opts.delta ?? { idChanged: true, stateChanged: true, changedBuckets: [] },
    handoffTo: () => {
      h.handoffs += 1
    },
  }
}

const planOf = (sites: readonly Candidate[], malformed = false): Plan => ({
  malformed,
  skeleton: SKELETON,
  sites,
})

// ── GEN-7 — one-time, then hand off; idempotent + incremental re-run ─────────────────────────────────────

describe("GEN-7 — genesis hands off to born-from-work; a re-run is idempotent + incremental", () => {
  it("SCN-GEN-7a-1: genesis transfers control to born-from-work and stands no sweeper", () => {
    const sites = [cand("a.ts", "s1", 0.9, 1), cand("b.ts", "s2", 0.8, 2), cand("c.ts", "s3", 0.7, 3)]
    const h = harness()
    const api = makeRunController(deps(h, { plan: planOf(sites) }))
    api.genesis("repo", "rev")

    // control handed off EXACTLY once — teeth: a standing sweeper would hand off 0 times (never terminates).
    expect(h.handoffs).toBe(1)
    // no daemon re-sweep — each ranked site visited exactly once, none re-processed.
    expect(h.visited).toEqual(["s1", "s2", "s3"])
    expect(h.visited.length).toBe(sites.length)
  })

  it("SCN-GEN-7b-1: genesis∘genesis upserts by id — 0 duplicate facts", () => {
    const sites = [cand("a.ts", "F1", 0.9, 1), cand("b.ts", "F2", 0.8, 2), cand("c.ts", "F3", 0.7, 3)]
    const h = harness()
    const api = makeRunController(deps(h, { plan: planOf(sites) }))

    const first = api.genesis("repo", "rev")
    expect(first.seeded.length).toBe(3) // {F1,F2,F3}
    const second = api.genesis("repo", "rev") // re-run on the same rev

    // upsert by id ⇒ genesis∘genesis ≡ genesis on the grounded set — teeth: an append would give 6.
    expect(second.seeded.length).toBe(3)
    expect(h.grounded.size).toBe(3)
  })

  it("SCN-GEN-7c-1: a re-run re-indexes only the changed files", () => {
    // frontier spans 3 files; rev-d1 changes exactly 1 file (b.ts).
    const sites = [cand("a.ts", "sa", 0.9, 1), cand("b.ts", "sb", 0.8, 2), cand("c.ts", "sc", 0.7, 3)]
    const h = harness()
    const delta: Delta = { idChanged: true, stateChanged: true, changedBuckets: ["b.ts"] }
    const api = makeRunController(deps(h, { plan: planOf(sites), delta }))

    api.rerun("repo", "rev-d1", SKELETON)

    // only b.ts's site re-indexed — teeth: a whole-repo re-run would visit all three.
    expect(h.visited).toEqual(["sb"])
  })

  it("SCN-GEN-7c-1 (no-op): an unchanged rev re-indexes nothing", () => {
    const sites = [cand("a.ts", "sa", 0.9, 1), cand("b.ts", "sb", 0.8, 2)]
    const h = harness()
    const delta: Delta = { idChanged: false, stateChanged: false, changedBuckets: [] }
    const api = makeRunController(deps(h, { plan: planOf(sites), delta }))
    api.rerun("repo", "rev", SKELETON)
    expect(h.visited).toEqual([]) // 0 changed buckets ⇒ 0 re-index work
  })
})

// ── GEN-8 — total & resumable ─────────────────────────────────────────────────────────────────────────

describe("GEN-8 — an interrupted run resumes from the last site; malformed input never throws", () => {
  it("SCN-GEN-8a-1: an interrupted run resumes from the last completed site", () => {
    const sites = [
      cand("a.ts", "s1", 0.9, 1),
      cand("b.ts", "s2", 0.8, 2),
      cand("c.ts", "s3", 0.7, 3),
      cand("d.ts", "s4", 0.6, 4),
    ]
    // the run is killed AT s3 (s1,s2 complete first) — the controller catches it and emits a resume cursor.
    // `throwOnce` heals the site so the SAME controller's resume replays it deterministically.
    const h = harness()
    const api = makeRunController(deps(h, { plan: planOf(sites), throwAt: "s3", throwOnce: true }))
    const partial = api.genesis("repo", "rev")

    expect(h.visited).toEqual(["s1", "s2", "s3"]) // s3 attempted, then thrown
    expect(partial.resumeToken?.lastCompletedRank).toBe(2) // last COMPLETED site = s2
    expect(h.handoffs).toBe(0) // an interrupted run does NOT hand off — it is not done

    // restart the SAME controller with the persisted cursor — the healed site now completes.
    expect(partial.resumeToken).toBeDefined()
    h.visited.length = 0 // clear the pre-kill observation; measure only the resume
    const resumed = api.resume({ lastCompletedRank: 2 })

    expect(h.visited).toEqual(["s3", "s4"]) // resumes at s3 — s1,s2 NOT re-called (teeth)
    expect(resumed.resumeToken).toBeUndefined() // the resumed run completed
    expect(h.handoffs).toBe(1) // control handed off after completion
  })

  it("SCN-GEN-8b-1: a malformed rev yields an honest empty/partial skeleton + resumeToken", () => {
    const h = harness()
    // reachable portion = 1 site skeletonized; the rest is missing (malformed flagged).
    const partialPlan = planOf([cand("a.ts", "reachable", 0.9, 1)], true)
    const api = makeRunController(deps(h, { plan: partialPlan }))

    const report = api.genesis("repo", "deadbeef")
    expect(report.resumeToken).toBeDefined() // partial ⇒ carries a resume cursor
    expect(report.seeded.length).toBe(1) // the reachable portion is honestly skeletonized
    expect(h.handoffs).toBe(0) // a malformed/partial run does not hand off (not complete)
  })

  it("SCN-GEN-8b-1 (empty): a fully-malformed rev yields an empty skeleton, not a fabricated full one", () => {
    const h = harness()
    const api = makeRunController(deps(h, { plan: planOf([], true) }))
    const report = api.genesis("repo", "deadbeef")
    expect(report.seeded.length).toBe(0) // teeth: no invented nodes for unreadable objects
    expect(report.resumeToken).toBeDefined()
  })

  it("SCN-GEN-8c-1: every malformed corner returns a report — 0 exceptions thrown", () => {
    // a corner-biased stream: plan that throws, plan flagged malformed, a corrupt-object site that throws.
    const throwingPlan: ControllerDeps = {
      ...deps(harness()),
      plan: () => {
        throw new Error("corrupt object")
      },
    }
    const corruptSite: ControllerDeps = {
      ...deps(harness(), { plan: planOf([cand("x.ts", "c1", 0.9, 1)]), throwAt: "c1" }),
    }

    // every entry point over every corner returns a structured report — never a throw (GEN-8c totality).
    expect(() => makeRunController(throwingPlan).genesis("repo", "rev")).not.toThrow()
    expect(() => makeRunController(throwingPlan).rerun("repo", "rev", SKELETON)).not.toThrow()
    expect(() => makeRunController(corruptSite).genesis("repo", "rev")).not.toThrow()
    expect(() => makeRunController(deps(harness())).resume({ lastCompletedRank: 5 })).not.toThrow()

    const r = makeRunController(throwingPlan).genesis("repo", "rev")
    expect(r.resumeToken).toBeDefined() // a structured partial, not an exception
    const c = makeRunController(corruptSite).genesis("repo", "rev")
    expect(c.resumeToken).toBeDefined()
  })
})

// ── seam/helper discipline ─────────────────────────────────────────────────────────────────────────────

describe("run-controller helpers", () => {
  it("defaultBudget caps the ceiling at min(frontier, 200) with all deepening loops off", () => {
    expect(defaultBudget(4).ceiling).toBe(4)
    expect(defaultBudget(500).ceiling).toBe(CEILING_CAP)
    const d = defaultBudget(10).deepening
    expect([d.review.enabled, d.enrich.enabled, d.expand.enabled]).toEqual([false, false, false])
  })

  it("bucketOf names the site file (the INDEX-12 change unit)", () => {
    expect(bucketOf(cand("pkg/foo.ts", "foo", 0.5, 1))).toBe("pkg/foo.ts")
  })

  it("handoff() calls born-from-work exactly once and returns (no standing sweeper)", () => {
    const h = harness()
    const api = makeRunController(deps(h))
    api.handoff()
    expect(h.handoffs).toBe(1)
  })
})

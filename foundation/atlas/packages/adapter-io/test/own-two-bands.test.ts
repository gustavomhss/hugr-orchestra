// @atlas/adapter-io — test/own-two-bands.test.ts  (REQ-RETR-12m — `own` serves the two bands, not one)
//
// THE TEETH FOR A BOUND THAT OUTLIVED ITS REASON. `own-source.ts` applied `atLeastT1` (TOOLS-6) to BOTH
// fact sections, so `atlas own` served `tier≥T1` only. MEASURED on this repository's own mined store — 199
// facts, all `T2` — through the built binary:
//
//   atlas own   packages/adapter-io/src/policy.ts  ->  0 invariant(s), 0 gotcha(s)
//   atlas query packages/adapter-io/src/policy.ts  ->  advisory T2 b977326… [FRESH]: "`scopeOwnsAnchor` …"
//
// Same store, same binary, two read doors disagreeing about what the store contains. The bound's own
// justification had expired: it read "a `T2` … that `atlas query` is correctly declining to show", and
// ADR-0013 (owner-ratified 2026-08-03) made `query` serve `T2` in a separately capped ADVISORY band.
//
// WHAT IS PINNED HERE, and why each one is a different failure:
//   1. the GOVERNING band is untouched — `T0`/`T1` in, in the same order, at the same cost (a regression
//      here would mean the amendment bought visibility by moving ratified content);
//   2. the ADVISORY band SERVES the `T2` rows the shipped door refused — the defect itself;
//   3. an OFF-LATTICE tier is in NEITHER band and is NOT counted as a truncation (a refusal is not a
//      budget event) — the membership property, which the negative form `!atLeastT1` would silently break;
//   4. the `OWN_CAP` total does NOT grow: the advisory band is a sub-cap INSIDE it, and what the sub-cap
//      refuses lands in the existing `pullReachable` tail with an `advisoryDropped` ledger beside it;
//   5. the governing band keeps PRIORITY — a briefing whose ratified content fills the budget serves zero
//      advisory rows rather than displacing one;
//   6. equal input ⇒ byte-identical output (RETR-12), and a malformed unit ⇒ empty briefing (RETR-9).
//
// Every assertion runs over a REAL disk store (CAS bytes + the real `upsert` projection) and the REAL built
// `Axes`, through `createOwnLeg` — the exact leg `cli.ts` drives. The facts carry no `grounding` field, so
// the GROUND-1 oracle raises and every advisory row reads `STALE`: advisory drift is non-blocking
// and it is asserted rather than avoided, because a row served without a verdict is the defect next door.

import { describe, it, expect, afterEach } from "vitest"
import { build } from "@atlas/index"
import { upsert, emptyStore } from "@atlas/knowledge"
import type { StoreProjection, WriteRequest } from "@atlas/knowledge"
import { OWN_ADVISORY_CAP, OWN_CAP } from "@atlas/retrieval"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import { walkFileTree } from "../src/fs.js"
import { readScip } from "../src/scip.js"
import { createOwnLeg } from "../src/own-source.js"
import { defaultPolicy } from "../src/policy.js"
import { makeFixRepo } from "./harness/fix-repo.js"
import { makeFixScip } from "./harness/fix-scip.js"

/** The scope every fact below is anchored at — a real file node in the fixture's spatial axis. */
const ANCHOR = "src/app.ts"

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

/** Persist ONE fact durably at an ARBITRARY `tier` — widened past `Tier` on purpose, because that is
 *  exactly what a committed `.atlas/` blob can carry (the content re-hash confirms bytes, not governance). */
function emit(
  store: DiskStore,
  proj: StoreProjection,
  tier: string,
  req: Omit<WriteRequest, "contentHash">,
): StoreProjection {
  const contentHash = store.put({ kind: "advisory", tier, freshness: "FRESH", body: req.nodeKey } as never) as string
  return upsert(proj, { ...req, contentHash }).store
}

/** One row spec: a nodeKey, its governance class, its slot and the claim body that pays for its budget. */
interface Seed {
  readonly key: string
  readonly tier: string
  readonly slot: "invariant" | "gotcha"
  readonly claim: string
}

/** Build the fixture repo + a durable store seeded with `seeds`, and return the composed `own` leg. */
function legOver(seeds: readonly Seed[]): ReturnType<typeof createOwnLeg> {
  const repo = makeFixRepo()
  const scip = makeFixScip()
  cleanup = () => {
    repo.cleanup()
    scip.cleanup()
  }
  const axes = build(walkFileTree(repo.repoPath), readScip(scip.scipPath))
  const store = createDiskStore(`${repo.repoPath}/.atlas-cas`)
  let proj = emptyStore()
  for (const s of seeds) {
    proj = emit(store, proj, s.tier, {
      nodeKey: s.key,
      family: "advisory",
      claimNorm: s.claim,
      primaryAnchor: ANCHOR,
      slot: s.slot,
    })
  }
  store.persistProjection(proj)
  return createOwnLeg({ axes, store, policy: defaultPolicy() })
}

/** Every tier a row under one anchor can carry — `T0`, `T1`, `T2` (twice, once per slot class) and an
 *  off-lattice `T3` — each cheap enough that no cap binds and the BAND choice is the only thing under test. */
const LATTICE: readonly Seed[] = [
  { key: "k:T0", tier: "T0", slot: "invariant", claim: "the T0 claim" },
  { key: "k:T1", tier: "T1", slot: "invariant", claim: "the T1 claim" },
  { key: "k:T2", tier: "T2", slot: "invariant", claim: "the T2 claim" },
  { key: "k:T2g", tier: "T2", slot: "gotcha", claim: "the T2 gotcha claim" },
  { key: "k:T3", tier: "T3", slot: "invariant", claim: "the off-lattice claim" },
]

describe("REQ-RETR-12m — the `own` briefing is two separately bounded bands", () => {
  it("serves the T2 rows the shipped door refused, on their OWN band, each carrying its own freshness", () => {
    const { pack } = legOver(LATTICE)(ANCHOR)
    // THE DEFECT: before the amendment this was `[]` — every `T2` under the scope was invisible.
    expect(pack.advisory.map((i) => i.nodeId)).toEqual(["k:T2", "k:T2g"])
    expect(pack.advisory.map((i) => i.tier)).toEqual(["T2", "T2"])
    // Per-row freshness, fail-closed: these facts carry no `grounding`, so the absent oracle resolves DRIFTED
    // rather than inheriting the stored write-time `FRESH` (which is what it says).
    expect(pack.advisory.map((i) => i.freshness)).toEqual(["DRIFTED", "DRIFTED"])
    expect(pack.advisory.map((i) => i.claim)).toEqual(["the T2 claim", "the T2 gotcha claim"])
  })

  it("leaves the GOVERNING band exactly as it was — T0/T1 in, in the same order, and never on the advisory verb", () => {
    const { pack } = legOver(LATTICE)(ANCHOR)
    expect(pack.invariants.map((i) => i.nodeId)).toEqual(["k:T0", "k:T1"])
    expect(pack.invariants.map((i) => i.tier)).toEqual(["T0", "T1"])
    // A ratified row is NEVER duplicated into the advisory band: the two bands partition, they do not overlap.
    expect(pack.advisory.map((i) => i.nodeId)).not.toContain("k:T0")
    expect(pack.advisory.map((i) => i.nodeId)).not.toContain("k:T1")
  })

  it("puts an OFF-LATTICE tier in NEITHER band, and does not count it as a truncation", () => {
    const { pack } = legOver(LATTICE)(ANCHOR)
    const served = [...pack.invariants, ...pack.advisory].map((i) => i.nodeId)
    expect(served).not.toContain("k:T3")
    // A refusal is a governance decision; folding it into a truncation ledger would report it as a budget
    // event. Nothing was cut here, so the ledger reads 0 and the tail is empty.
    expect(pack.advisoryDropped).toBe(0)
    expect(pack.pullReachable).toEqual([])
  })

  it("caps the advisory band INSIDE OWN_CAP, and names every refused row in the pull-reachable tail", () => {
    // Twelve rows of ~200 chars: far past `OWN_ADVISORY_CAP` (750), well under a raised total.
    const fat: readonly Seed[] = Array.from({ length: 12 }, (_v, i) => ({
      key: `k:a${String(i).padStart(2, "0")}`,
      tier: "T2",
      slot: "invariant" as const,
      claim: `advisory ${i} `.padEnd(200, "x"),
    }))
    const { pack } = legOver(fat)(ANCHOR)
    const advisoryCost = pack.advisory.reduce((n, i) => n + i.claim.length, 0)
    expect(advisoryCost).toBeLessThanOrEqual(OWN_ADVISORY_CAP)
    expect(pack.tokenEstimate).toBeLessThanOrEqual(OWN_CAP) // the total did NOT grow
    expect(pack.advisory.length).toBeGreaterThan(0)
    expect(pack.advisoryDropped).toBe(12 - pack.advisory.length)
    // 0 SILENT DROPS: every refused row is named by nodeKey in the tail `own` already promises.
    const servedKeys = new Set(pack.advisory.map((i) => String(i.nodeId)))
    expect(pack.pullReachable.map(String).sort()).toEqual(
      fat
        .map((s) => s.key)
        .filter((k) => !servedKeys.has(k))
        .sort(),
    )
  })

  it("keeps the GOVERNING band first in line — ratified content that fills the budget leaves no advisory room", () => {
    const heavy: readonly Seed[] = [
      { key: "k:gov", tier: "T1", slot: "invariant", claim: "g".repeat(OWN_CAP) },
      { key: "k:adv", tier: "T2", slot: "invariant", claim: "the T2 claim that must not displace it" },
    ]
    const { pack } = legOver(heavy)(ANCHOR)
    expect(pack.invariants.map((i) => i.nodeId)).toEqual(["k:gov"]) // the ratified row still fits
    expect(pack.advisory).toEqual([]) // and the advisory row yields, rather than pushing it out
    expect(pack.advisoryDropped).toBe(1)
    expect(pack.pullReachable.map(String)).toEqual(["k:adv"])
    expect(pack.tokenEstimate).toBeLessThanOrEqual(OWN_CAP)
  })

  it("is byte-identical for equal input, and TOTAL for a scope that names no unit (RETR-12 / RETR-9)", () => {
    const leg = legOver(LATTICE)
    expect(JSON.stringify(leg(ANCHOR).pack)).toEqual(JSON.stringify(leg(ANCHOR).pack))
    const miss = leg("src/does-not-exist.ts").pack
    expect(miss.advisory).toEqual([])
    expect(miss.advisoryDropped).toBe(0)
    expect(miss.invariants).toEqual([])
  })
})

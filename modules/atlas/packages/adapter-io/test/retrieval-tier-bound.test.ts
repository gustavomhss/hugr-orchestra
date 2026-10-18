// @atlas/adapter-io — test/retrieval-tier-bound.test.ts  (TOOLS-6 on the NON-scope modes)
//
// The teeth for the bound that was applied to ONE of the three read modes. `@atlas/tools` createQuery bounds
// the pack it mints to `tier≥T1`; `--by dependency|trigger` do NOT route through createQuery — wire.ts sends
// them to `retrievalPack`, which minted its own `Pack` in this package and applied no bound at all. Measured
// on the assembled handler before the fix:
//
//   poisoned tier="T3"  => --by dependency pack.invariants: [{"nodeId":"k:app","tier":"T3", …}]
//   poisoned tier="T2"  => --by dependency pack.invariants: [{"nodeId":"k:app","tier":"T2", …}]
//   (the SAME projection served through --by scope correctly dropped both.)
//
// The `T2` leg needs no attacker at all — an ordinary auto-accepted `T2` write (KNOW-18 fast path) was served
// as a pack invariant. The `T3` leg's entry point is that `.atlas/` is a COMMITTED artifact: a repository can
// ship a projection + CAS blob that passed no write door, and the content re-hash on read confirms the bytes,
// not their governance.
//
// Both modes are exercised. `dependency` runs END TO END through the real assembled handler (the user's
// door). `trigger` cannot be reached that way — `buildRetrievalModel` hardcodes `triggers: new Map()` (no
// trigger-axis producer exists in the monorepo), so every trigger query returns `[]` regardless of the
// bound; it is driven instead through `packFromModel` with a populated `triggers` map, which is the REAL
// trigger leg of the real shaping code. A dormant mode is exactly where an ungoverned read hides.

import { describe, it, expect, afterEach } from "vitest"
import { build } from "@atlas/index"
import { upsert, emptyStore } from "@atlas/knowledge"
import type { CurrentNode, GroundedFact, ReconcileApi, StoreProjection, WriteRequest } from "@atlas/knowledge"
import type { Hash, PackInvariant } from "@atlas/contracts"
import type { T0Heuristic, TruthGate } from "@atlas/tools"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import { walkFileTree } from "../src/fs.js"
import { readScip } from "../src/scip.js"
import { assembleHandler } from "../src/wire.js"
import type { WireConfig, WireSeams } from "../src/wire.js"
import { buildRetrievalModel, packFromModel } from "../src/retrieval-model.js"
import { atLeastT1, mintPack } from "../src/pack-shape.js"
import { makeFixRepo } from "./harness/fix-repo.js"
import { makeFixScip } from "./harness/fix-scip.js"

const seams: WireSeams = {
  heuristic: { isCandidate: () => false } as T0Heuristic,
  gate: { gateHolds: () => "NA" } as TruthGate,
  classifier: { reconcile: () => ({ mechanical: [], semantic: [], reauthorCount: 0, exitCode: 0 }) } as ReconcileApi,
  driftFacts: [] as readonly GroundedFact[],
  resolveAnchorAt: () => undefined,
}

/** The four rows every mode is fed: two GOVERNED (must survive) and two UNGOVERNED (must be bounded out). */
const ROWS = [
  { key: "k:T0", tier: "T0", keep: true },
  { key: "k:T1", tier: "T1", keep: true },
  { key: "k:T2", tier: "T2", keep: false }, // auto-accepted, never pack-eligible (TOOLS-6)
  { key: "k:T3", tier: "T3", keep: false }, // OFF-LATTICE — no write door ever minted this
] as const

const KEPT = ROWS.filter((r) => r.keep).map((r) => r.key) // ['k:T0','k:T1'], nodeId-sorted

/** Persist one fact durably (CAS bytes + projection row via the REAL upsert), at an ARBITRARY `tier` —
 *  `tier` is widened past `Tier` on purpose: that is exactly what a committed `.atlas/` blob can carry. */
function emit(
  store: DiskStore,
  proj: StoreProjection,
  tier: string,
  req: Omit<WriteRequest, "contentHash">,
): { proj: StoreProjection; contentHash: string } {
  const contentHash = store.put({ kind: "advisory", tier, freshness: "FRESH", body: req.nodeKey } as never) as string
  return { proj: upsert(proj, { ...req, contentHash }).store, contentHash }
}

/** Seed the four rows anchored at `anchor`; returns the live projection + each row's CAS hash. */
function seedRows(store: DiskStore, proj: StoreProjection, anchor: string): { proj: StoreProjection; hashes: Hash[] } {
  const hashes: Hash[] = []
  for (const row of ROWS) {
    const out = emit(store, proj, row.tier, {
      nodeKey: row.key,
      family: "advisory",
      claimNorm: `claim ${row.key}`,
      primaryAnchor: anchor,
      slot: "invariant",
    })
    proj = out.proj
    hashes.push(out.contentHash as Hash)
  }
  return { proj, hashes }
}

const invariantsOf = (v: { data?: unknown }): PackInvariant[] =>
  (v.data as { pack?: { invariants?: PackInvariant[] } } | undefined)?.pack?.invariants ?? []

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

describe("TOOLS-6 — the tier bound holds on EVERY mode that returns a Pack, not only --by scope", () => {
  it("--by dependency (end to end through the assembled handler): T2 + off-lattice OUT, T0/T1 through", () => {
    const repo = makeFixRepo()
    const scip = makeFixScip()
    cleanup = () => {
      repo.cleanup()
      scip.cleanup()
    }
    const casPath = `${repo.repoPath}/.atlas-cas`
    // The fix-scip corpus carries `src/app.ts` → `src/util.ts`, so reverseClosure(util) = {app}: facts
    // anchored at src/app.ts are dependency-reachable from src/util.ts.
    const axes = build(walkFileTree(repo.repoPath), readScip(scip.scipPath))
    const cfg: WireConfig = { repoPath: repo.repoPath, casPath, scipPath: scip.scipPath, seams, axes }

    const store = createDiskStore(casPath)
    // an anchoring fact at the query target (a blast-radius key exists only for a path that carries a fact)
    let proj = emit(store, emptyStore(), "T1", {
      nodeKey: "k:util",
      family: "advisory",
      claimNorm: "util base",
      primaryAnchor: "src/util.ts",
      slot: "invariant",
    }).proj
    proj = seedRows(store, proj, "src/app.ts").proj
    store.persistProjection(proj)

    const verdict = assembleHandler(cfg).handle("atlas-query", { scope: "src/util.ts", by: "dependency" })
    expect(verdict.ok).toBe(true)
    const served = invariantsOf(verdict)
    expect(served.map((i) => i.nodeId)).toEqual(KEPT)
    expect(served.map((i) => i.tier)).toEqual(["T0", "T1"])
    // [AMENDED — ADR-0013 clause 4] The estimate is the size of what was RETURNED, i.e. BOTH bands. It used
    // to be asserted equal to the governing band alone, which was the same statement while `T2` was dropped
    // outright; now a `T2` row is genuinely SERVED (in the advisory band) and genuinely costs the reader
    // tokens, so an estimate that excluded it would under-report the pack the caller actually received.
    // The property the original assertion defended is unchanged and is asserted directly below it: a row
    // served on NEITHER band — the off-lattice `T3` — contributes nothing.
    const pack = (verdict.data as { pack: { tokenEstimate: number; advisory: readonly { claim: string }[] } }).pack
    const governingChars = served.reduce((n, i) => n + i.claim.length, 0)
    const advisoryChars = pack.advisory.reduce((n, i) => n + i.claim.length, 0)
    expect(pack.tokenEstimate).toBe(governingChars + advisoryChars)
    expect(pack.advisory.map((i) => (i as unknown as { nodeId: string }).nodeId)).toEqual(["k:T2"])
    // the off-lattice `k:T3` row is in neither band, so it inflates neither the pack nor the budget
    expect(pack.tokenEstimate).toBe(governingChars + "claim k:T2".length)
  })

  it("--by trigger (the dormant leg, driven with a populated triggers map): T2 + off-lattice OUT, T0/T1 through", () => {
    const repo = makeFixRepo()
    const scip = makeFixScip()
    cleanup = () => {
      repo.cleanup()
      scip.cleanup()
    }
    const casPath = `${repo.repoPath}/.atlas-cas`
    const axes = build(walkFileTree(repo.repoPath), readScip(scip.scipPath))
    const store = createDiskStore(casPath)
    const seeded = seedRows(store, emptyStore(), "src/app.ts")
    store.persistProjection(seeded.proj)

    // The real model over the real store, with the ONE thing production cannot yet supply: a trigger tag.
    const base = buildRetrievalModel(axes, store)
    const model = { ...base, triggers: new Map([["security", seeded.hashes]]) }

    // sanity: the tag really does reach all four facts — the bound, not an empty lookup, is what drops two
    expect(base.store.size).toBe(ROWS.length)

    // [ADR-0013] the oracle is a stub returning FRESH: this test is about the tier BOUND, not about drift,
    // and a real `driftDetect` here would make a governance assertion depend on the fixture tree's bytes.
    const envelope = packFromModel(model, "trigger", "security", store, () => "FRESH")
    expect(envelope.pack.invariants.map((i) => i.nodeId)).toEqual(KEPT)
    expect(envelope.pack.invariants.map((i) => i.tier)).toEqual(["T0", "T1"])
    // The GOVERNING band still holds exactly T0/T1; the T2 moved to the ADVISORY band (never dropped, never
    // interleaved) and every off-lattice spelling is in NEITHER — see the membership block below.
    expect(envelope.pack.advisory.map((i) => i.tier)).toEqual(["T2"])
  })

  it("the production trigger mode stays empty — no trigger-axis producer exists (documented non-behavior)", () => {
    const repo = makeFixRepo()
    const scip = makeFixScip()
    cleanup = () => {
      repo.cleanup()
      scip.cleanup()
    }
    const casPath = `${repo.repoPath}/.atlas-cas`
    const axes = build(walkFileTree(repo.repoPath), readScip(scip.scipPath))
    const cfg: WireConfig = { repoPath: repo.repoPath, casPath, scipPath: scip.scipPath, seams, axes }
    const store = createDiskStore(casPath)
    store.persistProjection(seedRows(store, emptyStore(), "src/app.ts").proj)

    const verdict = assembleHandler(cfg).handle("atlas-query", { scope: "src/app.ts", by: "trigger" })
    expect(verdict.ok).toBe(true)
    expect(invariantsOf(verdict)).toEqual([])
  })
})

describe("the bound is MEMBERSHIP (`isTier(t) && t !== T2`), never the bare `t !== T2`", () => {
  const node = (key: string): CurrentNode =>
    ({ nodeKey: key, family: "advisory", contentHash: `h:${key}`, claims: [`claim ${key}`] }) as CurrentNode
  const fact = (tier: string): GroundedFact => ({ kind: "advisory", tier }) as unknown as GroundedFact
  const inv = (tier: string): PackInvariant =>
    ({ nodeId: "n", tier, claim: "c", freshness: "FRESH" }) as unknown as PackInvariant

  // Every one of these is `!== 'T2'` and would have been SERVED by the negative form. `hasOwnProperty` on
  // the lattice makes prototype members and near-misses miss byte-exactly (no trim, no case-fold).
  const OFF_LATTICE = ["T3", "t1", "T1 ", " T0", "T0\n", "", "toString", "__proto__", "constructor", "TIER_ORDER"]

  it("refuses every off-lattice spelling and T2, admits exactly T0/T1", () => {
    for (const t of OFF_LATTICE) {
      expect(atLeastT1(inv(t))).toBe(false)
    }
    expect(atLeastT1(inv("T2"))).toBe(false)
    expect(atLeastT1(inv("T1"))).toBe(true)
    expect(atLeastT1(inv("T0"))).toBe(true)
  })

  it("mintPack — the ONE pack-assembly seam in this package — applies the bound and sorts deterministically", () => {
    const pairs = [...OFF_LATTICE, "T2", "T1", "T0"].map((t) => [node(`k:${t}`), fact(t)] as const)
    const pack = mintPack({ territory: "src", axisHash: "ax" as Hash, stale: false }, pairs, () => "FRESH")
    expect(pack.invariants.map((i) => i.tier)).toEqual(["T0", "T1"])
    expect(pack.invariants.map((i) => i.nodeId)).toEqual(["k:T0", "k:T1"])
    // [ADR-0013] the T2 is BANDED, not dropped; every off-lattice spelling is in NEITHER band, which is the
    // property this block exists for — the advisory band must not become the hole facing the other way.
    expect(pack.advisory.map((i) => i.nodeId)).toEqual(["k:T2"])
    expect(pack.advisoryDropped).toBe(0)
    expect(pack.territory).toBe("src")
    expect(pack.stale).toBe(false) // the caller's freshness flag is carried, never downgraded here
  })
})

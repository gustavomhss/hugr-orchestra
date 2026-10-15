// @atlas/adapter-io — test/read-access.test.ts  (TRAVEL-BY-REPROOF — the three-way READ decision, in isolation)
//
// `store-provenance.test.ts` / `read-provenance-refusal.test.ts` / `travel-by-reproof-compose.test.ts`
// exercise `buildReadAccess` end to end through a REAL composed runtime. This file pins it in ISOLATION,
// with a hand-built store and the SAME lightweight `createVerifyFactLeg(scip)` oracle `reverify-store.test.ts`
// uses — no git, no real `.scip` dump — so the three cases (and the two properties hardest to see end to
// end: "case 1 pays no new cost" and "fail-closed when the oracle cannot run") are each pinned directly.

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { asHash, asNodeKey } from "@atlas/kernel"
import type { ScipOutput } from "@atlas/index"
import type { GroundedFact } from "@atlas/knowledge"
import { currentNodes } from "@atlas/knowledge"
import { claimNormFromWitness } from "@atlas/genesis"
import { createVerifyFactLeg } from "../src/verify-fact-source.js"
import type { VerifyFactLeg } from "../src/verify-fact-source.js"
import { createDiskStore, rehydrateProjection } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import { buildReadAccess, trackedProvableAdvisory } from "../src/read-access.js"
import { REJECTED_UNTRUSTED_STORE } from "../src/read-provenance.js"

// FIXTURE DISCIPLINE (#199 fix-round, finding 2): on REAL mined data `CurrentNode.nodeKey` is a content
// hash, DISJOINT from `GroundedFact.id` (a human-readable path) — `hashOf` mints a nodeKey that is never
// equal to the id it is derived from, so a join keyed off the wrong field is something this suite can
// actually catch (see the "disjoint nodeKey" test at the bottom).
function hashOf(id: string): string {
  return createHash("sha256").update(id).digest("hex")
}

const GREET = "scip-ts npm fixture 1.0.0 `greet`()."
const NEVER = "scip-ts npm fixture 1.0.0 `never`()."

const scip: ScipOutput = {
  documents: [
    {
      relativePath: "src/def.ts",
      occurrences: [
        { symbol: GREET, role: "definition" },
        { symbol: NEVER, role: "definition" },
      ],
    },
    { relativePath: "src/a.ts", occurrences: [{ symbol: GREET, role: "reference" }] },
  ],
}

/** (d) ANCHOR EXISTS (#199 fix-round round 3) — built from the SAME `scip.documents` list, mirroring
 *  exactly how `compose.ts` builds it in production: one `Set` over data already in memory. */
const docExists = (p: string): boolean => scip.documents.some((d) => d.relativePath === p)
const scopeHasDocs = (): boolean => true // #240 follow-up: these provenance-path tests don't exercise negation scope

const REPROVEN_WITNESS = { slot: "dependency" as const, target: GREET, scope: "src" }

function advisory(id: string, extra: Partial<GroundedFact>): GroundedFact {
  return {
    kind: "advisory",
    id: asNodeKey(id),
    tier: "T2",
    claimNorm: `claim-${id}`,
    grounding: { entries: [] },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    ...extra,
  } as unknown as GroundedFact
}

let dirs: string[] = []
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs = []
})

/** A bare, ungated store (no `trusted` seam) seeded with the four-fact mix `reverify-store.test.ts` uses —
 *  one of each outcome, PLUS an unsealed fact, so the filter is exercised on every population it must tell
 *  apart. Returns the store and the seeded rows keyed by their intent.
 *
 * `nodeKey` is `hashOf(fact.id)` — deliberately DISJOINT from `fact.id`, mirroring REAL mined data (#199
 * fix-round finding 2). `primaryAnchor` is set within the witness's own `scope` ('src') for every row so
 * the three-way outcome (re-proven/broken/unverifiable) is decided by the SAME thing it names, not by an
 * anchor-binding failure the row was never meant to exercise; `nk-re-proven`'s `claimNorm` is the sentence
 * `claimNormFromWitness` derives from its OWN witness, so it clears the prose binding too. */
function seededStore(): { readonly store: DiskStore; readonly casPath: string } {
  const dir = mktemp()
  const casPath = join(dir, "cas")
  const store = createDiskStore(casPath, () => asHash("seed"))
  const reProven = advisory("nk-re-proven", {
    seal: "proven",
    witness: REPROVEN_WITNESS,
    claimNorm: claimNormFromWitness(REPROVEN_WITNESS),
  })
  const broken = advisory("nk-broken", { seal: "proven", witness: { slot: "dependency", target: NEVER, scope: "src" } })
  const unverifiable = advisory("nk-unverifiable", { seal: "proven" })
  const unsealed = advisory("nk-unsealed", {})
  const rows = [reProven, broken, unverifiable, unsealed].map((fact) => ({
    fact,
    hash: store.put(fact as unknown as never),
  }))
  // NOTE: `sidecar.ts`'s well-formedness check requires the Map KEY to equal the row's OWN `nodeKey`
  // (KNOW-4g's representation invariant — a row whose key is not its own `nodeKey` round-trips as DROPPED,
  // not merely mis-joined) — so the hash-shaped key goes on BOTH sides; `fact.id` stays the disjoint path.
  store.persistProjection({
    current: new Map(
      rows.map(({ fact, hash }) => {
        const nodeKey = hashOf(String(fact.id))
        return [
          nodeKey,
          {
            nodeKey,
            family: "advisory" as const,
            contentHash: String(hash),
            claims: [(fact as unknown as { claimNorm: string }).claimNorm],
            primaryAnchor: "src/a.ts", // a REAL document in `scip.documents` above (round 3 — the anchor must exist)
          },
        ] as const
      }),
    ),
    cas: new Set(rows.map(({ hash }) => String(hash))),
  })
  return { store, casPath }
}

function mktemp(): string {
  const d = mkdtempSync(join(tmpdir(), "atlas-read-access-"))
  dirs.push(d)
  return d
}

const leg: VerifyFactLeg = createVerifyFactLeg(scip)

describe("buildReadAccess — CASE 1 (trusted): no new cost, byte-identical to `store`", () => {
  it("the gated store is returned VERBATIM — same object, not a copy or a wrapper", () => {
    const { store } = seededStore()
    const access = buildReadAccess({
      provenance: () => "trusted",
      casPath: "/never/read",
      headSha: () => undefined,
      gatedStore: store,
      verifyFactLeg: () => {
        throw new Error("TEETH: case 1 must never call the oracle")
      },
      docExists,
      scopeHasDocs,
    })
    expect(access.refusal).toBeUndefined()
    expect(access.reverified).toBeUndefined() // no reverify pass was run — nothing to report
    expect(access.store).toBe(store) // IDENTITY, not just equal shape — no filtering wrapper built
    // and the oracle really was never touched: every row the (already-gated) store holds reads back.
    expect(currentNodes(rehydrateProjection(access.store)).length).toBe(4)
  })
})

describe("buildReadAccess — CASE 3 (tracked-staging): flat refusal, the store is never even considered", () => {
  it("refuses with the named discriminant text, and the oracle is never called", () => {
    const { store } = seededStore()
    const access = buildReadAccess({
      provenance: () => "tracked-staging",
      casPath: "/never/read",
      headSha: () => undefined,
      gatedStore: store,
      verifyFactLeg: () => {
        throw new Error("TEETH: case 3 must never call the oracle either")
      },
      docExists,
      scopeHasDocs,
    })
    expect(access.refusal).toBe(REJECTED_UNTRUSTED_STORE)
    expect(access.reverified).toBeUndefined()
  })
})

describe("buildReadAccess — CASE 2 (tracked-provable): filtered to what RE-PROVES, never broken/unverifiable/unsealed", () => {
  it("re-proven served; broken, unverifiable AND plain-unsealed all dropped", () => {
    const { store, casPath } = seededStore()
    const access = buildReadAccess({
      provenance: () => "tracked-provable",
      casPath,
      headSha: () => asHash("seed") as unknown as string,
      gatedStore: store,
      verifyFactLeg: leg,
      docExists,
      scopeHasDocs,
    })
    expect(access.refusal).toBeUndefined()
    expect(access.reverified).toEqual({
      sealedProven: 3, // the unsealed fact is OUT OF SCOPE for this pass — never counted
      reProven: 1,
      broken: 1,
      unverifiable: 1,
      dangling: 0, // every row RESOLVED — nothing was dropped for want of bytes
      rows: expect.any(Array),
    })
    const served = currentNodes(rehydrateProjection(access.store))
    expect(served.map((n) => n.nodeKey).sort()).toEqual([hashOf("nk-re-proven")])
    // TEETH (c)/(d): `get` is filtered too, not just `loadProjection` — the address-direct bypass
    // (`atlas node <hash>`) must not serve a broken/unverifiable row's bytes either.
    const projRaw = rehydrateProjection(createDiskStore(casPath))
    for (const n of currentNodes(projRaw)) {
      const isReProven = n.nodeKey === hashOf("nk-re-proven")
      expect(access.store.get(n.contentHash as never) !== undefined).toBe(isReProven)
    }
  })

  it("the ADVISORY MESSAGE names the fraction served and why the rest is missing", () => {
    const { store, casPath } = seededStore()
    const access = buildReadAccess({
      provenance: () => "tracked-provable",
      casPath,
      headSha: () => asHash("seed") as unknown as string,
      gatedStore: store,
      verifyFactLeg: leg,
      docExists,
      scopeHasDocs,
    })
    expect(access.reverified).toBeDefined()
    const text = trackedProvableAdvisory(access.reverified!)
    expect(text).toContain("1 of 3")
    expect(text).toContain("COMMIT") // names WHY: it arrived by commit, not through a door
    expect(text).toContain("atlas verify-store")
  })
})

// ── #249 — the test-vacuity reverify replay threaded into the `tracked-provable` SERVE ─────────────────────
// A `proven` test-vacuity re-proves against HEAD by RE-RUNNING the tree-sitter scan (`reverifyTestVacuity`,
// the injected `replay` leg), NOT the SCIP oracle. Before this WP the serve path called `reverifyFact` WITHOUT
// the replay, so every proven test-vacuity fell to `unverifiable` and was DROPPED (over-refused). These pins
// exercise `buildReadAccess`'s new `replay` opt end to end through `buildProvable`.
const TV_SHAPE = "assertion-only-in-catch" as const
const SERVED_NAME = "served — still holds at HEAD"
const CHANGED_NAME = "changed — no longer proven"
const TAMPERED_NAME = "tampered — re-tiered off the mined tier"

/** The injected re-scan: only the SERVED unit's test still holds the shape at HEAD; the CHANGED one abstains
 *  (the code moved under it). The tampered fact never reaches here — its non-mined tier is caught first. */
const TV_REPLAY = (_unitKey: string, testName: string): "proven" | "abstain" =>
  testName === SERVED_NAME ? "proven" : "abstain"

function tv(id: string, unitKey: string, testName: string, over: Partial<GroundedFact> = {}): GroundedFact {
  return {
    kind: "test-vacuity",
    id: asNodeKey(id),
    tier: "T2", // MINED_TIER — the ONLY tier a `proven` seal is minted at; a re-tier is a tamper
    unitKey,
    testName,
    shape: TV_SHAPE,
    grounding: { entries: [] },
    freshness: "FRESH",
    claims: [],
    authoring: "PROVEN",
    seal: "proven",
    witness: { shape: TV_SHAPE, testName },
    ...over,
  } as unknown as GroundedFact
}

/** A bare store seeded with three PROVEN test-vacuities: one whose test still holds (SERVED), one whose test
 *  changed (broken), one re-tiered off the mined tier (broken/tampered). Same disjoint-nodeKey discipline as
 *  `seededStore` — the Map key is `hashOf(fact.id)`, distinct from the `fact.id` path. */
function seededTvStore(): { readonly store: DiskStore; readonly casPath: string } {
  const dir = mktemp()
  const casPath = join(dir, "cas")
  const store = createDiskStore(casPath, () => asHash("seed"))
  const facts = [
    tv("tv-served", "src/served.test.ts", SERVED_NAME),
    tv("tv-changed", "src/changed.test.ts", CHANGED_NAME),
    tv("tv-tampered", "src/tampered.test.ts", TAMPERED_NAME, { tier: "T0" }),
  ]
  const rows = facts.map((fact) => ({ fact, hash: store.put(fact as unknown as never) }))
  store.persistProjection({
    current: new Map(
      rows.map(({ fact, hash }) => {
        const nodeKey = hashOf(String(fact.id))
        return [
          nodeKey,
          {
            nodeKey,
            family: "test-vacuity" as const,
            contentHash: String(hash),
            claims: [],
            primaryAnchor: (fact as unknown as { unitKey: string }).unitKey,
          },
        ] as const
      }),
    ),
    cas: new Set(rows.map(({ hash }) => String(hash))),
  })
  return { store, casPath }
}

describe("buildReadAccess — CASE 2 (tracked-provable): the #249 test-vacuity replay is threaded into the SERVE", () => {
  const opts = (store: DiskStore, casPath: string, replay?: (u: string, t: string) => "proven" | "abstain") => ({
    provenance: () => "tracked-provable" as const,
    casPath,
    headSha: () => asHash("seed") as unknown as string,
    gatedStore: store,
    verifyFactLeg: (() => {
      throw new Error("SCIP oracle must NOT be called for a test-vacuity — it routes to the replay first")
    }) as unknown as VerifyFactLeg,
    docExists,
    scopeHasDocs,
    ...(replay !== undefined ? { replay: replay as never } : {}),
  })

  it("WITH the replay threaded: the still-holding test-vacuity is RE-PROVEN and SERVED; changed + tampered dropped", () => {
    const { store, casPath } = seededTvStore()
    const access = buildReadAccess(opts(store, casPath, TV_REPLAY))
    expect(access.refusal).toBeUndefined()
    expect(access.reverified).toEqual({
      sealedProven: 3,
      reProven: 1, // only the still-holding one
      broken: 2, // changed (abstains) + tampered (non-mined tier, caught before the replay)
      unverifiable: 0, // the whole point of #249: NOT dumped to unverifiable for want of a re-scan leg
      dangling: 0,
      rows: expect.any(Array),
    })
    const served = currentNodes(rehydrateProjection(access.store))
    expect(served.map((n) => n.nodeKey).sort()).toEqual([hashOf("tv-served")])
    // and the address-direct bypass (`atlas node <hash>`) serves ONLY the re-proven row's bytes.
    const projRaw = rehydrateProjection(createDiskStore(casPath))
    for (const n of currentNodes(projRaw)) {
      expect(access.store.get(n.contentHash as never) !== undefined).toBe(n.nodeKey === hashOf("tv-served"))
    }
  })

  it("MUTATION-VERIFY the thread is load-bearing: WITHOUT the replay the SAME proven-still-holding fact is DROPPED", () => {
    // Removing the `replay` threading (the exact bug #249 closes) makes `reverifyFact` re-prove the
    // test-vacuity to `unverifiable` (no re-scan leg wired) — so it is filtered OUT and served NOTHING.
    // This pins the served case above: if the `replay` opt stops reaching `reverifyFact`, this goes green
    // and the served-case test goes red.
    const { store, casPath } = seededTvStore()
    const access = buildReadAccess(opts(store, casPath)) // replay OMITTED
    expect(access.reverified).toEqual({
      sealedProven: 3,
      reProven: 0, // nothing re-proves without the re-scan leg
      broken: 1, // only the tampered tier is broken pre-replay
      unverifiable: 2, // served + changed both fall to "nothing to replay"
      dangling: 0,
      rows: expect.any(Array),
    })
    expect(currentNodes(rehydrateProjection(access.store)).length).toBe(0) // over-refused — the bug
  })
})

describe("buildReadAccess — FAIL-CLOSED: `tracked-provable` degrades to a refusal, NEVER a raw/unfiltered serve", () => {
  it("TEETH (e): the oracle throwing mid-pass refuses — it does not fall back to the gated OR the raw store", () => {
    const { store, casPath } = seededStore()
    const access = buildReadAccess({
      provenance: () => "tracked-provable",
      casPath,
      headSha: () => asHash("seed") as unknown as string,
      gatedStore: store,
      verifyFactLeg: () => {
        throw new Error("oracle unavailable")
      },
      docExists,
      scopeHasDocs,
    })
    expect(access.refusal).toBe(REJECTED_UNTRUSTED_STORE)
    expect(access.reverified).toBeUndefined()
  })

  it("a store whose raw projection genuinely holds nothing degrades to an honest empty pass, not a refusal", () => {
    // The counterpart to the throw above: an ABSENT/empty projection is not "the oracle could not run" —
    // it is "there is nothing to re-prove yet", and reporting that honestly (sealedProven: 0) is the
    // correct answer, distinct from fail-closed. Written here so a future change cannot conflate the two.
    const dir = mktemp()
    const casPath = join(dir, "cas")
    const access = buildReadAccess({
      provenance: () => "tracked-provable",
      casPath,
      headSha: () => undefined,
      gatedStore: createDiskStore(casPath),
      verifyFactLeg: leg,
      docExists,
      scopeHasDocs,
    })
    expect(access.refusal).toBeUndefined()
    expect(access.reverified).toEqual({
      sealedProven: 0,
      reProven: 0,
      broken: 0,
      unverifiable: 0,
      dangling: 0,
      rows: [],
    })
  })
})

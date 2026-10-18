// @atlas/adapter-io — test/relation-seal-door.test.ts  (#99 R4 / ADR-0018 — the governed door PERSISTS +
// REJECTS a PROVEN relation seal)
//
// The #99a relation leg (relation-door.test.ts) proved a cross-file relation EMITS as an advisory-class edge.
// This suite is the #99 SOUND leg at the WRITE DOOR: a `seal:'proven'` `depends-on` relation minted by the
// sound-admit path must reach the durable row + CAS with its seal AND its re-derivable witness (AR-7); the
// seal must NOT bypass the truth door (AR-22); a SHAPE-forged proven relation — witness missing, malformed,
// or naming a non-provable (`calls`) kind — is stripped at WRITE (AR-24, D-d, first layer). NOTE the honest
// limit: the write door has no oracle, so a shape-VALID-but-false witness (real-looking target/scope that
// does not re-derive) still persists proven here, exactly as a promoted predicate witness does; that CONTENT
// forgery is caught at READ-SIDE reverify (WP-R5 / #240), not here. And the seal (on the row) + the witness
// (in the CAS bytes) are published in ONE atomic commit, so a lost race never tears them apart (AR-27).
//
// A PROVEN RELATION FIXTURE is hand-built here (a literal RelationNode with seal + witness) — this WP is the
// DOOR, testable without waiting on the genesis sound-admit path (R2). The witness shape is exactly what
// `RelationWitness` freezes: relationKind='depends-on' (the sole provable kind, F3), a target symbol under
// endpointB, and endpointA's sourceScope. The door is driven at `origin:'promoted'` — the trusted channel a
// mined proven fact re-emits through — because an AUTHORED write strips every seal at gate 0 by construction.

import { describe, it, expect, afterEach } from "vitest"
import { asNodeKey, asSubtreeHash, id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import { relationKey } from "@atlas/knowledge"
import type { GroundedFact, RelationKind, RelationWitness } from "@atlas/knowledge"
import type { Hash, Status } from "@atlas/contracts"
import type { TruthGate } from "@atlas/tools"
import { createGovernedEmit } from "../src/governed-emit.js"
import { AT, HOLDS, freshWorkspace, policyOf, reasonOf } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"
import type { DiskStore } from "../src/store.js"
import type { StoreProjection } from "@atlas/knowledge"
import type { CommitDecision, CommitResult } from "../src/sidecar.js"

// Two units in DIFFERENT files — the sound `depends-on` edge is file→file (D-e), so the endpoints differ.
const A = "src/payments/charge.ts::charge"
const B = "src/vendor/money.ts::round"
// The witnessed SCIP target under endpointB + endpointA's verify-scope — the oracle's re-run arguments.
const TARGET = "scip-typescript npm @atlas/vendor 0.0.0 src/vendor/money.ts/round()."
const SOURCE_SCOPE = "src/payments"

const provenWitness = (kind: RelationKind = "depends-on"): RelationWitness => ({
  relationKind: kind,
  target: TARGET,
  sourceScope: SOURCE_SCOPE,
})

/** A grounded RELATION fact — TWO grounding entries (both endpoints, AND-folded freshness), plus the OPTIONAL
 *  `seal` + `witness` under test. A `calls` kind or a missing/mismatched witness is the forgery surface. */
function relationFact(opts: {
  a?: string
  b?: string
  kind?: RelationKind
  scope?: string
  gen?: number
  seal?: "proven"
  witness?: RelationWitness | null
}): GroundedFact {
  const a = opts.a ?? A
  const b = opts.b ?? B
  const entry = (p: string) => ({
    anchor: { kind: "symbol" as const, qualifiedPath: p, subtreeHash: asSubtreeHash("sh-" + p) },
    path: "x",
  })
  const base: Record<string, unknown> = {
    kind: "relation",
    id: asNodeKey("gen-" + String(opts.gen ?? 1)),
    tier: "T2",
    relationKind: opts.kind ?? "depends-on",
    endpointA: a,
    endpointB: b,
    grounding: { entries: [entry(a), entry(b)] },
    freshness: "FRESH",
    claims: [],
    authoring: "RELATED",
    scope: opts.scope ?? "core",
  }
  if (opts.seal !== undefined) base.seal = opts.seal
  if (opts.witness !== undefined && opts.witness !== null) base.witness = opts.witness
  return base as unknown as GroundedFact
}

let ws: Workspace | undefined
afterEach(() => {
  ws?.dispose()
  ws = undefined
})

/** A door whose `actor` owns `core`, gate `g` (held open by default), billy token, `origin` under test. */
function coreDoor(
  opts: { gate?: TruthGate; origin?: "promoted"; store?: DiskStore } = {},
): ReturnType<typeof createGovernedEmit> {
  ws ??= freshWorkspace()
  return createGovernedEmit({
    store: opts.store ?? ws.store,
    gate: opts.gate ?? HOLDS,
    policy: policyOf({ core: ["bob"] }),
    actor: "bob",
    ratifyToken: "billy",
    ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
  })
}

/** The stored CAS bytes of an admitted fact (what `put` wrote — the fact itself, seal + witness included). */
function casBytes(out: { id?: string }): { seal?: unknown; witness?: unknown } | undefined {
  return ws!.store.get(out.id! as unknown as Hash) as { seal?: unknown; witness?: unknown } | undefined
}
/** The durable projection ROW for a relation (the `relationKey` identity), read fresh off disk. */
function durableRow(kind: RelationKind = "depends-on", a = A, b = B): { seal?: unknown } | undefined {
  const key = relationKey(a, kind, b) as unknown as string
  return ws!.store.loadProjection()?.current.get(key) as { seal?: unknown } | undefined
}

describe("#99 R4 — governed door PERSISTS a proven relation seal + witness (AR-7)", () => {
  it("AR-7 — a promoted proven `depends-on` relation reaches the CAS bytes AND the durable row with seal + witness", () => {
    const witness = provenWitness()
    const out = coreDoor({ origin: "promoted" }).emit(relationFact({ seal: "proven", witness }), AT)
    expect(out.emitted).toBe(true)

    // CAS bytes — the reverify path re-derives the witness from HERE (mirrors the predicate witness carrier).
    const bytes = casBytes(out)!
    expect(bytes.seal).toBe("proven")
    expect(bytes.witness).toEqual(witness)

    // Durable ROW — the seal carrier at gate 3 (the lifted `!== 'relation'` guard) stamps the seal on the row.
    expect(durableRow()!.seal).toBe("proven")
  })

  it("AR-7 (teeth) — WITHOUT the lifted guard the row would carry NO seal; a seal-less proven edge is the mutant", () => {
    // A relation admitted WITHOUT a seal (the pre-#99 behaviour the guard used to force onto every relation)
    // leaves the row seal-less. This pins that the ABSENCE is observable, so AR-7's `toBe('proven')` bites.
    const out = coreDoor({ origin: "promoted" }).emit(relationFact({ gen: 2 }), AT) // no seal supplied
    expect(out.emitted).toBe(true)
    expect(casBytes(out)!.seal).toBeUndefined()
    expect(durableRow()!.seal).toBeUndefined()
  })
})

describe("#99 R4 — the seal does NOT bypass grounding + freshness (AR-22)", () => {
  const BROKEN: TruthGate = { gateHolds: (): Status => "BROKEN" as Status }

  it("AR-22 — a proven relation whose grounding does not re-derive FRESH is refused `ungrounded`, seal notwithstanding", () => {
    const out = coreDoor({ gate: BROKEN, origin: "promoted" }).emit(
      relationFact({ seal: "proven", witness: provenWitness() }),
      AT,
    )
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe("ungrounded")
    // TEETH: the forged-nothing here — the seal is VALID; it still must not skip the truth door. Nothing persisted.
    expect(durableRow()).toBeUndefined()
  })

  it("AR-22 — a persisted proven relation still carries its 2-entry grounding fold (both endpoints) + freshness anchor", () => {
    const out = coreDoor({ origin: "promoted" }).emit(relationFact({ seal: "proven", witness: provenWitness() }), AT)
    expect(out.emitted).toBe(true)
    // The 2-entry AND-fold (entry[0] anchors endpointA, entry[1] anchors endpointB) reached CAS unmodified by
    // the seal path, and the per-endpoint subtreeHash (the freshness anchor `driftDetect` folds) is intact.
    const bytes = ws!.store.get(out.id! as unknown as Hash) as {
      grounding: { entries: { anchor: { qualifiedPath: string; subtreeHash: string } }[] }
      freshness: string
    }
    expect(bytes.grounding.entries).toHaveLength(2)
    expect(bytes.grounding.entries[0]!.anchor.qualifiedPath).toBe(A)
    expect(bytes.grounding.entries[1]!.anchor.qualifiedPath).toBe(B)
    expect(bytes.grounding.entries[0]!.anchor.subtreeHash).toBe(asSubtreeHash("sh-" + A) as unknown as string)
    expect(bytes.freshness).toBe("FRESH")
  })
})

describe("#99 R4 — admission REJECTS a forged proven relation (AR-24, decision D-d)", () => {
  it("AR-24 — a PROMOTED proven relation with NO witness is stripped: never persisted OR read back as proven", () => {
    // A promote is the trusted channel, yet a proven seal with no re-derivable witness could not have come from
    // the sound-admit path (it always mints the witness). The door strips the forged seal at WRITE.
    const out = coreDoor({ origin: "promoted" }).emit(relationFact({ seal: "proven", witness: null }), AT)
    expect(out.emitted).toBe(true) // the edge still admits as an ordinary UNSEALED grounded relation
    // TEETH: without the gate-0.05 strip, the forged `seal:'proven'` would round-trip to CAS and the row here.
    const bytes = casBytes(out)!
    expect(bytes.seal).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(bytes, "seal")).toBe(false)
    expect(durableRow()!.seal).toBeUndefined()
  })

  it("AR-24 — a proven relation whose witness names a DIFFERENT kind (`calls`) is a forgery: seal stripped", () => {
    // Only `depends-on` is provable (F3). A witness claiming `calls`, or mismatching the relation it rides,
    // did not come from the oracle — stripped. (A `calls` relation can never obtain a proven seal.)
    const out = coreDoor({ origin: "promoted" }).emit(
      relationFact({ seal: "proven", witness: provenWitness("calls" as RelationKind) }),
      AT,
    )
    expect(out.emitted).toBe(true)
    expect(casBytes(out)!.seal).toBeUndefined()
    expect(durableRow()!.seal).toBeUndefined()
  })

  it("AR-24 — an AUTHORED proven relation (with a valid witness) is stripped too: only the promote channel mints", () => {
    // The operator-seal forgery leg — a hand-written `atlas emit {kind:'relation', seal:'proven', witness}`.
    // Gate 0 strips every authored seal by origin; the proven claim never reaches the durable row.
    const out = coreDoor(/* authored */).emit(relationFact({ seal: "proven", witness: provenWitness() }), AT)
    expect(out.emitted).toBe(true)
    expect(casBytes(out)!.seal).toBeUndefined()
    expect(durableRow()!.seal).toBeUndefined()
  })
})

describe("#99 R4 — torn-write: seal (row) + witness (CAS) are published atomically (AR-27)", () => {
  it("AR-27 — a lost race re-runs the whole commit; the proven row and its witnessed CAS bytes never split", () => {
    // Mirror the #108 rig: a rival publishes on top of the generation this attempt is about to link, so the
    // door's commit callback re-runs FROM SCRATCH. The seal rides the WriteRequest (the row) and the witness
    // rides the `put` CAS bytes — both are the SAME atomic decision, re-published as a whole on the re-run, so
    // a torn state (a proven row whose witness bytes are absent) is unreachable.
    ws ??= freshWorkspace()
    const real = ws.store
    let attempts = 0
    const store: DiskStore = {
      ...real,
      commitProjection<T>(decide: (p: StoreProjection) => CommitDecision<T>): CommitResult<T> {
        return real.commitProjection<T>((p) => {
          attempts += 1
          const decision = decide(p)
          // A rival publishes generation 2 on the first attempt only (the door targets generation 1).
          if (attempts === 1 && (decision as { next?: unknown }).next !== undefined) {
            real.persistProjection((decision as { next: StoreProjection }).next)
          }
          return decision
        })
      },
    }

    const witness = provenWitness()
    const out = coreDoor({ origin: "promoted", store }).emit(relationFact({ seal: "proven", witness }), AT)
    expect(out.emitted).toBe(true)
    expect(attempts).toBeGreaterThanOrEqual(1)

    // The FINAL durable state is whole: the row carries the proven seal AND the witnessed CAS bytes the row
    // names exist — never a half-written proven row with a seal but no witness.
    expect(durableRow()!.seal).toBe("proven")
    const bytes = real.get(id(relationFact({ seal: "proven", witness }) as CasObject))
    expect(bytes).toBeDefined()
    expect((bytes as { witness?: unknown }).witness).toEqual(witness)
  })
})

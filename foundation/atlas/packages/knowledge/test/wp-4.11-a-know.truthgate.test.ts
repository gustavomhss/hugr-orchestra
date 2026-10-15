// WP-4.11-a.KNOW · RED/GREEN — truth never self-declared (KNOW-1) ∧ ungrounded facts fail closed
// (KNOW-2), the knowledge store-admission bindings that DEFER to GROUND's frozen truth-gate. Transcribes
// ONLY the visible `-1` goldens SCN-KNOW-1-1 / SCN-KNOW-2-1 (docs/requirements/goldens-knw.md). The
// held-out `-2` fixtures (SCN-KNOW-1-2 declared-BROKEN→HOLDS, SCN-KNOW-2-2 partially-grounded) are NOT
// referenced here.
//
// BUILD-AHEAD: GROUND's grounded predicate (`isGrounded`, GROUND-2) + truth-gate (`gateHolds`, GROUND-4)
// are supplied as FIXTURES simulating the SEALED `@atlas/grounding` behaviour — a fail-closed grounded
// check (≥1 entry ∧ every entry a non-empty `subtreeHash`) and a downgrade-only gate (`HOLDS` only if
// grounded ∧ FRESH). The test verifies the KNOWLEDGE-LAYER BINDINGS — that `bindEmit` consumes the
// grounded verdict and `bindStatus` DROPS the node-declared `status` and defers to the gate — NOT the
// oracle's internals (owned by GROUND). No raw hashing, no line numbers.

import { describe, it, expect } from "vitest"
import { asHash, asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { Status, StructRef } from "@atlas/contracts"
import type { Axes, IndexNode } from "@atlas/index"
import type { GateApi, GroundApi, Grounding } from "@atlas/grounding"
import type { AdvisoryNode, GroundedFact, PredicateNode } from "@atlas/knowledge"
import { bindEmit } from "../src/lifecycle/emit.js"
import { bindStatus } from "../src/lifecycle/status.js"

// ── GROUND fixtures (the frozen seam, simulated) ─────────────────────────────

/** GROUND-2 real-grounding predicate: ≥1 entry ∧ every entry a non-empty `subtreeHash`. Fail-closed. */
const isGrounded: GroundApi["isGrounded"] = (g) =>
  g.entries.length > 0 && g.entries.every((e) => String(e.anchor.subtreeHash).length > 0)

/** GROUND-4 truth-gate, downgrade-only: only a `HOLDS` verdict is eligible for downgrade; it stays
 *  `HOLDS` iff grounded ∧ FRESH, else `NA`. Any non-`HOLDS` verdict passes through unchanged. */
const mkGate = (fresh: boolean): GateApi => ({
  gateHolds: (candidate, grounding, _src): Status => {
    const incoming = candidate as Status
    if (incoming !== "HOLDS") return incoming
    return isGrounded(grounding) && fresh ? "HOLDS" : "NA"
  },
})

// ── index / grounding fixtures ───────────────────────────────────────────────

const emptyRoot = (axis: IndexNode["axis"]): IndexNode => ({
  axis,
  level: "repo",
  key: `${axis}:root`,
  subtreeHash: asSubtreeHash(`root-${axis}`),
  children: [],
  objects: [],
})

/** A minimal built-index snapshot — the gate fixture keys on the grounding, so `src` is inert here. */
const src: Axes = {
  spatial: emptyRoot("spatial"),
  territory: emptyRoot("territory"),
  dependency: emptyRoot("dependency"),
  edges: [],
}

const anchor = (qualifiedPath: string, subtreeHash: string): StructRef => ({
  kind: "symbol",
  qualifiedPath,
  subtreeHash: asSubtreeHash(subtreeHash),
})

/** A grounded receipt (one anchor with a non-empty subtreeHash). */
const grounded: Grounding = { entries: [{ anchor: anchor("fn f", "st-77"), path: "src/f.ts" }] }
/** Ungrounded: 0 entries (SCN-KNOW-2-1). */
const zeroEntries: Grounding = { entries: [] }
/** Ungrounded: one entry whose `subtreeHash` is empty (SCN-KNOW-2-1 equivalence). */
const emptyHash: Grounding = { entries: [{ anchor: anchor("fn f", ""), path: "src/f.ts" }] }

const advisoryAt = (g: Grounding): AdvisoryNode => ({
  kind: "advisory",
  id: asNodeKey("nk-adv"),
  tier: "T2",
  claimNorm: "cn-f",
  grounding: g,
  freshness: "FRESH",
  claims: [],
  authoring: "ADVISORY",
})

/** A predicate node that DECLARES a `status` on its own body — the self-declaration KNOW-1 drops. */
const predicateDeclaring = (declared: Status, g: Grounding): PredicateNode => ({
  kind: "predicate",
  id: asNodeKey("nk-pred"),
  tier: "T1",
  check: { kind: "assertion", expr: "x > 0" },
  grounding: g,
  status: declared,
  freshness: "FRESH",
  claims: [],
  authoring: "PREDICATED",
})

// ── KNOW-2 — ungrounded facts fail closed (SCN-KNOW-2-1) ──────────────────────

describe("WP-4.11-a.KNOW · KNOW-2 — the fail-closed grounded write defers to GROUND `isGrounded`", () => {
  it("SCN-KNOW-2-1 — a node with 0 grounding entries is not persisted (emitted:false)", () => {
    const persisted: GroundedFact[] = []
    const admit = bindEmit({ isGrounded, persist: (n) => (persisted.push(n), asHash("cas-1")) }).admit

    const receipt = admit(advisoryAt(zeroEntries))

    expect(receipt.emitted).toBe(false) // fail-closed
    expect(receipt.id).toBeUndefined() // no receipt id on reject
    expect(persisted).toHaveLength(0) // 0 objects persisted
  })

  it("SCN-KNOW-2-1 — an entry with an empty `subtreeHash` also fails closed (equivalence)", () => {
    const persisted: GroundedFact[] = []
    const admit = bindEmit({ isGrounded, persist: (n) => (persisted.push(n), asHash("cas-1")) }).admit

    const receipt = admit(advisoryAt(emptyHash))

    expect(receipt.emitted).toBe(false)
    expect(persisted).toHaveLength(0)
  })

  it("fail-closed contrast — a grounded node is admitted and persisted exactly once", () => {
    const persisted: GroundedFact[] = []
    const admit = bindEmit({ isGrounded, persist: (n) => (persisted.push(n), asHash("cas-1")) }).admit

    const receipt = admit(advisoryAt(grounded))

    expect(receipt.emitted).toBe(true)
    expect(receipt.id).toBe(asHash("cas-1")) // the sink's CAS id, never self-hashed here
    expect(persisted).toHaveLength(1)
  })

  it("admission is total — a malformed grounding is a structured rejection, never a throw", () => {
    const admit = bindEmit({ isGrounded, persist: () => asHash("cas-1") }).admit
    expect(() => admit(advisoryAt(emptyHash))).not.toThrow()
  })
})

// ── KNOW-1 — truth is never self-declared (SCN-KNOW-1-1) ──────────────────────

describe("WP-4.11-a.KNOW · KNOW-1 — served status is recomputed, never the fact's self-declaration", () => {
  it("SCN-KNOW-1-1 — a candidate-declared HOLDS is dropped; the recomputed side-index serves NA", () => {
    // evaluator recomputes HOLDS, but the grounding is NOT fresh (KNOW-3 drift) ⇒ the gate downgrades
    // HOLDS→NA. The node DECLARES `status:'HOLDS'` on its own body — that declaration is dropped.
    const node = predicateDeclaring("HOLDS", grounded)
    const recompute = bindStatus({ gate: mkGate(false), evaluate: () => "HOLDS", src }).recompute

    expect(node.status).toBe("HOLDS") // the fact's self-declaration…
    expect(recompute(node)).toBe("NA") // …is dropped; served = recomputed side-index
  })

  it("the node-declared status is inert — a declared NA still serves HOLDS when grounded ∧ FRESH", () => {
    // opposite direction: the fact declares NA, but the recomputed side-index (evaluator HOLDS through a
    // grounded ∧ FRESH gate) serves HOLDS — the declared field enters no part of the computation.
    const node = predicateDeclaring("NA", grounded)
    const recompute = bindStatus({ gate: mkGate(true), evaluate: () => "HOLDS", src }).recompute

    expect(recompute(node)).toBe("HOLDS")
  })

  it("the served status is the evaluator verdict through the gate — a non-HOLDS passes through", () => {
    // evaluator recomputes NA (the check does not hold); the downgrade-only gate passes it through — the
    // served status tracks the recomputed verdict, regardless of the node-declared HOLDS.
    const node = predicateDeclaring("HOLDS", grounded)
    const recompute = bindStatus({ gate: mkGate(true), evaluate: () => "NA", src }).recompute

    expect(recompute(node)).toBe("NA")
  })
})

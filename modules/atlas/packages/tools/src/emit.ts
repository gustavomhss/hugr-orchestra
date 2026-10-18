// @atlas/tools — src/emit.ts   (WP-4.11-a.TOOLS — TOOLS-7a / TOOLS-7b, GROUND-6)
//
// `atlas-emit` — the fail-closed grounded write door + the frozen `EmitApi`. `emit(node, at)` RE-DERIVES the
// citation at `source@sha` (caller's citation NOT trusted): re-derives ⇒ persist through the sealed
// @atlas/kernel `id` seam; else fail CLOSED (`{emitted:false, rejected}`, nothing persisted). Pure + total.
//
// ── REFERENCE MODEL — TYPES LIVE, CODE INERT ─────────────────────────────────────────────────────────
// This module was NOT in the original #135 finding; it was measured in as a fifth one, in the same package
// as the other four, by the gate that finding produced. Which is the point.
//
//   The TYPE `EmitApi` is consumed elsewhere and is real frozen surface.
//   The VALUE `createEmit` has ZERO production callers. The composition root
//   (`packages/adapter-io/src/wire.ts`) value-imports createHandler / createInit / createQuery /
//   createReconcile from this package, and `createEmit` is not among them.
//
// THE SHIPPED GROUNDED WRITE DOOR IS `packages/adapter-io/src/governed-emit.ts`. That is what `atlas emit`
// routes through. A green suite over this file says the fail-closed re-derivation RULE is stated
// correctly; it says nothing about whether the door a user reaches obeys it.
//
// Declared `types: true` in the ledger at `harness/gates/reference-model-guard.mjs`.

import type { Hash, Status } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import type { Cas, CasObject } from "@atlas/kernel"
import { id } from "@atlas/kernel"
import type { EmitOut } from "./types.js"

export interface EmitApi {
  /** Fail-closed grounded write (TOOLS-7, A-2). Re-derives the citation at `source@sha`; on failure ⇒
   *  `{emitted:false}`, nothing persisted; on success upserts (idempotent-on-unchanged,
   *  supersede-on-changed — 0 dup, A-12). Pure + total (method-tags-tls:65).
   *
   *  [FLAG — `at` = `Hash`] atlas-tools:126 names `atlas-emit <node> --at <sha>`; the `@sha` source anchor
   *  is transcribed as `Hash` (mirrors @atlas/persist `diff(shaA,shaB)` typing the commit sha as `Hash`).
   *  `node` is the templated candidate fact — typed to the @atlas/knowledge `GroundedFact` the grounded
   *  admission consumes (mirrors knowledge `EmitApi.admit(node: GroundedFact)`). */
  emit(node: GroundedFact, at: Hash): EmitOut

  /** Absorb-driven write at wave-close (TOOLS-9, A-10). Routes `ResultCard.absorb` THROUGH the same
   *  fail-closed `emit` path — a sealing wave MUST feed the Atlas or emit a grounded why-not; a seal with
   *  neither records a probe violation (method-tags-tls:78-80).
   *
   *  [OPAQUE-BY-DESIGN — `ResultCard`] the reference names `ResultCard.absorb`, but a `ResultCard` is an
   *  Orchestra orchestration artifact OUTSIDE atlas layer-0 (upward/Orchestra-owned) — it has no type at
   *  this layer BY DESIGN. Pinned to explicit `unknown` (like `CasObject`), correct to leave opaque. */
  absorb(card: unknown): EmitOut
}

/**
 * The GROUND truth-gate seam consumed by the emit surface (WP-4.11-a.GROUND, build-ahead via FROZEN ref +
 * fixtures). `gateHolds(node, at)` re-derives the node's citation at `source@sha` and returns the gate
 * verdict; `HOLDS` iff the grounding re-derives FRESH (GROUND-4/6). Tools CONSUMES this port; GROUND owns
 * its concrete implementation (`atlas-grounding` `GateApi.gateHolds`) — it is NOT defined here.
 */
export interface TruthGate {
  gateHolds(node: GroundedFact, at: Hash): Status
}

/** The structured fail-closed reason (TOOLS-7b, GROUND-6): an ungrounded fact never enters at emit. */
const REJECTED = "ungrounded: citation does not re-derive at source@sha (TOOLS-7b / GROUND-6)"

/**
 * Build `atlas-emit` over an injected content-addressed store + the GROUND truth-gate seam. The returned
 * `emit` conforms EXACTLY to the frozen `EmitApi.emit(node, at)` signature. Pure + total given the store
 * and gate: no clock, no IO, no throw — a non-re-deriving node fails closed to a structured verdict.
 */
export function createEmit(store: Cas, gate: TruthGate): { readonly emit: EmitApi["emit"] } {
  const emit = (node: GroundedFact, at: Hash): EmitOut => {
    // Re-derive the citation at source@sha — the caller's citation is NOT trusted (TOOLS-7a).
    if (gate.gateHolds(node, at) !== "HOLDS") {
      // Fail closed: reject the node, persist NOTHING — the store is left byte-identical (TOOLS-7b).
      return { emitted: false, rejected: REJECTED }
    }
    // Re-derives ⇒ persist through the sealed content-addressed seam (no raw hashing). Minimal write:
    // upsert/template semantics are TOOLS-7c/7d, out of this facet.
    const obj = node as CasObject
    const key = id(obj)
    store.set(key, obj)
    return { emitted: true, id: key }
  }
  return { emit }
}

// differential-vs-oracle (compile-time): the impl's `emit` conforms to the frozen `EmitApi.emit`
// signature (co-located `EmitApi`). `absorb` (TOOLS-9) is a DISTINCT req, out of this facet — not asserted.
const _emitConforms: EmitApi["emit"] = createEmit(new Map(), { gateHolds: () => "NA" }).emit
void _emitConforms

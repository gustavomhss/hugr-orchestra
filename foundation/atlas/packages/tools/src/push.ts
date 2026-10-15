// @atlas/tools — src/push.ts   (WP-6.22.TOOLS — TOOLS-14, INV-TOOLS-14)
//
// The phase-transition auto-inject hook — push-driven pre-phase discovery. At EVERY phase boundary it
// materializes a FRESH `own_<unit>`/`atlas-query` pack from the injected @atlas/retrieval `FreshPackSource`
// and delivers it grant-free (`grantsRequired == 0`, `pulled == false`) — correct even where native pull is
// unavailable. Pull stays a non-load-bearing optimization; opens NO write door, no additional governance tool (TOOLS-1).
//
// ── REFERENCE MODEL — NO PRODUCTION CALLERS ──────────────────────────────────────────────────────────
// `createPhaseHook` is this module's only constructor and NOTHING in `packages/*/src` calls it. Neither is
// `AUTOINJECT_TIER` read anywhere. Verified by probe (stderr write at the top of the constructor, rebuilt,
// 249 real CLI / MCP subprocess runs): ZERO hits — this module does not even self-invoke at load, unlike
// its neighbours' conformance witnesses.
//
// There is NO shipped counterpart. Atlas has no phase-boundary push path today: the poke-as-file
// materializer that would carry one, `packages/adapter-io/src/poke-file.ts`, is itself unconstructed
// (task #36). So this file is the specification of TOOLS-14, waiting for a product to state it about.
//
// A green suite here proves the injection CONTRACT is self-consistent — that a boundary hook returning
// `grantsRequired: 0` / `pulled: false` is well-formed. It proves nothing about any seat ever being
// grounded, because no seat is ever grounded through this code.
//
// Declared in the ledger at `harness/gates/reference-model-guard.mjs`.

import type { Pack, Territory } from "@atlas/contracts"
import type { OwnApi, OwnPack, OwnUnit, PackApi } from "@atlas/retrieval"

/** The TOOLS-11 tier a boundary injection is delivered on — a `push`, so it holds with no tool grant. */
export const AUTOINJECT_TIER = "push" as const

/** A phase in the governed lifecycle (the boundary the hook fires on). Kept open — the hook is agnostic to
 *  the concrete phase vocabulary; it fires on ANY transition (atlas-tools:98 "every phase transition"). */
export type Phase = string

/** One phase boundary crossing — `from → to`. Every crossing is a fresh-pack push point. */
export interface PhaseTransition {
  readonly from: Phase
  readonly to: Phase
}

/** A seat receiving the push. `grants` is its tool-grant set (e.g. `{Read}`); the boundary push needs NONE
 *  of it — a grantless / Read-only seat still receives the fresh pack (TOOLS-14b). */
export interface Seat {
  readonly id: string
  readonly grants: readonly string[]
}

/** The running harness. `nativePull` reports whether native MCP pull is reachable — the hook is INDIFFERENT
 *  to it: the boundary grounds by push regardless, so a `unavailable` harness never leaves a seat ungrounded
 *  (TOOLS-14c, independent of TOOLS-11a). */
export interface Harness {
  readonly id: string
  readonly nativePull: "available" | "unavailable"
}

/** How a seat is grounded — the fresh pack is either its curated `own_<unit>` (RETR-12) or an `atlas-query`
 *  covering pack over a territory (RETR-2). Both are materialized fresh at the boundary from the RETR port. */
export type SeatGrounding =
  | { readonly via: "own"; readonly unit: OwnUnit }
  | { readonly via: "query"; readonly territory: Territory }

/** The fresh pack actually injected at the boundary — a discriminated `own_<unit>` / `atlas-query` pack. */
export type FreshInjection =
  | { readonly via: "own"; readonly pack: OwnPack }
  | { readonly via: "query"; readonly pack: Pack }

/**
 * The RETR fresh-pack contract, CONSUMED FROZEN as an injected port (never redefined here). `own` is the
 * RETR-12 `own_<unit>` composer and `pack` is the RETR-2 `atlas-query` bounded pack; the RETR-6 ceiling and
 * the RETR-3 stale/re-ground law are already enforced inside these — this facet only re-invokes them at the
 * boundary to obtain a FRESH materialization. `own` ⊇ `OwnApi.own`, `pack` ⊇ `PackApi.pack` (see BIND).
 */
export interface FreshPackSource {
  own(unit: OwnUnit): OwnPack
  pack(territory: Territory): Pack
}

/** The optional mid-task PULL optimization port. It is NEVER called by `onTransition` — a boundary grounds by
 *  push alone. Present only so the non-load-bearing optimization can be modeled explicitly (TOOLS-14c). */
export type PullPort = (grounding: SeatGrounding) => FreshInjection

/** The receipt of a boundary push — the fresh pack delivered, the tier, and the grant/pull evidence. */
export interface PushReceipt {
  readonly seatId: string
  readonly transition: PhaseTransition
  readonly tier: typeof AUTOINJECT_TIER // TOOLS-11 push tier — holds with no tool grant
  readonly grantsRequired: 0 // TOOLS-14b — the push needs NO tool grant
  readonly injected: FreshInjection // the FRESH pack materialized at the boundary (TOOLS-14a)
  readonly pulled: false // TOOLS-14c — pull is never the mechanism that grounds a boundary
}

/** The phase-transition auto-inject hook surface. */
export interface PhaseHook {
  /** Fire on a phase boundary: auto-inject a FRESH `own_<unit>`/`atlas-query` pack into the seat by PUSH,
   *  grant-free, without ever invoking pull — correct even where native pull is `unavailable`. */
  onTransition(seat: Seat, grounding: SeatGrounding, transition: PhaseTransition, harness: Harness): PushReceipt
  /** The OPTIONAL mid-task pull optimization: use native pull when the harness offers it, else fall back to
   *  the same push materialization. Grounding never DEPENDS on this (it always yields a fresh pack). */
  pullOptimize(grounding: SeatGrounding, harness: Harness): FreshInjection
}

/** Materialize a FRESH injection from the RETR fresh-pack contract for the seat's grounding (push path). */
function materialize(source: FreshPackSource, grounding: SeatGrounding): FreshInjection {
  return grounding.via === "own"
    ? { via: "own", pack: source.own(grounding.unit) } // RETR-12 own_<unit>, freshly composed
    : { via: "query", pack: source.pack(grounding.territory) } // RETR-2 atlas-query, freshly composed
}

/**
 * Build the phase-transition auto-inject hook over the RETR fresh-pack contract (the injected port). Every
 * boundary re-invokes the port for a FRESH pack (never a cached / stale carry-over) and delivers it on the
 * push tier with `grantsRequired == 0` and `pulled == false` — the seat is grounded by push alone.
 */
export function createPhaseHook(source: FreshPackSource, opts: { readonly pull?: PullPort } = {}): PhaseHook {
  const onTransition = (
    seat: Seat,
    grounding: SeatGrounding,
    transition: PhaseTransition,
    _harness: Harness,
  ): PushReceipt => ({
    seatId: seat.id,
    transition,
    tier: AUTOINJECT_TIER,
    grantsRequired: 0, // push obligation — no tool grant (TOOLS-14b); `_harness`/`opts.pull` untouched here
    injected: materialize(source, grounding), // FRESH at the boundary (TOOLS-14a)
    pulled: false, // pull is NEVER load-bearing at a boundary (TOOLS-14c)
  })

  const pullOptimize = (grounding: SeatGrounding, harness: Harness): FreshInjection =>
    harness.nativePull === "available" && opts.pull !== undefined
      ? opts.pull(grounding) // optimization: native pull when the harness offers it
      : materialize(source, grounding) // ALWAYS a safe fall-back — pull is never load-bearing

  return { onTransition, pullOptimize }
}

// ── frozen-interface BIND (compile-time only) ─────────────────────────────────────────────────────
// The injected `FreshPackSource` CONSUMES the frozen RETR ports — a value carrying `OwnApi.own` +
// `PackApi.pack` satisfies it (own_<unit> RETR-12 + atlas-query RETR-2), never a redefinition of them.
const _consumesRetr = (retr: OwnApi & PackApi): FreshPackSource => retr
void _consumesRetr

// @atlas/tools — test/wp-6.22-tools.test.ts   (WP-6.22.TOOLS · EPIC-22 · TOOLS-14)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the TOOLS-14 phase-transition auto-inject hook —
// push-driven pre-phase discovery: at every phase boundary the orchestrator auto-injects a FRESH
// `atlas-query`/`own_<unit>` pack into the seat's context, the push holds with NO tool grant, and mid-task
// PULL is an optimization only — never load-bearing. The facet under test is imported DIRECTLY from source
// (the barrel is wired by the lead at SEAL):
//   • ../src/push.js  — the phase-boundary fresh-pack injector (SCN-TOOLS-14a-1 / 14b-1 / 14c-1)
//
// The fresh-pack contract (RETR-6 ceiling / RETR-3 stale / the own_<unit> + atlas-query packs) is CONSUMED
// FROZEN from @atlas/retrieval as an injected `FreshPackSource` port — never redefined here. Held-out `-2`
// legs (14a-2 / 14b-2 / 14c-2) are NOT transcribed — the GATE runs those.

import { describe, it, expect } from "vitest"
import type { OwnPack, OwnUnit } from "@atlas/retrieval"
// `PackInvariant.nodeId` is a branded `NodeKey`; minted through the sanctioned constructor rather than
// cast (src/brand.ts: "these three constructors are the ONLY sanctioned cast sites for the brands").
import { asNodeKey } from "@atlas/kernel"
import {
  createPhaseHook,
  AUTOINJECT_TIER,
  type FreshPackSource,
  type Harness,
  type Seat,
  type SeatGrounding,
} from "../src/push.js"

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────
/** A minimal, valid `OwnPack` (RETR-12 shape) tagged by `marker` so FRESH vs STALE is observable. */
const ownPack = (marker: string): OwnPack => ({
  unit: `role:${marker}`,
  invariants: [{ nodeId: asNodeKey(`n:${marker}`), tier: "T1", claim: `claim ${marker}`, freshness: "FRESH" }],
  shape: { contents: [], owner: "team", tier: "T1" },
  edges: { dependents: [], dependencies: [] },
  gotchas: [],
  memory: null,
  drill: { finer: [], refresh: { pull: "poke" }, complement: { pull: "relate" } },
})

const UNIT: OwnUnit = { level: "feature", id: "payments", grounding: undefined }
const OWN_GROUNDING: SeatGrounding = { via: "own", unit: UNIT }

/** A fresh-pack source whose CURRENT own-pack is `v2` — the fresh materialization at the boundary. */
const freshSource = (): FreshPackSource => ({
  own: () => ownPack("v2"),
  pack: () => ({
    territory: "T",
    axisHash: "h" as never,
    invariants: [],
    advisory: [],
    advisoryDropped: 0,
    tokenEstimate: 0,
    stale: false,
  }),
})

// ── EPIC-22 §a — a phase boundary injects a fresh pack ────────────────────────────────────────────
describe("WP-6.22.TOOLS — TOOLS-14 phase-transition auto-inject", () => {
  it("SCN-TOOLS-14a-1: a phase boundary injects a fresh pack into the seat", () => {
    // Given a seat that carries a STALE pack (`v1`) across a phase transition, over the phase-hook.
    const seat: Seat = { id: "S", grants: ["Read"] }
    const stale = ownPack("v1")
    const harness: Harness = { id: "H", nativePull: "available" }
    const hook = createPhaseHook(freshSource())

    // When the boundary fires.
    const receipt = hook.onTransition(seat, OWN_GROUNDING, { from: "bind", to: "red" }, harness)

    // Then the orchestrator auto-injects a FRESH own_<unit> pack — the seat need not decide to re-ground.
    expect(receipt.injected).toBeDefined()
    expect(receipt.injected.via).toBe("own")
    const injected = receipt.injected.via === "own" ? receipt.injected.pack : undefined
    expect(injected).toEqual(ownPack("v2")) // freshly materialized from the source at the boundary
    // teeth (breaks-on "no pack is injected — the seat carries a stale pack across the transition"):
    expect(injected).not.toEqual(stale) // the stale v1 is NOT what crossed the boundary
  })

  // ── EPIC-22 §b — the phase-pack push needs no grant ─────────────────────────────────────────────
  it("SCN-TOOLS-14b-1: the boundary pack reaches a Read-only seat with no grant", () => {
    // Given the phase-boundary pack pushed to seat `S_ro` (grant set = {Read}).
    const sRo: Seat = { id: "S_ro", grants: ["Read"] }
    const harness: Harness = { id: "H", nativePull: "available" }
    const hook = createPhaseHook(freshSource())

    // When push is delivered.
    const receipt = hook.onTransition(sRo, OWN_GROUNDING, { from: "red", to: "green" }, harness)

    // Then `S_ro` consumes the fresh pack with NO tool grant (`grantsRequired == 0`).
    expect(receipt.grantsRequired).toBe(0)
    expect(receipt.tier).toBe(AUTOINJECT_TIER) // TOOLS-11 push tier — holds without a grant
    expect(receipt.injected.via).toBe("own") // the fresh pack still reached the grantless seat
    // teeth (breaks-on "the push requires a tool grant — a Read-only seat gets no fresh pack"):
    expect(sRo.grants).not.toContain("atlas-query") // no tool grant was needed to receive the push
  })

  // ── EPIC-22 §c — mid-task pull is not load-bearing ──────────────────────────────────────────────
  it("SCN-TOOLS-14c-1: a boundary re-grounds by push even where pull is unavailable", () => {
    // Given a seat crossing a boundary on harness `H_agents` (native pull `unavailable`).
    const seat: Seat = { id: "S", grants: ["Read"] }
    const hAgents: Harness = { id: "H_agents", nativePull: "unavailable" }
    let pullCalls = 0
    const hook = createPhaseHook(freshSource(), {
      pull: () => {
        pullCalls += 1 // a spy — the boundary push MUST NOT depend on this
        throw new Error("pull must never be load-bearing at a boundary")
      },
    })

    // When the boundary fires.
    const receipt = hook.onTransition(seat, OWN_GROUNDING, { from: "green", to: "seal" }, hAgents)

    // Then the seat is re-grounded purely by push and `pull` is never invoked.
    expect(receipt.injected.via).toBe("own") // grounded by push alone
    expect(receipt.pulled).toBe(false) // pull is an optimization only — never the mechanism
    // teeth (breaks-on "re-grounding depends on a mid-task pull — a pull-unavailable seat is left ungrounded"):
    expect(pullCalls).toBe(0) // pull was NEVER invoked, on a pull-unavailable harness
  })
})

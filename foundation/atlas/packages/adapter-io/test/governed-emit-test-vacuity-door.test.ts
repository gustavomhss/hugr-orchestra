// @atlas/adapter-io — test/governed-emit-test-vacuity-door.test.ts  (#95 D5 — the test-vacuity door's soundness gates)
//
// The producer always drives `origin:'promoted'` + a `gateHolds:()=>'HOLDS'` stub, so through it the two MOST
// soundness-critical gates of `governed-emit-test-vacuity.ts` are NEVER executed — a one-token regression on
// either stays green while re-opening the false-proven surface (lucy cold-review, WP-TV-1a FIX-FIRST). These
// tests drive `emitTestVacuity` DIRECTLY (through the real `createGovernedEmit(...).emit`) with a valid proven
// node, pinning exactly those two branches:
//   - gate 1.1 PRODUCED-ONLY (the forge guard, line 92) — an AUTHORED (or origin-unset) proven test-vacuity is
//     REFUSED `REJECTED_AUTHORED_TEST_VACUITY`. Its witness is not door-re-derivable, so persisting it would be
//     the false-proven leak. Deleting gate 1.1 ⇒ the authored seal COMMITS ⇒ this test goes red.
//   - gate 1 HEAD TRUTH (line 88) — the RELATION-ladder gate that distinguishes this door from the transition
//     door's skip: a node whose grounding does NOT re-derive FRESH at HEAD (`gateHolds !== 'HOLDS'`) is REFUSED
//     `REJECTED_UNGROUNDED`. Deleting gate 1 (transition's isGrounded-only path) ⇒ a drifted node COMMITS ⇒ red.
// Each is pinned with a DOUBLY-violating input (SCN-GE-I11): the refusal proves the SPECIFIC gate fired, not
// merely line order. Gate 1.1 (origin) and gate 2 (authz) share teeth with test-vacuity-producer.test.ts.

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it, expect, afterEach } from "vitest"
import { asHash, asSubtreeHash } from "@atlas/kernel"
import type { Hash, StructRef } from "@atlas/contracts"
import { currentNodes } from "@atlas/knowledge"
import type { Status } from "@atlas/contracts"
import { trySoundTestVacuity } from "@atlas/genesis"
import type { TestVacuityProposal } from "@atlas/genesis"
import { createDiskStore, rehydrateProjection } from "../src/store.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import type { AtlasPolicy } from "../src/policy.js"
import type { TestVacuityEmit } from "../src/test-vacuity-source.js"
import { REJECTED_AUTHORED_TEST_VACUITY } from "../src/governed-emit-test-vacuity.js"
import { REJECTED_UNGROUNDED } from "../src/governed-emit-reasons.js"

const UNIT = "src/foo.test.ts"
const ACTOR = "seat:owner"
const OTHER = "seat:intruder" // NOT a member of scope 'src'
const AT: Hash = asHash("head-sha") // the test-vacuity door USES `at` — the HEAD the truth gate re-derives against
const POLICY: AtlasPolicy = { t0Heuristic: { keywords: [] }, authz: { scopes: { src: [ACTOR] } } }
const HOLDS = { gateHolds: () => "HOLDS" as Status }
const DRIFTED = { gateHolds: () => "DRIFTED" as Status }

const anchor: StructRef = { kind: "file", qualifiedPath: UNIT, subtreeHash: asSubtreeHash("st-foo") }
const proposal: TestVacuityProposal = {
  kind: "test-vacuity",
  unitKey: UNIT,
  testName: "swallows the rejection",
  shape: "assertion-only-in-catch",
  grounding: { entries: [{ anchor, path: UNIT }] },
  tier: "T2",
  scope: "src",
}
/** The VALID proven node the producer would build — genesis is the seal authority (verifier ⇒ 'proven'). */
const validNode = trySoundTestVacuity(proposal, () => "proven")!

function doorFor(
  dir: string,
  opts: { gate?: typeof HOLDS; actor?: string; origin?: "promoted" | "authored" } = {},
): { emit: TestVacuityEmit; landed: () => number } {
  const store = createDiskStore(join(dir, ".atlas"))
  const emit = createGovernedEmit({
    store,
    gate: opts.gate ?? HOLDS,
    policy: POLICY,
    actor: opts.actor ?? ACTOR,
    origin: opts.origin ?? "promoted",
    ratifyToken: "seat:ratifier",
  }).emit as TestVacuityEmit
  const landed = (): number =>
    currentNodes(rehydrateProjection(store)).filter((n) => n.family === "test-vacuity").length
  return { emit, landed }
}

let dir: string | undefined
afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

describe("#95 D5 — the test-vacuity door refuses on its two soundness gates (direct-drive, producer bypassed)", () => {
  it("CONTROL — a VALID promoted node under a HOLDS gate COMMITS (so the refusals below isolate the gate, not a broken fixture)", () => {
    dir = mkdtempSync(join(tmpdir(), "tv-door-"))
    const { emit, landed } = doorFor(dir)
    const out = emit(validNode, AT)
    expect(out.emitted).toBe(true)
    expect(landed()).toBe(1)
  })

  it("gate 1.1 FORGE GUARD (the false-proven leak) — an AUTHORED proven test-vacuity is REFUSED, nothing lands", () => {
    dir = mkdtempSync(join(tmpdir(), "tv-door-"))
    // origin 'authored' is the ONLY violation — HOLDS gate + authorized actor, so if gate 1.1 were deleted this
    // otherwise-valid proven seal would COMMIT (the leak). Deleting gate 1.1 turns this test red.
    const { emit, landed } = doorFor(dir, { origin: "authored" })
    const out = emit(validNode, AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected).toBe(REJECTED_AUTHORED_TEST_VACUITY)
    expect(landed()).toBe(0)
  })

  it("gate 1.1 DOUBLY-VIOLATING — authored AND unauthorized actor ⇒ the AUTHORED refusal wins (fires BEFORE authz)", () => {
    dir = mkdtempSync(join(tmpdir(), "tv-door-"))
    // Two gates would refuse (1.1 origin + 2 authz); the AUTHORED reason proves gate 1.1 fires first — the
    // disclosure-order pin (SCN-GE-I11): the caller learns nothing about scope authority on an authored forge.
    const { emit, landed } = doorFor(dir, { origin: "authored", actor: OTHER })
    const out = emit(validNode, AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected).toBe(REJECTED_AUTHORED_TEST_VACUITY)
    expect(landed()).toBe(0)
  })

  it("gate 1 HEAD TRUTH (the relation-ladder gate transition SKIPS) — a DRIFTED grounding is REFUSED ungrounded, nothing lands", () => {
    dir = mkdtempSync(join(tmpdir(), "tv-door-"))
    // `gateHolds` returns DRIFTED — the ONLY violation (promoted + authorized). Deleting gate 1 (the transition
    // door's isGrounded-only skip) would COMMIT this drifted node; this test goes red, isolating gate 1.
    const { emit, landed } = doorFor(dir, { gate: DRIFTED })
    const out = emit(validNode, AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected).toBe(REJECTED_UNGROUNDED)
    expect(landed()).toBe(0)
  })

  it("gate 1 DOUBLY-VIOLATING — DRIFTED AND unauthorized actor ⇒ the UNGROUNDED refusal wins (fires BEFORE authz)", () => {
    dir = mkdtempSync(join(tmpdir(), "tv-door-"))
    // Two gates would refuse (1 truth + 2 authz); the UNGROUNDED reason proves gate 1 fires first, exactly the
    // main/relation door's increasing-disclosure order (the truth door precedes authz).
    const { emit, landed } = doorFor(dir, { gate: DRIFTED, actor: OTHER })
    const out = emit(validNode, AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected).toBe(REJECTED_UNGROUNDED)
    expect(landed()).toBe(0)
  })
})

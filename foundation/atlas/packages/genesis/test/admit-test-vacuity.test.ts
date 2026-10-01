// @atlas/genesis — test/admit-test-vacuity.test.ts  (#95 · ADR-0015 D5 — the test-vacuity SOUND-SEAL leg)
//
// The seal authority (`trySoundTestVacuity`) gates on an INJECTED `verifyTestVacuity` closure and mints
// `seal:'proven'` ONLY when it returns `'proven'` — the single-anchor analogue of the relation AR-1/AR-3 leg.
// The verifier is a plain stub here (in production it is `scanTestVacuity`-backed, adapter-io): the point is
// that GENESIS is the seal authority — a proven seal is minted iff the oracle re-proves, never self-certified,
// and the claimNorm/witness derive from the (shape, testName) legs, never from model prose.

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import { testVacuityKey } from "@atlas/knowledge"
import type { TestVacuityProposal } from "@atlas/genesis"
import {
  trySoundTestVacuity,
  testVacuityClaimNormFromWitness,
  admitTestVacuity,
  DROP_TEST_VACUITY_MALFORMED,
  DROP_TEST_VACUITY_UNPROVEN,
} from "../src/admit-test-vacuity.js"

const anchor: StructRef = { kind: "file", qualifiedPath: "src/foo.test.ts", subtreeHash: asSubtreeHash("st-foo") }
const grounding = { entries: [{ anchor, path: "src/foo.test.ts" }] } as TestVacuityProposal["grounding"]

const proposal = (over: Partial<TestVacuityProposal> = {}): TestVacuityProposal => ({
  kind: "test-vacuity",
  unitKey: "src/foo.test.ts",
  testName: "swallows the rejection",
  shape: "assertion-only-in-catch",
  grounding,
  tier: "T2",
  scope: "src",
  ...over,
})

const PROVE = (): "proven" => "proven"
const ABSTAIN = (): "abstain" => "abstain"

describe("trySoundTestVacuity — the seal is minted IFF the injected oracle re-proves (D5)", () => {
  it('the injected verifier returns "proven" ⇒ a proven-sealed node with a re-runnable witness', () => {
    const node = trySoundTestVacuity(proposal(), PROVE)
    expect(node).toBeDefined()
    expect(node!.kind).toBe("test-vacuity")
    expect(node!.seal).toBe("proven")
    expect(node!.witness).toEqual({ shape: "assertion-only-in-catch", testName: "swallows the rejection" })
    // identity is MINTED from (unitKey, testName), never trusted off a payload id leg.
    expect(String(node!.id)).toBe(String(testVacuityKey("src/foo.test.ts", "swallows the rejection")))
    expect(node!.authoring).toBe("PROVEN")
    // the PRODUCER path passes no score ⇒ no obviousness on a produced structural fact (honest — no harness door).
    expect(node!.obviousness).toBeUndefined()
  })

  it('the injected verifier returns "abstain" ⇒ undefined (no false-proven, no advisory fallthrough)', () => {
    expect(trySoundTestVacuity(proposal(), ABSTAIN)).toBeUndefined()
  })

  it("no verifier wired ⇒ undefined (abstain-shaped, never a seal)", () => {
    expect(trySoundTestVacuity(proposal(), undefined)).toBeUndefined()
  })

  it("a score fn ⇒ obviousness derived FROM THE WITNESS sentence (harness path), never model prose", () => {
    const node = trySoundTestVacuity(proposal(), PROVE, () => ({ rank: "non-obvious", by: "harness-predicate" }))
    expect(node!.obviousness).toEqual({ rank: "non-obvious", by: "harness-predicate" })
    const derived = testVacuityClaimNormFromWitness({
      shape: "assertion-only-in-catch",
      testName: "swallows the rejection",
    })
    expect(derived).toContain("swallows the rejection")
    expect(derived).toContain("catch")
  })
})

describe("admitTestVacuity — the harness dispatch arm (PROVEN-only, no advisory form)", () => {
  const grounded = (): boolean => true
  const score = (): { rank: "obvious"; by: "harness-predicate" } => ({ rank: "obvious", by: "harness-predicate" })

  it("well-formed + grounded + proven ⇒ admitted proven fact", () => {
    const a = admitTestVacuity(proposal(), PROVE, grounded, score)
    expect(a.outcome).toBe("admitted")
    if (a.outcome !== "admitted") throw new Error("unreachable")
    expect(a.fact.seal).toBe("proven")
  })

  it("the oracle abstains ⇒ DROPPED (no advisory downgrade — this family is proven-only)", () => {
    const a = admitTestVacuity(proposal(), ABSTAIN, grounded, score)
    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toBe(DROP_TEST_VACUITY_UNPROVEN)
  })

  it("a malformed identity (empty testName) ⇒ DROPPED malformed (testVacuityKey never throws)", () => {
    const a = admitTestVacuity(proposal({ testName: "" }), PROVE, grounded, score)
    expect(a.outcome).toBe("dropped")
    if (a.outcome !== "dropped") throw new Error("unreachable")
    expect(a.reason).toBe(DROP_TEST_VACUITY_MALFORMED)
  })

  it("ungrounded ⇒ DROPPED (the truth door still rejects)", () => {
    const a = admitTestVacuity(proposal(), PROVE, () => false, score)
    expect(a.outcome).toBe("dropped")
  })
})

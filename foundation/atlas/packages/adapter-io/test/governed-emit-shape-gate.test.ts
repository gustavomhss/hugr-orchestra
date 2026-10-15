// @atlas/adapter-io — test/governed-emit-shape-gate.test.ts  (WP-10.A3.ADAPTER — the extracted GATE CHAIN)
//
// Two things are under test, both scoped to THIS WP:
//   (1) AUTHOR-12 — the NEW `grounding` shape gate turns the 2026-07-25 dogfood's raw
//       `Cannot read properties of undefined (reading 'length')` into a structured, legible refusal, and
//       refuses EXACTLY the malformed-grounding space that used to throw — never a shape the door already
//       accepted (an empty `entries: []`, an off-type `subtreeHash`/`qualifiedPath`).
//   (2) AUTHOR-11 / the GateChain contract — `runGateChain` (the store-less fold, `governed-emit-gates.ts`)
//       agrees with the REAL governed door on WHICH gate refuses first, including on inputs that fail TWO
//       gates simultaneously (the only shape that can reveal an order divergence — PROP-AUTH-11's own
//       teeth clause).
//
// `REAL_TRUTH_GATE` below reproduces the PRODUCTION wiring (`grounding-computer.ts`'s `gateHolds` wrapper
// over `@atlas/grounding`'s real `isGrounded`/`driftDetect`) rather than a `HOLDS`/`NA` double, because the
// crash this WP closes lives INSIDE that real implementation — a fake gate never reaches it.

import { describe, it, expect } from "vitest"
import { bindGate, isGrounded, driftDetect } from "@atlas/grounding"
import { asSubtreeHash } from "@atlas/kernel"
import type { Axes, IndexNode } from "@atlas/index"
import type { GroundedFact } from "@atlas/knowledge"
import type { TruthGate } from "@atlas/tools"
import { createGovernedEmit } from "../src/governed-emit.js"
import { runGateChain, groundingWellFormed, evalShapeGate } from "../src/governed-emit-gates.js"
import { reasonOf } from "./door-regression-support.js"
import { makeStoreSpy, POLICY, advisory, AT } from "./harness/governed-fixtures.js"

// PROP-AUTH-12's own predicate: a reason is "runtime-error-shaped" iff it matches a type-error, a stack
// frame, an undefined-property read, or a bare `undefined` — tested against the DISCRIMINANT (everything
// before the first `:`, `reasonOf`'s own convention), since a reason's PROSE is free to explain the defect
// it closes (as `REJECTED_MALFORMED_GROUNDING` does) without that explanation being mistaken for a crash.
function runtimeErrorShaped(rejected: string | undefined): boolean {
  const discriminant = reasonOf(rejected)
  return (
    discriminant === "" ||
    /TypeError|ReferenceError|RangeError/.test(discriminant) ||
    /Cannot read propert/.test(discriminant) ||
    /^\s*at\s/.test(discriminant) ||
    discriminant === "undefined"
  )
}

/** An empty index root — `resolveCurrent`'s `findByKey` walks `key`/`children`, so a real (if empty) tree
 *  is required once a grounding is well-formed-enough to reach `driftDetect`'s resolution loop. */
const EMPTY_NODE: IndexNode = {
  axis: "spatial",
  level: "repo",
  key: "",
  subtreeHash: asSubtreeHash("empty"),
  children: [],
  objects: [],
}
const EMPTY_AXES: Axes = { spatial: EMPTY_NODE, territory: EMPTY_NODE, dependency: EMPTY_NODE, edges: [] }

// The REAL truth-gate wiring (mirrors `packages/adapter-io/src/grounding-computer.ts`'s `gateHolds`), over
// an EMPTY (but well-formed) `Axes` — sufficient because every case here either never reaches
// `driftDetect`/`isGrounded` (a shape refusal short-circuits first) or is deliberately routed to
// `NA`/`DRIFTED` (nothing here needs a real match against `src`).
const REAL_GATE_DEPS = { isGrounded, driftDetect }
const REAL_TRUTH_GATE: TruthGate = {
  gateHolds: (node, _at) => {
    const g = node as unknown as { kind: string; status?: string; grounding: unknown }
    const status = g.kind === "predicate" ? (g.status ?? "NA") : "HOLDS"
    return bindGate(REAL_GATE_DEPS).gateHolds(status, g.grounding as never, EMPTY_AXES)
  },
}

/** A well-formed advisory whose `grounding` field is overwritten with `malformed` — every other field the
 *  door reads stays well-formed, so ANY refusal here is attributable to `grounding` alone. */
function withGrounding(malformed: unknown): GroundedFact {
  const base = advisory("core") as unknown as Record<string, unknown>
  return { ...base, grounding: malformed } as unknown as GroundedFact
}

describe("WP-10.A3.ADAPTER — AUTHOR-12 the grounding shape gate (2026-07-25 dogfood)", () => {
  it("SCN-AUTH-12c-1 — the EXACT dogfood payload (grounding.entries absent) no longer throws; the reason names a gate, not a runtime error", () => {
    // BASELINE, proving the crash is real against the PRODUCTION gate wiring (never against a fake): a
    // `grounding` object with no `entries` reaches `driftDetect`/`isGrounded` and throws exactly the
    // 2026-07-25 dogfood's message — this is what the shape gate must intercept.
    expect(() => REAL_TRUTH_GATE.gateHolds(withGrounding({}), AT)).toThrow(/Cannot read propert/)

    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: REAL_TRUTH_GATE, policy: POLICY, actor: "alice" })
    const out = emit(withGrounding({}), AT)

    expect(out.emitted).toBe(false)
    // legible: names a gate (the reason's own discriminant), never a runtime-error shape.
    expect(reasonOf(out.rejected)).toBe("malformed grounding")
    expect(runtimeErrorShaped(out.rejected)).toBe(false)
    // nothing was persisted — the write door never reached the truth gate at all.
    expect(spy.puts()).toHaveLength(0)
    expect(spy.persists()).toHaveLength(0)
  })

  it("SCN-AUTH-12a-1 — a fact whose `grounding.entries` is absent entirely ⇒ the refusal names the `shape` gate", () => {
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: REAL_TRUTH_GATE, policy: POLICY, actor: "alice" })
    const out = emit(withGrounding({ notEntries: [] }), AT)
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe("malformed grounding")
  })

  it("SCN-AUTH-12d-1 — a fuzzed malformed-grounding space is ALL refused legibly, none throws", () => {
    const fuzz: readonly unknown[] = [
      undefined, // `grounding` absent entirely
      null,
      42,
      "a string",
      [],
      {}, // no `entries`
      { entries: undefined },
      { entries: null },
      { entries: "not-an-array" },
      { entries: {} },
      { entries: [null] },
      { entries: [undefined] },
      { entries: [42] },
      { entries: [{}] }, // entry with no `anchor`
      { entries: [{ anchor: null }] },
      { entries: [{ anchor: undefined }] },
      { entries: [{ anchor: "not-an-object" }] },
      { entries: [{ anchor: {} }, null] }, // one good, one bad — `every` must still refuse
      // prototype-polluting key — must not be treated as a real `entries` array member
      { entries: [{ anchor: {} }], __proto__: { entries: "polluted" } },
      // oversized: still just an array — must not throw on size alone
      { entries: Array.from({ length: 5000 }, () => ({ anchor: {} })) },
    ]
    for (const malformed of fuzz) {
      const spy = makeStoreSpy()
      const { emit } = createGovernedEmit({ store: spy.store, gate: REAL_TRUTH_GATE, policy: POLICY, actor: "alice" })
      expect(() => emit(withGrounding(malformed), AT)).not.toThrow()
      const out = emit(withGrounding(malformed), AT)
      if (out.emitted) continue // the oversized-but-well-formed entries[5000] case may legitimately clear every gate to `emitted:true` or fail truth — either is fine, it must simply never THROW
      expect(out.rejected).toBeDefined()
      expect(runtimeErrorShaped(out.rejected)).toBe(false)
      expect(reasonOf(out.rejected)).not.toBe("")
    }
  })

  it("groundingWellFormed refuses EXACTLY the throwing space, never a shape the door already accepted", () => {
    // Previously non-throwing shapes (empty entries; off-type subtreeHash/qualifiedPath) must still PASS
    // the shape gate — they are refused (or accepted) downstream, by the TRUTH gate, exactly as before.
    expect(groundingWellFormed(withGrounding({ entries: [] }))).toBe(true)
    expect(groundingWellFormed(withGrounding({ entries: [{ anchor: { subtreeHash: "" }, path: "x" }] }))).toBe(true)
    expect(groundingWellFormed(withGrounding({ entries: [{ anchor: { qualifiedPath: 42 }, path: "x" }] }))).toBe(true)
    // Previously-throwing shapes must now be refused.
    expect(groundingWellFormed(withGrounding(undefined))).toBe(false)
    expect(groundingWellFormed(withGrounding({}))).toBe(false)
    expect(groundingWellFormed(withGrounding({ entries: null }))).toBe(false)
    expect(groundingWellFormed(withGrounding({ entries: [null] }))).toBe(false)
    expect(groundingWellFormed(withGrounding({ entries: [{}] }))).toBe(false)
  })

  it("lucy cold-review — doubly-malformed (canonical-form violation AND malformed grounding) keeps the OLD door's reason: `canonical-form violation`, never `malformed grounding`", () => {
    // ADDRESSABILITY (0.5) must run BEFORE the grounding check — `addressOf` excludes `grounding` from
    // canonicalization (KERNEL-8) so it never THROWS on a malformed grounding regardless of order, but
    // ORDER still decides WHICH reason a doubly-malformed payload gets, and that reason is the door's
    // user-visible contract. Before this fix a payload malformed BOTH ways (a float ⇒ canonical-form
    // violation, AND an absent `grounding.entries`) answered `malformed grounding` — a reason the OLD door
    // (before this WP existed) never gave, because the old door never reached a grounding check at all and
    // its `addressOf` call ran first and refused the float. That is a decision change this WP is forbidden
    // to make, even though `emitted:false` on both sides makes it easy to miss.
    const doublyMalformed = { ...advisory("core"), confidence: 0.5, grounding: undefined } as unknown as GroundedFact

    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: REAL_TRUTH_GATE, policy: POLICY, actor: "alice" })
    const out = emit(doublyMalformed, AT)

    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe("canonical-form violation") // NOT `malformed grounding`
    expect(out.rejected).toContain("floats forbidden")

    // CONTROL — the SAME payload with the float removed (grounding-malformed ALONE) still gets the NEW
    // reason: the fix does not widen `canonical-form violation` to swallow every doubly-malformed input,
    // it only re-orders which check runs FIRST when both apply.
    const groundingOnlyMalformed = { ...advisory("core"), grounding: undefined } as unknown as GroundedFact
    const groundingOnlyOut = emit(groundingOnlyMalformed, AT)
    expect(reasonOf(groundingOnlyOut.rejected)).toBe("malformed grounding")
  })

  it("an empty `entries: []` — well-formed, but ungrounded — still reaches and fails the TRUTH gate (never intercepted as malformed)", () => {
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: REAL_TRUTH_GATE, policy: POLICY, actor: "alice" })
    const out = emit(withGrounding({ entries: [] }), AT)
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe("ungrounded") // NOT `malformed grounding` — the shape gate does not widen
  })

  it("a well-formed grounded fact is UNCHANGED — emits exactly as before the shape gate existed", () => {
    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: REAL_TRUTH_GATE, policy: POLICY, actor: "alice" })
    const fact = withGrounding({
      entries: [
        {
          anchor: { kind: "symbol", qualifiedPath: "src/util.ts::greet", subtreeHash: "sh-greet" },
          path: "src/util.ts",
        },
      ],
    })
    const out = emit(fact, AT)
    // `REAL_TRUTH_GATE` re-derives against an empty `Axes`, so this anchor does not resolve ⇒ DRIFTED — the
    // point here is that it reaches the TRUTH gate and gets a REAL verdict, not a shape refusal.
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe("ungrounded")
  })
})

describe("WP-10.A3.ADAPTER — AUTHOR-11 GateChain fold parity (`runGateChain` ≡ the door)", () => {
  it("SCN-AUTH-11a-1 — a fact that fails BOTH the truth gate and the authz gate ⇒ both the fold and the door report TRUTH first", () => {
    // ungrounded (empty entries) AND authored by an out-of-scope actor — a DOUBLY-violating input, the only
    // shape that can reveal an order divergence (PROP-AUTH-11's own teeth clause).
    const fact = withGrounding({ entries: [] })
    const factOutOfScope = { ...fact, scope: "secret" } as GroundedFact

    const spy = makeStoreSpy()
    const { emit } = createGovernedEmit({ store: spy.store, gate: REAL_TRUTH_GATE, policy: POLICY, actor: "alice" })
    const doorOut = emit(factOutOfScope, AT)
    expect(reasonOf(doorOut.rejected)).toBe("ungrounded")

    const chainOut = runGateChain(factOutOfScope, AT, {
      store: spy.store,
      gate: REAL_TRUTH_GATE,
      policy: POLICY,
      actor: "alice",
    })
    expect(chainOut.firstFailure?.gate).toBe("truth")
    expect(reasonOf(chainOut.firstFailure?.reason)).toBe("ungrounded")
  })

  it("fold parity — a boundary-straddling corpus (single- and multi-gate failures) agrees on the FIRST refusing gate, door vs fold", () => {
    const wellFormedGrounding = {
      entries: [
        {
          anchor: { kind: "symbol", qualifiedPath: "src/util.ts::greet", subtreeHash: "sh-greet" },
          path: "src/util.ts",
        },
      ],
    }
    const corpus: readonly { readonly label: string; readonly fact: GroundedFact; readonly actor: string }[] = [
      { label: "malformed tier alone", fact: { ...advisory("core"), tier: "T9" as never }, actor: "alice" },
      { label: "malformed scope alone", fact: { ...advisory(), scope: ["core"] as never }, actor: "alice" },
      { label: "malformed grounding alone", fact: withGrounding(undefined), actor: "alice" },
      { label: "ungrounded alone (well-formed, empty entries)", fact: withGrounding({ entries: [] }), actor: "alice" },
      {
        label: "unauthorized alone (well-formed + grounded-shape but wrong scope)",
        fact: { ...withGrounding(wellFormedGrounding), scope: "secret" } as GroundedFact,
        actor: "alice",
      },
      {
        label: "malformed tier + unauthorized (shape must win)",
        fact: { ...advisory("secret"), tier: "T9" as never },
        actor: "alice",
      },
      {
        label: "malformed grounding + unauthorized (shape must win)",
        fact: { ...withGrounding(undefined), scope: "secret" } as GroundedFact,
        actor: "alice",
      },
      {
        label: "ungrounded + unauthorized (truth must win)",
        fact: { ...withGrounding({ entries: [] }), scope: "secret" } as GroundedFact,
        actor: "alice",
      },
      {
        label: "ungrounded + empty actor (truth must win over authz)",
        fact: withGrounding({ entries: [] }),
        actor: "",
      },
      { label: "grounded-shape but drifted + empty actor", fact: withGrounding(wellFormedGrounding), actor: "" },
    ]

    for (const { label, fact, actor } of corpus) {
      const spy = makeStoreSpy()
      const deps = { store: spy.store, gate: REAL_TRUTH_GATE, policy: POLICY, actor }
      const { emit } = createGovernedEmit(deps)
      const doorOut = emit(fact, AT)
      const chainOut = runGateChain(fact, AT, deps)

      // The door's OWN reason and the fold's first-failure reason must be the SAME discriminant.
      const doorDiscriminant = reasonOf(doorOut.rejected)
      const chainDiscriminant = chainOut.firstFailure === undefined ? "" : reasonOf(chainOut.firstFailure.reason)
      expect(chainDiscriminant, `[${label}] door said "${doorDiscriminant}", fold said "${chainDiscriminant}"`).toBe(
        doorDiscriminant,
      )
      expect(chainOut.wouldEmit, `[${label}]`).toBe(doorOut.emitted)
    }
  })
})

describe("WP-10.A3.ADAPTER — evalShapeGate carries a remedy on every refusal (AUTHOR-12b)", () => {
  it("every SHAPE refusal in the corpus carries a non-empty remedy", () => {
    const cases: readonly GroundedFact[] = [
      { ...advisory("core"), tier: "T9" as never },
      { ...advisory(), scope: ["core"] as never },
      withGrounding(undefined),
      { ...advisory("core"), kind: "predicate" as never }, // predicate with no `check` ⇒ malformed family
    ]
    for (const fact of cases) {
      const verdict = evalShapeGate(fact, undefined)
      expect(verdict.pass).toBe(false)
      if (!verdict.pass) {
        expect(verdict.result.remedy).toBeDefined()
        expect(verdict.result.remedy!.length).toBeGreaterThan(0)
        expect(verdict.result.gate).toBe("shape")
      }
    }
  })
})

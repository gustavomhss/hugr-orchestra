// @atlas/knowledge — test/wp-closed-slot-gate.test.ts  (#152 — the closed-13 vocabulary, ENFORCED)
//
// KNOW-10's closed-slot rule was stated in THREE places and enforced in NONE:
//   1. `types.ts` `PredicateSlot`  — a TYPE union. Erased at runtime, so at a value boundary it enforces
//                                     nothing, and every value that reaches the write door came from
//                                     `JSON.parse` + a cast (the CLI wire) or a bare `object` MCP schema.
//   2. `router.ts` `PREDICATE_SLOTS` / `SLOT_SET` / `isKnownSlot`  — KNOW-15i. Zero production callers.
//   3. `template.ts` `CLOSED_SLOTS` / `isClosedSlot`               — KNOW-10.  Zero production callers.
// The `-1` goldens were green on (3) throughout, which is the exact shape of false assurance this file
// exists to replace: a membership guard can be perfectly correct and guard nothing.
//
// WHAT IS PINNED HERE (the binary-level story is `e2e-blackbox/test/s29-closed-slot.blackbox.test.ts`):
//   A. ONE RUNTIME LIST — (2) and (3) are now the SAME set, by delegation, not by two transcriptions that
//      agree today. A drift test over two literal copies can only ever notice drift AFTER it ships.
//   B. THE GATE — `upsert` REFUSES a present-and-unrecognised slot, before it routes.
//   C. ABSENT STANDS ASIDE — the decision, executable. See `write/closed-slot.ts` for the argument.
//   D. THE REFUSAL IS ACTIONABLE and STRUCTURALLY RECOGNISABLE — it names the value, the vocabulary and the
//      door, and it is identified by a discriminant VALUE rather than by `instanceof` or by prose.

import { describe, it, expect } from "vitest"
import { PREDICATE_SLOTS, isKnownSlot } from "../src/write/router.js"
import { isClosedSlot } from "../src/write/template.js"
import { emptyStore, upsert } from "../src/write/upsert.js"
import type { StoreProjection, WriteRequest } from "../src/write/upsert.js"
import {
  CLOSED_SLOT_DISCRIMINANT,
  ClosedSlotError,
  closedSlotRefusalText,
  isClosedSlotError,
} from "../src/write/closed-slot.js"
import type { PredicateSlot } from "../src/types.js"

/** A minimal well-formed advisory write. `slot` is cast because the whole point is the value boundary: the
 *  frozen type forbids these strings and the wire hands them over anyway. */
const req = (slot?: string): WriteRequest => ({
  nodeKey: `nk-${slot ?? "none"}`,
  contentHash: `ch-${slot ?? "none"}`,
  family: "advisory",
  claimNorm: "cn",
  ...(slot !== undefined ? { slot: slot as PredicateSlot } : {}),
})

/** Every out-of-vocabulary shape a JSON wire (or an in-process embedder) can actually deliver. */
const OUT_OF_VOCAB: ReadonlyArray<readonly [string, unknown]> = [
  ["free-text", "free-text"],
  ["empty string", ""],
  ["case variant of a real slot", "Invariant"],
  ["whitespace-padded real slot", " invariant"],
  ["plural of a real slot", "invariants"],
  ["an array (property-key coercion hazard)", ["invariant"]],
  ["an object with toString", { toString: () => "invariant" }],
  ["a number", 7],
  ["null", null],
]

describe("#152 A — ONE runtime list: the KNOW-10 and KNOW-15i guards are the same set, by delegation", () => {
  it("the vocabulary is exactly 13 members, and they are PRINTED (never a bare count)", () => {
    // eslint-disable-next-line no-console
    console.log({ closedVocabulary: [...PREDICATE_SLOTS] })
    expect([...PREDICATE_SLOTS]).toStrictEqual([
      "invariant",
      "contract",
      "precondition",
      "postcondition",
      "sideeffect",
      "ownership",
      "perf-bound",
      "security-property",
      "gotcha",
      "rationale",
      "dependency",
      "count",
      "definition",
    ])
  })

  it("isClosedSlot ≡ isKnownSlot over the 13 AND over every out-of-vocabulary shape", () => {
    for (const s of PREDICATE_SLOTS) {
      expect(isKnownSlot(s)).toBe(true)
      expect(isClosedSlot(s)).toBe(true)
    }
    const disagreements = OUT_OF_VOCAB.filter(([, v]) => isKnownSlot(v) !== isClosedSlot(v as PredicateSlot)).map(
      ([label]) => label,
    )
    // eslint-disable-next-line no-console
    console.log({ disagreements }) // NAMES, never a bare count
    expect(disagreements).toStrictEqual([])
    // ...and both say NO to every one of them.
    for (const [label, v] of OUT_OF_VOCAB) {
      expect({ label, known: isKnownSlot(v) }).toStrictEqual({ label, known: false })
    }
    expect(isKnownSlot(undefined)).toBe(false) // total over `unknown`, never a throw
  })
})

describe("#152 B/C — the gate at `upsert`: present-and-unrecognised REFUSES, absent stands aside", () => {
  it("every out-of-vocabulary slot is REFUSED, and the projection is left untouched", () => {
    const store: StoreProjection = emptyStore()
    const refused: string[] = []
    for (const [label, v] of OUT_OF_VOCAB) {
      let threw: unknown
      try {
        upsert(store, { ...req("x"), slot: v as PredicateSlot })
      } catch (e) {
        threw = e
      }
      expect(isClosedSlotError(threw)).toBe(true)
      expect((threw as ClosedSlotError).slot).toBe(v)
      refused.push(label)
    }
    // eslint-disable-next-line no-console
    console.log({ refused }) // ITEMS, never a bare count
    expect(refused).toStrictEqual(OUT_OF_VOCAB.map(([l]) => l))
    expect(store.current.size).toBe(0) // pure — nothing half-applied
    expect(store.cas.size).toBe(0)
  })

  it("every one of the 13 is ACCEPTED and routes normally — the gate is not an always-refuse mutant", () => {
    const accepted: PredicateSlot[] = []
    for (const s of PREDICATE_SLOTS) {
      const out = upsert(emptyStore(), req(s))
      expect(out.decision).toBe("CREATE")
      expect(out.store.current.get(`nk-${s}`)?.slot).toBe(s)
      accepted.push(s)
    }
    // eslint-disable-next-line no-console
    console.log({ accepted })
    expect(accepted).toStrictEqual([...PREDICATE_SLOTS])
  })

  it("C — an ABSENT slot is NOT a violation: the write routes, and the row carries no slot", () => {
    // THE DECISION, executable. `slot` is R3-OPTIONAL and genesis's only two fact constructors never set it
    // (0 of 300 measured model calls produced one), so fail-closed-on-absent would refuse every mined and
    // promoted write. An absent slot is also not the same HARM: it is deterministic, so slot-less facts at
    // one anchor COLLIDE and force UPDATE/union — the behaviour closedness exists to produce.
    const out = upsert(emptyStore(), req(undefined))
    expect(out.decision).toBe("CREATE")
    expect(out.store.current.get("nk-none")?.slot).toBeUndefined()
    expect("slot" in (out.store.current.get("nk-none") as object)).toBe(false) // ABSENT, not explicit undefined
  })
})

describe("#152 D — the refusal names the value, the vocabulary and the door, and is recognised by VALUE", () => {
  it("the reason text carries the offending value and all 13 members", () => {
    const text = closedSlotRefusalText("free-text-whatever")
    // eslint-disable-next-line no-console
    console.log({ reason: text })
    expect(text.split(":")[0]).toBe(CLOSED_SLOT_DISCRIMINANT)
    expect(text).toContain("'free-text-whatever'")
    for (const s of PREDICATE_SLOTS) expect(text).toContain(`'${s}'`)
    expect(text).toContain("atlas-emit") // the DOOR
  })

  it("a non-string offender is described by KIND rather than interpolated into a quoted string", () => {
    // Quoting it would be actively misleading: `'[object Object]'` reads as a slot NAME to go and look up,
    // and `{toString:() => 'invariant'}` would print as the very slot it is impersonating.
    expect(closedSlotRefusalText(["invariant"])).toContain("an array value")
    expect(closedSlotRefusalText({ toString: () => "invariant" })).toContain("an object value")
    expect(closedSlotRefusalText({ toString: () => "invariant" })).not.toContain("'invariant',  which")
    expect(closedSlotRefusalText(7)).toContain("a number value")
    expect(closedSlotRefusalText(undefined)).toContain("an undefined value")
    expect(closedSlotRefusalText(null)).toContain("a null value")
  })

  it("isClosedSlotError is STRUCTURAL — it survives a class-identity break, and does not over-fire", () => {
    // The hazard is real and named in `tools/src/fault.ts`: two `dist` copies of a package in one process
    // give two distinct class objects, under which `instanceof` answers false for a refusal this product
    // raised. A structural probe answers on the discriminant instead. Simulated by a plain object carrying
    // the same reason — what a second module instance's error would look like to this one.
    const fromAnotherInstance = Object.assign(new Error("…"), { reason: CLOSED_SLOT_DISCRIMINANT })
    expect(isClosedSlotError(fromAnotherInstance)).toBe(true)
    expect(isClosedSlotError(new ClosedSlotError("x"))).toBe(true)
    // and it must NOT swallow anything else — the door re-throws whatever this rejects.
    expect(isClosedSlotError(new Error("boom"))).toBe(false)
    expect(isClosedSlotError(new TypeError("boom"))).toBe(false)
    expect(isClosedSlotError({ reason: "governance-downgrade" })).toBe(false)
    expect(isClosedSlotError(undefined)).toBe(false)
    expect(isClosedSlotError(null)).toBe(false)
    expect(isClosedSlotError("closed-slot-violation")).toBe(false) // a bare string is not a refusal
  })

  it("the thrown error is a real Error with a non-engine name — so `classifyThrown` files it as REFUSED", () => {
    // `tools/src/fault.ts` classifies a thrown non-`Error` as internal, an ENGINE fault (TypeError,
    // RangeError, …) as internal, and everything else as a deliberate refusal whose message travels
    // VERBATIM. This assertion is what makes the reason text above reach the operator at all.
    const e = new ClosedSlotError("nope")
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe("ClosedSlotError")
    expect(["TypeError", "RangeError", "ReferenceError", "SyntaxError", "EvalError", "URIError"]).not.toContain(e.name)
    expect(e.message).toBe(closedSlotRefusalText("nope"))
  })
})

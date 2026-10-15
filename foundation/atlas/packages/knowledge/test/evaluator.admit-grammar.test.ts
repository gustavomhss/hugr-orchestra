// WP-FIX-6.KNOW · RED/GREEN — `admit` reads the check's TEXT, not just its `kind` (#200).
// Transcribes the visible golden SCN-KNOW-16a-3 (docs/requirements/goldens-knw.md).
//
// THE DEFECT. `admit` switched on `kind` alone and handed any `{kind:'assertion', expr}` straight back as
// evaluable, whatever the `expr` said. The evaluator's own grammar is five operators over ONE `IndexNode`,
// and an `expr` outside it does not fail loudly — it resolves to one of two SILENT wrong answers:
//   · `'anything at all'`        → `evalAssertion` finds no operator → `NA`, forever, on every index state;
//   · `'child-count|<key>|'`     → `Number('') === 0` → `HOLDS` on any node that happens to have 0 children;
//   · `'child-count|<key>|three'`→ `Number('three')` is `NaN`, `n === NaN` is false → `BROKEN`, always.
// The last two are the dangerous ones: a verdict nobody computed, carried to the reconcile merge gate as
// though a predicate had really been evaluated. This suite pins that they are REFUSED at the door instead.
//
// I3 — the five SHIPPED operators are pinned FIRST, admission and verdict both, so that a stricter door
// cannot silently narrow the language it is supposed to be guarding.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asHash } from "@atlas/kernel"
import type { IndexNode } from "@atlas/index"
import type { Check } from "@atlas/knowledge"
import { admit, evaluate, type ProposedCheck } from "../src/lifecycle/evaluator.js"

// ── fixtures (same shape as evaluator.know16.test.ts) ─────────────────────────

const leaf = (key: string, objects: string[] = []): IndexNode => ({
  axis: "spatial",
  level: "item",
  key,
  subtreeHash: asSubtreeHash(`st-${key}`),
  children: [],
  objects: objects.map(asHash),
})

const spatialIndex: IndexNode = {
  axis: "spatial",
  level: "repo",
  key: "spatial:root",
  subtreeHash: asSubtreeHash("root-spatial"),
  children: [leaf("mod:auth", ["obj:token"]), leaf("mod:store")],
  objects: [],
}

/** The exact string `packages/genesis/src/admit-harness.ts` used to fabricate for a type-expressible slot. */
const FABRICATED = "type-checker/LSP diagnostics: contract"

const refusalOf = (proposed: ProposedCheck): string => {
  const a = admit(proposed)
  if (a.evaluable) throw new Error(`expected a refusal, got an evaluable check: ${JSON.stringify(proposed)}`)
  return a.reason === "malformed-check" ? a.expected : a.reason
}

describe("WP-FIX-6.KNOW — the admission door reads the check EXPRESSION, not just its kind", () => {
  // ── I3 — pin the shipped language BEFORE narrowing anything ────────────────

  it("SCN-KNOW-16a-3 (pin): all five shipped operators are still ADMITTED and still evaluate identically", () => {
    const shipped: readonly (readonly [Check, "HOLDS" | "BROKEN" | "NA"])[] = [
      [{ kind: "index-query", query: "exists|mod:auth" }, "HOLDS"],
      [{ kind: "index-query", query: "exists|mod:missing" }, "BROKEN"],
      [{ kind: "index-query", query: "absent|mod:missing" }, "HOLDS"],
      [{ kind: "index-query", query: "absent|mod:auth" }, "BROKEN"],
      [{ kind: "index-query", query: "has-object|obj:token" }, "HOLDS"],
      [{ kind: "index-query", query: "has-object|obj:nope" }, "BROKEN"],
      [{ kind: "assertion", expr: "child-count|spatial:root|2" }, "HOLDS"],
      [{ kind: "assertion", expr: "child-count|spatial:root|7" }, "BROKEN"],
      [{ kind: "assertion", expr: "child-count|mod:absent|0" }, "NA"], // missing SUBJECT — the legitimate NA
      [{ kind: "assertion", expr: "subtree-hash|spatial:root|root-spatial" }, "HOLDS"],
      [{ kind: "assertion", expr: "subtree-hash|spatial:root|not-the-hash" }, "BROKEN"],
      [{ kind: "assertion", expr: "subtree-hash|mod:absent|whatever" }, "NA"],
    ]
    const admitted: string[] = []
    for (const [check, want] of shipped) {
      const a = admit(check)
      expect(a.evaluable, `REFUSED a shipped operator: ${JSON.stringify(check)}`).toBe(true)
      expect(evaluate(check, spatialIndex), `verdict changed for ${JSON.stringify(check)}`).toBe(want)
      admitted.push(`${JSON.stringify(check)} ⇒ ${want}`)
    }
    // printed, not counted — a bare `12` cannot tell anyone WHICH twelve.
    expect(admitted).toEqual([
      '{"kind":"index-query","query":"exists|mod:auth"} ⇒ HOLDS',
      '{"kind":"index-query","query":"exists|mod:missing"} ⇒ BROKEN',
      '{"kind":"index-query","query":"absent|mod:missing"} ⇒ HOLDS',
      '{"kind":"index-query","query":"absent|mod:auth"} ⇒ BROKEN',
      '{"kind":"index-query","query":"has-object|obj:token"} ⇒ HOLDS',
      '{"kind":"index-query","query":"has-object|obj:nope"} ⇒ BROKEN',
      '{"kind":"assertion","expr":"child-count|spatial:root|2"} ⇒ HOLDS',
      '{"kind":"assertion","expr":"child-count|spatial:root|7"} ⇒ BROKEN',
      '{"kind":"assertion","expr":"child-count|mod:absent|0"} ⇒ NA',
      '{"kind":"assertion","expr":"subtree-hash|spatial:root|root-spatial"} ⇒ HOLDS',
      '{"kind":"assertion","expr":"subtree-hash|spatial:root|not-the-hash"} ⇒ BROKEN',
      '{"kind":"assertion","expr":"subtree-hash|mod:absent|whatever"} ⇒ NA',
    ])
  })

  it("SCN-KNOW-16a-3 (pin): a key containing a `|` still reaches the interpreter intact", () => {
    // `evalQuery` splits at the FIRST bar and takes the whole remainder as the argument. The door must
    // split the same way, or it would refuse keys the interpreter can resolve.
    const weird: Check = { kind: "index-query", query: "exists|mod:a|b" }
    expect(admit(weird).evaluable).toBe(true)
    expect(evaluate(weird, spatialIndex)).toBe("BROKEN") // no such key — resolved, not refused
  })

  // ── I1 — the new refusal ───────────────────────────────────────────────────

  it("SCN-KNOW-16a-3: the FABRICATED type-oracle assertion is REFUSED, naming the expected form", () => {
    const reason = refusalOf({ kind: "assertion", expr: FABRICATED })
    expect(reason).toContain("child-count|<key>|<non-negative integer>")
    expect(reason).toContain("subtree-hash|<key>|<hash>")
    // the door quotes back WHAT IT READ, so the operator does not have to guess which of ten checks failed.
    expect(reason).toContain(FABRICATED)
    // and the silent answer it used to get instead:
    expect(evaluate({ kind: "assertion", expr: FABRICATED }, spatialIndex)).toBe("NA")
  })

  it("SCN-KNOW-16a-3: every unparseable ASSERTION is refused — including the two that FABRICATE a verdict", () => {
    const refused = [
      ["", "empty"],
      ["   ", "blank"],
      [FABRICATED, "the fabricated type-oracle string"],
      ["unknown-op|spatial:root|2", "an operator outside the shipped two"],
      ["child-count|spatial:root", "arity 2 — the count is missing"],
      ["child-count|spatial:root|2|extra", "arity 4"],
      ["child-count|spatial:root|", 'EMPTY count — `Number("")` is 0, so this used to answer HOLDS'],
      ["child-count|spatial:root|three", "NON-NUMERIC count — `NaN`, so this used to answer BROKEN"],
      ["child-count|spatial:root|-1", "a negative count — no node can have one"],
      ["child-count|spatial:root|2.5", "a fractional count"],
      ["child-count||2", "an empty key"],
      ["subtree-hash|spatial:root", "arity 2 — the hash is missing"],
      ["subtree-hash|spatial:root|", "an empty hash"],
      ["subtree-hash||root-spatial", "an empty key"],
    ] as const
    const seen: string[] = []
    for (const [expr, why] of refused) {
      const reason = refusalOf({ kind: "assertion", expr })
      expect(reason.length, `empty refusal reason for ${why}`).toBeGreaterThan(0)
      seen.push(`${JSON.stringify(expr)} — ${why}`)
    }
    expect(seen).toHaveLength(refused.length)
    expect(seen[6]).toBe('"child-count|spatial:root|" — EMPTY count — `Number("")` is 0, so this used to answer HOLDS')
    expect(seen[7]).toBe('"child-count|spatial:root|three" — NON-NUMERIC count — `NaN`, so this used to answer BROKEN')
  })

  it("SCN-KNOW-16a-3: the two FABRICATING assertions really did produce an uncomputed verdict", () => {
    // the anti-vacuity leg of the refusal above: without it these two are not hypothetical.
    const empty: Check = { kind: "assertion", expr: "child-count|mod:auth|" }
    const nan: Check = { kind: "assertion", expr: "child-count|spatial:root|three" }
    expect(evaluate(empty, spatialIndex)).toBe("HOLDS") // `mod:auth` has 0 children; `Number('')` is 0
    expect(evaluate(nan, spatialIndex)).toBe("BROKEN") // a BROKEN that would reach the merge gate
    // ...and BOTH are now refused before anything can carry that verdict anywhere.
    expect(admit(empty).evaluable).toBe(false)
    expect(admit(nan).evaluable).toBe(false)
  })

  it("SCN-KNOW-16a-3: every unparseable INDEX-QUERY is refused, naming the expected form", () => {
    // two SHAPES of refusal, and the message differs because the useful answer differs: an UNKNOWN
    // operator needs the whole menu, a known operator with a bad argument needs only its own form.
    const unknownOp = ["", "   ", "unrecognized-op|x", "child-count|spatial:root|2"] // the last: an
    const badArg = ["exists", "exists|", "exists|   ", "absent", "has-object|"] //  assertion op on the query leg
    const seen: string[] = []
    for (const query of unknownOp) {
      const r = refusalOf({ kind: "index-query", query })
      expect(r, `menu missing for ${JSON.stringify(query)}`).toContain(
        "exists|<key> · absent|<key> · has-object|<hash>",
      )
      expect(r).toContain(JSON.stringify(query))
      seen.push(`unknown-operator ${JSON.stringify(query)}`)
    }
    for (const query of badArg) {
      const r = refusalOf({ kind: "index-query", query })
      expect(r, `own-form missing for ${JSON.stringify(query)}`).toMatch(/^(exists|absent|has-object)\|</)
      expect(r).toContain("takes one non-empty argument")
      seen.push(`empty-argument ${JSON.stringify(query)}`)
    }
    expect(seen).toEqual([
      'unknown-operator ""',
      'unknown-operator "   "',
      'unknown-operator "unrecognized-op|x"',
      'unknown-operator "child-count|spatial:root|2"',
      'empty-argument "exists"',
      'empty-argument "exists|"',
      'empty-argument "exists|   "',
      'empty-argument "absent"',
      'empty-argument "has-object|"',
    ])
  })

  // ── the kind refusals are untouched (REQ-KNOW-16b / 16c) ───────────────────

  it("SCN-KNOW-16a-3: the two KIND refusals still fire, and are still distinguishable from the new one", () => {
    expect(refusalOf({ kind: "code-exec", script: "rm -rf / && run-tests" })).toBe("code-exec")
    expect(refusalOf({ kind: "runtime", behavior: "the endpoint returns 200 when called" })).toBe("runtime")
    const a = admit({ kind: "assertion", expr: FABRICATED })
    expect(a.evaluable === false && a.reason).toBe("malformed-check")
  })
})

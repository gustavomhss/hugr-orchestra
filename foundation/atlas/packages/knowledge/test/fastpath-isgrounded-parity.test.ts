// @atlas/knowledge — test/fastpath-isgrounded-parity.test.ts  (GROUND-2 SECURITY — the two predicates are now ONE)
//
// THE DEFECT THIS PINS. `isGrounded` (src/ratify/fastpath.ts) is the first conjunct of `route`'s
// auto-accept decision (`:126`/`:137`) — a candidate that reads as "grounded" here can land with NO human
// ratification. `subtreeHash`'s brand (`@atlas/contracts` `SubtreeHash = string & {brand}`) evaporates at
// runtime, and every value reaching a door may have come through `JSON.parse`, an SDK-parsed MCP argument,
// or a CAS blob — none of which enforce the brand. The pre-fix door body coerced BEFORE checking:
// `String(e.anchor.subtreeHash).length > 0`. `String()` on a hostile value is fail-OPEN, not fail-closed:
// `String(undefined)` → `"undefined"` (9 chars), `String(null)` → `"null"` (4), `String(0)` → `"0"`,
// `String(false)` → `"false"`, `String({})` → `"[object Object]"` (15) — every one of those non-empty
// strings PASSES `.length > 0`, so a candidate whose anchor carries `undefined`/`null`/`0`/`false`/`{}` as
// its "hash" read as grounded and auto-accepted. Only `''` and `[]` (whose `String()` is `''`) ever refused.
//
// THE DOOR FIX (56f0440), in place, no redesign: `typeof e.anchor.subtreeHash === 'string' &&
// e.anchor.subtreeHash.length > 0` — the coercion is gone, only an actual non-empty string clears the gate.
//
// THE SEALED PREDICATE IS NOW FIXED TOO (#203/#204). For a window there were TWO implementations of this ONE
// predicate: the door copy above and the SEALED `GroundApi['isGrounded']` (`@atlas/grounding` `drift.ts`).
// The sealed body was `e.anchor.subtreeHash.length > 0` with NO `typeof` guard — safe against the fail-OPEN
// bug (it never read a coerced string as grounded) but NOT total: `(undefined).length` / `(null).length`
// THREW a `TypeError`, contradicting its own "Pure + total" docstring, and — because `driftDetect` calls it
// FIRST (`¬isGrounded ⇒ DRIFTED`) — that throw propagated up the SEALED drift oracle and broke ITS "no
// throw" contract too; and a non-string carrier of a positive `.length` (an array, `{length:5}`, a boxed
// `String`) read as grounded. The sealed body now carries the SAME `typeof` guard, so the two predicates are
// BYTE-IDENTICAL, both total, both fail-closed. The `@atlas/grounding` "ships zero runtime yet" comments
// that once justified the duplicate were FALSE (only `types.js` is type-exported; `drift.js` — which value-
// exports `isGrounded` — is value-exported at `grounding/src/index.ts:17`); collapsing the door copy into a
// value-import of the sealed predicate is now a safe pure-dedup follow-up (a `packages/knowledge` change of
// direction that `layer-guard.mjs` permits), tracked separately. Until then, this is the fitness function
// that keeps the two bodies from diverging AGAIN: it drives BOTH over the same input table and asserts they
// agree on every row, that NEITHER throws, and that the dangerous fail-open divergence set is EMPTY.

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { SubtreeHash } from "@atlas/contracts"
import { isGrounded as localIsGrounded } from "../src/ratify/fastpath.js"
import { isGrounded as sealedIsGrounded } from "@atlas/grounding"
import type { Grounding } from "@atlas/grounding"

/** The PRE-FIX coercion logic, reproduced HERE ONLY so the before/after table below can print the old
 *  behaviour for the record. Never imported from production source, never executed against real data —
 *  this is documentation-as-code, not a code path anything depends on. */
function oldCoercedIsGroundedValue(hashValue: unknown): boolean {
  return String(hashValue).length > 0
}

/** The FIXED per-value check, restated standalone (matches the body now in BOTH src/ratify/fastpath.ts and
 *  @atlas/grounding drift.ts) so the table can show it beside the old one without the full `Grounding` shape. */
function newIsGroundedValue(hashValue: unknown): boolean {
  return typeof hashValue === "string" && hashValue.length > 0
}

/** Wrap a single hostile-or-honest value as the sole entry's `anchor.subtreeHash` of a `Grounding`. The
 *  cast is deliberate and confined to this test file: production code never manufactures a `SubtreeHash`
 *  this way, but a hostile caller (JSON.parse / MCP arg / CAS blob) can hand one of these values to a real
 *  door at runtime with no cast in sight, which is the whole point of the defect. */
function groundingWith(hashValue: unknown): Grounding {
  return {
    entries: [
      {
        anchor: { kind: "symbol", qualifiedPath: "src/x.ts::f", subtreeHash: hashValue as SubtreeHash },
        path: "src/x.ts",
      },
    ],
  }
}

// Synthetic — not a hash of anything real, not credential-shaped.
const VALID_HASH: SubtreeHash = asSubtreeHash("sh-synthetic-test-hash-0001")

/** The minimum table the brief specifies (undefined/null/''/0/false/{}/[]/valid string) PLUS the three
 *  non-string carriers of a positive `.length` that the un-guarded sealed body used to fail-open on, driven
 *  through BOTH implementations below. `expected` is the CORRECT (fail-closed) answer: never auto-accept. */
const COERCION_TABLE: ReadonlyArray<{ readonly label: string; readonly value: unknown; readonly expected: boolean }> = [
  { label: "undefined", value: undefined, expected: false },
  { label: "null", value: null, expected: false },
  { label: "'' (empty string)", value: "", expected: false },
  { label: "0", value: 0, expected: false },
  { label: "false", value: false, expected: false },
  { label: "{} (plain object)", value: {}, expected: false },
  { label: "[] (empty array)", value: [], expected: false },
  { label: "['a','b'] (NON-empty array)", value: ["a", "b"], expected: false },
  { label: "{length:5} (object wearing a .length)", value: { length: 5 }, expected: false },
  { label: 'new String("abc") (boxed String object)', value: new String("abc"), expected: false },
  { label: "valid non-empty hash string", value: VALID_HASH, expected: true },
]

/** Runs the sealed `isGrounded` and reports either its boolean or the sentinel `'THROWS'` — never lets an
 *  exception escape the helper. Retained (even though the sealed predicate is now total) so a REGRESSION
 *  that reintroduced a throw would be reported as `'THROWS'` and fail the assertion, not crash the run. */
function sealedObserved(g: Grounding): boolean | "THROWS" {
  try {
    return sealedIsGrounded(g)
  } catch {
    return "THROWS"
  }
}

describe("GROUND-2 fitness function — local isGrounded ≡ sealed GroundApi.isGrounded, no coercion escape", () => {
  it("prints the before/after coercion table (old fail-open String() vs new fail-closed typeof guard vs sealed) — sealed now AGREES on every row", () => {
    const rows = COERCION_TABLE.map((row) => ({
      input: row.label,
      "old String()-coerced (BUGGY, fail-open)": oldCoercedIsGroundedValue(row.value),
      "new typeof-guarded (FIXED, fail-closed)": newIsGroundedValue(row.value),
      "sealed @atlas/grounding isGrounded": sealedObserved(groundingWith(row.value)),
      expected: row.expected,
    }))
    // eslint-disable-next-line no-console -- deliberate: the brief asks for this table PRINTED.
    console.table(rows)
    for (const row of rows) {
      // BOTH implementations now answer the CORRECT fail-closed verdict on every row — no throw, no fail-open.
      expect(row["new typeof-guarded (FIXED, fail-closed)"]).toBe(row.expected)
      expect(row["sealed @atlas/grounding isGrounded"]).toBe(row.expected)
    }
  })

  it.each(COERCION_TABLE)(
    "local (knowledge) isGrounded: $label → grounded=$expected, never throws",
    ({ value, expected }) => {
      expect(() => localIsGrounded(groundingWith(value))).not.toThrow()
      expect(localIsGrounded(groundingWith(value))).toBe(expected)
    },
  )

  it.each(COERCION_TABLE)(
    "sealed (@atlas/grounding) isGrounded: $label → grounded=$expected, never throws (now total)",
    ({ value, expected }) => {
      // The sealed predicate is now total (the `typeof` guard replaced the raw `.length` access) — it fails
      // CLOSED to `false` on every hostile row instead of throwing on undefined/null or fail-opening on a
      // non-string `.length` carrier. A regression to either old behaviour turns this red (a throw surfaces as
      // the `'THROWS'` sentinel ≠ `expected`; a fail-open surfaces as `true` ≠ `expected`).
      expect(() => sealedIsGrounded(groundingWith(value))).not.toThrow()
      expect(sealedObserved(groundingWith(value))).toBe(expected)
    },
  )

  it("an entries-empty grounding is ungrounded on BOTH implementations, neither throws", () => {
    const g: Grounding = { entries: [] }
    expect(localIsGrounded(g)).toBe(false)
    expect(sealedObserved(g)).toBe(false)
  })

  it("a multi-entry grounding with ONE bad entry sinks the whole grounding (.every, never .some) — BOTH refuse, neither throws", () => {
    const g: Grounding = {
      entries: [
        { anchor: { kind: "symbol", qualifiedPath: "src/a.ts::f", subtreeHash: VALID_HASH }, path: "src/a.ts" },
        {
          anchor: { kind: "symbol", qualifiedPath: "src/b.ts::g", subtreeHash: undefined as unknown as SubtreeHash },
          path: "src/b.ts",
        },
      ],
    }
    // The bad entry is `undefined` — the row the un-guarded sealed body used to THROW on. Both now fail closed.
    expect(localIsGrounded(g)).toBe(false)
    expect(sealedObserved(g)).toBe(false)
  })

  it("FULL PARITY — local and sealed return the identical boolean on every row, and the fail-open divergence set is EMPTY", () => {
    // THE SECURITY PROPERTY THIS FILE EXISTS FOR. Earlier revisions could only assert ONE-WAY containment
    // (`sealed refuses ⇒ local refuses`) because the sealed reference was looser and non-total; #203 closed
    // that gap. Now the two predicates are equal, so the assertion is the strong one: byte-for-byte agreement
    // on the whole table, with NEITHER a fail-open (sealed accepts, local refuses) NOR a stale one-way gap.
    const localAcceptsSealedRefuses: string[] = []
    const sealedAcceptsLocalRefuses: string[] = []
    for (const row of COERCION_TABLE) {
      const g = groundingWith(row.value)
      const sealed = sealedObserved(g)
      const local = localIsGrounded(g)
      expect(local).toBe(row.expected) // local: always answers, always correctly, never throws
      expect(sealed).toBe(row.expected) // sealed: now identical — total and fail-closed
      if (local === true && sealed !== true) localAcceptsSealedRefuses.push(row.label)
      if (sealed === true && local !== true) sealedAcceptsLocalRefuses.push(row.label)
    }
    // Both divergence directions are now EMPTY — the two implementations are one predicate.
    expect(localAcceptsSealedRefuses).toEqual([])
    expect(sealedAcceptsLocalRefuses).toEqual([])
  })
})

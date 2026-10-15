// @atlas/index — test/unit-deps.test.ts  (#196a candidate-grounded — the RECALL source)
//
// `createUnitDeps` answers two questions dependency genesis needs over one SCIP output:
//   candidatesFor(unit) — the unit's CROSS-UNIT dep NAMES (referenced global whose DEF is in ANOTHER doc)
//   symbolsNamed(name)  — the DEFINED global symbols carrying that terminal descriptor name (gate resolution)
// The load-bearing property is the CROSS-UNIT discriminant: a symbol a unit BOTH defines and references is its
// OWN vocabulary, not a dependency, and must NOT appear in candidatesFor — the pollution a naive resolved-ref
// set carries (measured 2026-08-14).

import { describe, it, expect } from "vitest"
import type { ScipOutput } from "../src/types.js"
import { createUnitDeps, symbolTerminalName } from "../src/unit-deps.js"

const HASH = "scip-typescript npm @atlas/contracts 0.0.0 src/`hash.ts`/Hash#" //           defined in contracts
const CHARGE = "scip-typescript npm @atlas/pay 0.0.0 src/`pay.ts`/charge()." //            defined in pay
const LOCAL_T = "scip-typescript npm @atlas/pay 0.0.0 src/`pay.ts`/PayInput#" //           defined+used IN pay (own vocab)
const EXTERNAL = "scip-typescript npm node 0.0.0 fs/`fs.d.ts`/statSync()." //              referenced, never defined here

const scip: ScipOutput = {
  documents: [
    { relativePath: "src/contracts/hash.ts", occurrences: [{ symbol: HASH, role: "definition" }] },
    {
      relativePath: "src/pay/pay.ts",
      occurrences: [
        { symbol: CHARGE, role: "definition" }, //   pay defines charge…
        { symbol: LOCAL_T, role: "definition" }, //  …and its own PayInput type…
        { symbol: LOCAL_T, role: "reference" }, //   …which it also references (OWN vocab — not a dep)
        { symbol: HASH, role: "reference" }, //      …and depends on contracts' Hash (CROSS-UNIT)
        { symbol: EXTERNAL, role: "reference" }, //  …and calls a Node builtin (no in-index def — not a dep)
        { symbol: "local 3", role: "reference" }, // a document-scoped local (never a dep)
      ],
    },
  ],
} as unknown as ScipOutput

describe("#196a createUnitDeps — the candidate-grounded recall source", () => {
  const deps = createUnitDeps(scip)

  it("candidatesFor returns ONLY the cross-unit dependency names — own vocab, externals, locals excluded", () => {
    // Hash is defined in contracts and referenced in pay ⇒ a real cross-unit dep. PayInput (own vocab),
    // statSync (external/no-def), and `local 3` are all excluded. teeth: dropping the `defDoc !== self` guard
    // would leak `PayInput`; dropping the `resolved !== undefined` guard would leak `statSync`.
    expect(deps.candidatesFor("src/pay/pay.ts")).toEqual(["Hash"])
  })

  it("candidatesFor is empty for a unit with no cross-unit dep (contracts only DEFINES Hash)", () => {
    expect(deps.candidatesFor("src/contracts/hash.ts")).toEqual([])
  })

  it("candidatesFor is empty (never throws) for an unknown path", () => {
    expect(deps.candidatesFor("src/nope.ts")).toEqual([])
  })

  it("resolveDepFor binds a picked name to THIS UNIT'S OWN cross-unit symbol — the gate/parser leg", () => {
    // pay depends on Hash (cross-unit) ⇒ resolves to the real symbol.
    expect(deps.resolveDepFor("src/pay/pay.ts", "Hash")).toBe(HASH)
    // teeth (lucy BLOCKER): `charge` IS a defined global, but it is pay's OWN symbol, not a cross-unit dep of
    // pay — an index-wide lookup would resolve it; the per-unit resolver returns null so it is NOT admitted.
    expect(deps.resolveDepFor("src/pay/pay.ts", "charge")).toBeNull()
    // an off-list name (external / not referenced by this unit) ⇒ null ⇒ the parser abstains.
    expect(deps.resolveDepFor("src/pay/pay.ts", "statSync")).toBeNull()
    // contracts does not depend on Hash cross-unit (it DEFINES it) ⇒ null for that unit.
    expect(deps.resolveDepFor("src/contracts/hash.ts", "Hash")).toBeNull()
  })

  it("symbolTerminalName extracts the human name across descriptor suffixes", () => {
    expect(symbolTerminalName(HASH)).toBe("Hash") //     type `#`
    expect(symbolTerminalName(CHARGE)).toBe("charge") // method `().`
    expect(symbolTerminalName("scip x 0 `f.ts`/Y.")).toBe("Y") // term `.`
  })
})

describe("#196a createUnitDeps — MEMOIZED by scip identity (PERF waste-audit 2026-08-23)", () => {
  // The candidate arm builds it TWICE per pass (prompt candidate list + gate resolver) off the SAME `slotScip`
  // variable, so the memo collapses the O(occurrences) defDoc scan 2→1 within an arm (not across arms —
  // `readScipOrEmpty` returns a fresh object per call). Mutation-verified: drop the `WeakMap` and the two calls
  // return distinct instances.
  it("two calls with the SAME scip object return the SAME api instance (the defDoc scan runs once)", () => {
    expect(createUnitDeps(scip)).toBe(createUnitDeps(scip))
  })
  it("a DIFFERENT scip object gets its own instance (the memo keys on identity, not value)", () => {
    const other: ScipOutput = { documents: [] } as unknown as ScipOutput
    expect(createUnitDeps(other)).not.toBe(createUnitDeps(scip))
  })
})

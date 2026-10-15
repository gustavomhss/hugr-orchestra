// @atlas/index — test/symbol-reverse.test.ts  (#99b N0)
//
// `createSymbolReverse` builds a SYMBOL-keyed reverse-caller view over the SAME SCIP occurrences `deriveEdges`
// reads (build.ts), one granularity below the doc-level `dependencyAxis`. Its classification is `deriveEdges`'s
// verbatim: a `reference` to a NON-`local` symbol WITH an in-index `definition` ⇒ a resolved caller of it; a
// `reference` to a symbol with NO in-index definition ⇒ an `unresolved` hole (its doc is a hole source, NOT a
// resolved caller); a `local ` symbol contributes nothing. Endpoints are `nodeHashOfPath(relativePath)`, sorted
// + deduped so a rebuild is byte-identical.

import { describe, it, expect } from "vitest"
import type { ScipOutput } from "../src/types.js"
import { createSymbolReverse } from "../src/symbol-reverse.js"
import { nodeHashOfPath } from "../src/build.js"

// A global (non-`local`) SCIP symbol string: has a scheme/package/descriptor, stable across documents.
const GREET = "scip-ts npm fixture 1.0.0 `greet`()."
const NEVER = "scip-ts npm fixture 1.0.0 `never`()."
const UNKNOWN = "scip-ts npm fixture 1.0.0 `ffiTarget`()." // referenced but NEVER defined in-index ⇒ unresolved

// def.ts DEFINES greet + never (never is defined but referenced nowhere); a.ts + b.ts each REFERENCE greet;
// c.ts REFERENCES UNKNOWN (no in-index definition ⇒ an unresolved hole) and a `local 0` (document-scoped).
// d.ts REFERENCES ONLY a `local 7` — a document whose sole reference is document-scoped, so it must NOT be a
// hole source (the isolated witness that gives the `local`-contributes-nothing claim teeth: a mutant dropping
// the `isLocalSymbol` guard on the hole side would falsely add d.ts, and c.ts alone cannot catch it because
// c.ts is already a hole via UNKNOWN).
const scip: ScipOutput = {
  documents: [
    {
      relativePath: "src/def.ts",
      occurrences: [
        { symbol: GREET, role: "definition" },
        { symbol: NEVER, role: "definition" },
      ],
    },
    { relativePath: "src/a.ts", occurrences: [{ symbol: GREET, role: "reference" }] },
    { relativePath: "src/b.ts", occurrences: [{ symbol: GREET, role: "reference" }] },
    {
      relativePath: "src/c.ts",
      occurrences: [
        { symbol: UNKNOWN, role: "reference" },
        { symbol: "local 0", role: "reference" },
      ],
    },
    { relativePath: "src/d.ts", occurrences: [{ symbol: "local 7", role: "reference" }] },
  ],
}

const H = (p: string): string => String(nodeHashOfPath(p))
const asStrings = (hs: readonly unknown[]): string[] => hs.map(String)

describe("#99b N0 — createSymbolReverse (symbol-level reverse callers)", () => {
  it("(a) a global symbol referenced in 2 docs ⇒ BOTH docHashes as callers", () => {
    const rev = createSymbolReverse(scip)
    expect(asStrings(rev.reverseCallers(GREET)).sort()).toEqual([H("src/a.ts"), H("src/b.ts")].sort())
    // def.ts DEFINES greet but carries no `reference` to it ⇒ it is not itself a caller.
    expect(asStrings(rev.reverseCallers(GREET))).not.toContain(H("src/def.ts"))
  })

  it("(b) a `local ` symbol contributes NOTHING — empty callers AND its sole-reference doc is not a hole", () => {
    const rev = createSymbolReverse(scip)
    expect(rev.reverseCallers("local 0")).toEqual([])
    // TEETH (lucy N0): d.ts's ONLY reference is `local 7`. A `local` reference is document-scoped and cannot
    // hide a cross-document caller, so it must NOT open scope. A mutant that drops the `isLocalSymbol` guard on
    // the hole side would falsely add d.ts to holeSources — this kills it (c.ts cannot, it is a hole via UNKNOWN).
    expect(asStrings(rev.holeSources())).not.toContain(H("src/d.ts"))
  })

  it("(c) an unresolved reference ⇒ its doc in holeSources, and empty callers for that symbol", () => {
    const rev = createSymbolReverse(scip)
    // UNKNOWN has no in-index definition ⇒ references to it are unresolved holes, never resolved callers.
    expect(rev.reverseCallers(UNKNOWN)).toEqual([])
    // c.ts carries the unresolved reference ⇒ it is a hole source.
    expect(asStrings(rev.holeSources())).toContain(H("src/c.ts"))
    // the resolved-symbol docs are NOT hole sources.
    expect(asStrings(rev.holeSources())).not.toContain(H("src/a.ts"))
  })

  it("(d) determinism — a rebuild is byte-identical (sorted + deduped)", () => {
    const a = createSymbolReverse(scip)
    const b = createSymbolReverse(scip)
    expect(asStrings(a.reverseCallers(GREET))).toEqual(asStrings(b.reverseCallers(GREET)))
    expect(asStrings(a.holeSources())).toEqual(asStrings(b.holeSources()))
    // sorted invariant: the returned order equals its own String-sort.
    const callers = asStrings(a.reverseCallers(GREET))
    expect(callers).toEqual([...callers].sort())
    const holes = asStrings(a.holeSources())
    expect(holes).toEqual([...holes].sort())
  })

  it("(e) a defined-but-never-referenced symbol ⇒ empty callers", () => {
    const rev = createSymbolReverse(scip)
    expect(rev.reverseCallers(NEVER)).toEqual([])
  })

  it("(f) #220 `resolves` — true for a defined global (even if uncalled), FALSE for a phantom or a `local`", () => {
    const rev = createSymbolReverse(scip)
    // GREET is defined AND called; NEVER is defined but never referenced — BOTH resolve. This is the exact
    // discrimination the negation door needs: NEVER's `reverseCallers` is [] like a phantom's, but it RESOLVES,
    // so "NEVER is not called in S" is a genuine, groundable negative — not a vacuous one.
    expect(rev.resolves(GREET)).toBe(true)
    expect(rev.resolves(NEVER)).toBe(true)
    // UNKNOWN is referenced but has NO in-index definition ⇒ a phantom the index cannot see ⇒ does NOT resolve.
    expect(rev.resolves(UNKNOWN)).toBe(false)
    // a `local ` symbol is document-scoped (#189) ⇒ never resolves on the global rail.
    expect(rev.resolves("local 0")).toBe(false)
    // a symbol absent from the index entirely ⇒ does NOT resolve.
    expect(rev.resolves("scip-ts npm fixture 1.0.0 `neverSeen`().")).toBe(false)
  })
})

// #189 CROSS-PACKAGE CANON-AND-VERIFY. `scip-typescript` records a cross-package reference against the
// callee package's PUBLISHED-TYPES descriptor while the DEFINITION carries the SOURCE descriptor. TWO dist
// layouts occur (both must resolve): NESTED `dist/src/`X.d.ts`` (tsc default, 11 of 12 packages) and FLAT
// `dist/`X.d.ts`` (@atlas/contracts). `canonicalizeSymbol` rewrites either to `src/`X.ts`` so the caller is
// bucketed under the src-form the negation door / verify-fact query with — but ONLY when it lands on a real
// in-index definition (fail-closed). These fixtures mirror the exact shapes measured on `.atlas/index.scip`.
const SRC_DEF = "scip-typescript npm @atlas/index 0.0.0 src/`build.ts`/nodeHashOfPath."
const DIST_REF_NESTED = "scip-typescript npm @atlas/index 0.0.0 dist/src/`build.d.ts`/nodeHashOfPath." // tsc default
const DIST_REF_FLAT = "scip-typescript npm @atlas/index 0.0.0 dist/`build.d.ts`/nodeHashOfPath." // contracts-style
// a dist-form reference whose src-form is NOT defined in-index (a callee we cannot see) — must stay a hole.
const DIST_REF_GHOST = "scip-typescript npm @atlas/index 0.0.0 dist/src/`ghost.d.ts`/phantom."

const crossPkgScip: ScipOutput = {
  documents: [
    // the DEFINING package indexes the src form.
    { relativePath: "packages/index/src/build.ts", occurrences: [{ symbol: SRC_DEF, role: "definition" }] },
    // a CROSS-PACKAGE caller referencing the NESTED published descriptor (the dominant layout — untested by
    // the first cut, which is exactly why cross-package recall was still 0 for 11 of 12 packages).
    {
      relativePath: "packages/genesis/src/verify-fact.ts",
      occurrences: [{ symbol: DIST_REF_NESTED, role: "reference" }],
    },
    // a second caller referencing the FLAT published descriptor (contracts-style) — both layouts must resolve.
    { relativePath: "packages/adapter-io/src/y.ts", occurrences: [{ symbol: DIST_REF_FLAT, role: "reference" }] },
    // a caller of a dist-form symbol we have NO src def for — the fail-closed case.
    { relativePath: "packages/tools/src/x.ts", occurrences: [{ symbol: DIST_REF_GHOST, role: "reference" }] },
  ],
}

describe("#189 cross-package canon-and-verify — a dist/.d.ts reference resolves onto the src definition", () => {
  it("(g) a cross-package dist-form caller becomes VISIBLE in reverseCallers of the SRC-form symbol — BOTH layouts", () => {
    const rev = createSymbolReverse(crossPkgScip)
    // The negation door / verify-fact query the SRC-form symbol; both cross-package callers (recorded in
    // dist-form — one NESTED, one FLAT) must appear under it. Before canon both returned []; before the
    // nested-layout fix the genesis (NESTED) caller was still missing while adapter-io (FLAT) resolved.
    expect(asStrings(rev.reverseCallers(SRC_DEF))).toContain(H("packages/genesis/src/verify-fact.ts")) // NESTED
    expect(asStrings(rev.reverseCallers(SRC_DEF))).toContain(H("packages/adapter-io/src/y.ts")) // FLAT
    // and those caller docs are NO LONGER holes (they resolved via canon), so a scope containing them reads CLOSED.
    expect(asStrings(rev.holeSources())).not.toContain(H("packages/genesis/src/verify-fact.ts"))
    expect(asStrings(rev.holeSources())).not.toContain(H("packages/adapter-io/src/y.ts"))
  })

  it("(h) FAIL-CLOSED TEETH: a dist-form reference whose canon does NOT resolve STAYS a hole — never a fabricated caller", () => {
    const rev = createSymbolReverse(crossPkgScip)
    // `dist/`ghost.d.ts`/phantom.` canonicalises to `src/`ghost.ts`/phantom.`, which is NOT defined in-index.
    // Canon-and-verify must reject it: the caller doc stays an honest hole, and NO src symbol gains a caller.
    // A mutant that trusted canon WITHOUT the `defs.has` verify (canon-and-assume) would fabricate a caller
    // here and drop the doc from holeSources — the exact false-edge / false-negation vector this teeth kills.
    expect(asStrings(rev.holeSources())).toContain(H("packages/tools/src/x.ts"))
    expect(rev.reverseCallers("scip-typescript npm @atlas/index 0.0.0 src/`ghost.ts`/phantom.")).toEqual([])
    // the ghost src-form never had a definition ⇒ it must not resolve either.
    expect(rev.resolves("scip-typescript npm @atlas/index 0.0.0 src/`ghost.ts`/phantom.")).toBe(false)
  })

  it("(i) canon leaves a same-package src-form reference untouched (no over-rewrite)", () => {
    const samePkg: ScipOutput = {
      documents: [
        { relativePath: "packages/index/src/build.ts", occurrences: [{ symbol: SRC_DEF, role: "definition" }] },
        { relativePath: "packages/index/src/rollup.ts", occurrences: [{ symbol: SRC_DEF, role: "reference" }] },
      ],
    }
    const rev = createSymbolReverse(samePkg)
    // a src-form reference already resolves directly — canon must be a no-op on it, not corrupt the bucket.
    expect(asStrings(rev.reverseCallers(SRC_DEF))).toEqual([H("packages/index/src/rollup.ts")])
    expect(rev.holeSources()).toEqual([])
  })
})

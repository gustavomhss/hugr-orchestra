// @atlas/index — src/unit-deps.ts  (#196a candidate-grounded — the RECALL source for dependency genesis)
//
// The measured crux of dependency mining (#95 bench, 2026-08-14): a free-form LLM proposer names a HUMAN
// symbol (`execFileSync`, `id`) but the sound oracle (`verifyDependency`, @atlas/genesis) keys on the SCIP
// GLOBAL SYMBOL STRING — so a bare name never resolves and recall is 0. The fix is candidate-grounded
// SELECTION: the INDEX supplies the mechanical candidate set (a unit's real cross-unit dependencies), the LLM
// only SELECTS the non-obvious one, and the gate re-proves. Index = recall, LLM = salience, gate = precision.
// Measured live: recall 0 → 4/4 tried→proven, still sound (the pick must be in this index-derived set).
//
// A "cross-unit dependency" of a unit U = a GLOBAL symbol U REFERENCES whose DEFINITION lives in a DIFFERENT
// document. This is the SAME occurrence classification `deriveEdges` / `createSymbolReverse` use (non-`local`
// `reference` → a symbol with an in-index `definition`), with ONE added discriminant — the def's document ≠
// U's — which EXCLUDES the pollution a naive "resolved-global reference" set carries: a unit's OWN types and
// params (defined AND referenced in U) are not dependencies. Node/npm builtins have no in-index definition, so
// they are absent by construction (the oracle is internal-only, sound in any world). Pure, $0-LLM, no I/O, no
// clock, deterministic — a rebuild is byte-identical.

import { canonicalizeSymbol, isLocalSymbol, nodeHashOfPath } from "./build.js"
import type { ScipOutput } from "./types.js"

/** The two lookups dependency genesis needs over one SCIP output. Both pure + total (never throw). */
export interface UnitDepsApi {
  /** The cross-unit dependency NAMES a unit references — the CANDIDATE set shown to the model (prompt side).
   *  Empty for an unknown path or a unit with no cross-unit dep. Deterministic, sorted, deduped by name. */
  candidatesFor(unitPath: string): readonly string[]
  /** Resolve a picked NAME to THIS UNIT'S OWN cross-unit dependency symbol — the gate/parser binding that keeps
   *  the admitted fact tied to the unit (lucy cold-review BLOCKER: an index-wide name→symbol lookup let a name
   *  outside the unit's candidate list ride an unrelated sibling's same-named symbol). `null` when `name` is not
   *  a cross-unit dependency name of `unitPath` (an off-list guess, a builtin, a typo) — the caller then abstains.
   *  Deterministic: on the rare intra-unit terminal-name collision, the lexically-first symbol (a real dep of
   *  this unit either way). This is the SOUND resolution — the symbol is provably referenced by this unit. */
  resolveDepFor(unitPath: string, name: string): string | null
}

/** The terminal identifier of a SCIP descriptor chain — the human name a reader (and the model) sees:
 *  `…/Hash#` → `Hash`, `…/charge().` → `charge`, `…/X.` → `X`, `…/ns/` → `ns`. Empty when the tail is not a
 *  plain identifier — a measured 28% of this repo's definitions (overload-disambiguated methods `foo(2).`,
 *  backtick-escaped names carrying spaces/dots, `meta:` / type-parameter `[T]` / parameter `(name)`
 *  descriptors). Those FAIL SAFE — dropped from both the candidate set and resolution, never mis-extracted to a
 *  WRONG name (verified over the live 29,677-def index) — so they cost RECALL, never soundness. Widening the
 *  extractor is the recall follow-up; it is deliberately conservative here. */
export function symbolTerminalName(symbol: string): string {
  const m = symbol.match(/([A-Za-z0-9_$]+)\s*(?:#|\(\)\.|\.|\/)?$/)
  return m ? m[1]! : ""
}

/**
 * Build the unit-dependency view over one SCIP output. One index, assembled once:
 *   - `defDoc: Map<globalSymbol, defDocHash>` — first-definition-wins over non-`local` `definition`
 *     occurrences, mirroring `deriveEdges`'s `defs` but RETAINING the defining document (the cross-unit
 *     discriminant `deriveEdges` projects away).
 * Both lookups are computed from ONE per-unit walk (`crossUnitDepMap`): a unit's `reference` occurrences whose
 * resolved symbol (direct, or `canonicalizeSymbol` for a `dist/…d.ts` cross-package ref, #189) is DEFINED IN
 * ANOTHER document — exactly the sound cross-unit dependency set, keyed by terminal name. `candidatesFor` is
 * its key-set; `resolveDepFor` is its lookup. There is NO index-wide name→symbol map — resolution is per-unit,
 * so an admitted fact's symbol is provably referenced by the unit it is attributed to (lucy BLOCKER fix).
 *
 * [PERF, waste-audit 2026-08-23] `createUnitDeps` is MEMOIZED by `scip` OBJECT IDENTITY (a module-level
 * `WeakMap`): the candidate-grounded arm builds it TWICE per pass — once for the prompt candidate list
 * (`createUnitDepCandidates`), once for the gate resolver (`createDepResolver`) — off the SAME `slotScip`
 * variable, so the `defDoc` O(all-occurrences) scan collapses 2→1 within an arm (6→3 across the default 3-arm
 * run). NOTE the honest bound: `readScipOrEmpty` returns a FRESH `ScipOutput` per call (only the raw protobuf
 * decode is memoized, not the object), so each arm gets its OWN `WeakMap` entry — this does NOT dedup across
 * arms (that cross-arm collapse belongs to `canonicalizeSkeleton`, which is object-memoized at its source).
 * Pure function of `scip` ⇒ the shared instance is byte-identical to a fresh build; the `WeakMap` releases with
 * the `ScipOutput`, adding no lifetime.
 */
const unitDepsCache = new WeakMap<ScipOutput, UnitDepsApi>()
export function createUnitDeps(scip: ScipOutput): UnitDepsApi {
  const memo = unitDepsCache.get(scip)
  if (memo !== undefined) return memo
  const api = buildUnitDeps(scip)
  unitDepsCache.set(scip, api)
  return api
}

function buildUnitDeps(scip: ScipOutput): UnitDepsApi {
  const defDoc = new Map<string, string>()
  for (const doc of scip.documents) {
    const h = String(nodeHashOfPath(doc.relativePath))
    for (const occ of doc.occurrences) {
      if (occ.role === "definition" && !isLocalSymbol(occ.symbol) && !defDoc.has(occ.symbol)) defDoc.set(occ.symbol, h)
    }
  }

  // The SRC-form symbol a reference resolves to, or undefined if it resolves to no in-index definition
  // (an external/builtin/unresolved ref — a hole, never a cross-unit dep). Mirrors `createSymbolReverse`.
  const resolvedDef = (symbol: string): string | undefined =>
    defDoc.has(symbol) ? symbol : defDoc.has(canonicalizeSymbol(symbol)) ? canonicalizeSymbol(symbol) : undefined

  const docByPath = new Map(scip.documents.map((d) => [d.relativePath, d]))

  /** name → the unit's OWN cross-unit dependency symbol (lexically-first on a rare intra-unit name collision).
   *  Memoized per unit path — the same walk backs both `candidatesFor` (keys) and `resolveDepFor` (lookup). */
  const cache = new Map<string, ReadonlyMap<string, string>>()
  const crossUnitDepMap = (unitPath: string): ReadonlyMap<string, string> => {
    const memo = cache.get(unitPath)
    if (memo !== undefined) return memo
    const doc = docByPath.get(unitPath)
    const byName = new Map<string, string>()
    if (doc !== undefined) {
      const self = String(nodeHashOfPath(unitPath))
      for (const occ of doc.occurrences) {
        if (occ.role !== "reference" || isLocalSymbol(occ.symbol)) continue
        const resolved = resolvedDef(occ.symbol)
        if (resolved === undefined) continue //          external/builtin/unresolved — not a cross-unit dep
        if (defDoc.get(resolved) === self) continue //   defined IN this unit — its own vocabulary, not a dep
        const n = symbolTerminalName(resolved)
        if (n === "") continue
        const prev = byName.get(n)
        if (prev === undefined || resolved < prev) byName.set(n, resolved) // deterministic: lexically-first symbol
      }
    }
    cache.set(unitPath, byName)
    return byName
  }

  return {
    candidatesFor: (unitPath) => [...crossUnitDepMap(unitPath).keys()].sort(),
    resolveDepFor: (unitPath, name) => crossUnitDepMap(unitPath).get(name) ?? null,
  }
}

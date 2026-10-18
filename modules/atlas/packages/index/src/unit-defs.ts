// @atlas/index — src/unit-defs.ts  (#196d candidate-grounded — the RECALL source for DEFINITION genesis)
//
// The third candidate view beside `unit-deps.ts` (fan-out) and `unit-exports.ts` (fan-in). Dependency mining
// asks "what does unit U REFERENCE across units"; count mining asks "which of U's exports are referenced, and
// by HOW MANY"; DEFINITION mining asks the simplest question of the three — "which GLOBAL symbols does U
// DEFINE at all". Same candidate-grounded principle (#196a): the INDEX supplies RECALL (the closed set of a
// unit's own definitions), the LLM supplies SALIENCE (which one is worth recording), the sound
// `verifyDefinition` oracle (@atlas/genesis) supplies PRECISION (the def-occurrence lies under the scope).
//
// A unit U's DEFINITION candidate = a NON-`local` global symbol whose FIRST-definition-wins def-doc IS U — the
// EXACT `defDoc.get(resolved) === self` predicate `unit-exports.ts` uses (:88/:124), MINUS the cross-unit-
// caller filter (a definition fact is groundable whether or not the symbol is called — the witness is the
// def-occurrence itself, not a caller). `local ` symbols contribute nothing (SCIP document-scoping, #189).
// Pure, $0-LLM, no I/O, no clock, deterministic — a rebuild is byte-identical.

import { isLocalSymbol, nodeHashOfPath } from "./build.js"
import { symbolTerminalName } from "./unit-deps.js"
import type { ScipOutput } from "./types.js"

/** The two lookups DEFINITION genesis needs over one SCIP output. Both pure + total (never throw). */
export interface UnitDefsApi {
  /** The NAMES of the GLOBAL symbols a unit DEFINES — the CANDIDATE set shown to the model (prompt side).
   *  Empty for an unknown path or a unit that defines no non-`local` symbol. Deterministic, sorted, deduped
   *  by terminal name. */
  definitionsFor(unitPath: string): readonly string[]
  /** Resolve a picked NAME to THIS UNIT'S OWN defined symbol — the gate/parser binding that keeps the admitted
   *  fact tied to the unit (the #196a lucy BLOCKER discipline: an index-wide name→symbol lookup let an off-list
   *  name ride an unrelated sibling's same-named symbol). `null` when `name` is not a symbol defined in
   *  `unitPath` (off-list guess, a reference-only name, a typo) — the caller then abstains. Deterministic: on a
   *  rare intra-unit terminal-name collision, the lexically-first symbol (a real definition of this unit either
   *  way). */
  resolveDefFor(unitPath: string, name: string): string | null
}

/**
 * Build the unit-definitions view over one SCIP output. One table, assembled once:
 *   - `defDoc: Map<globalSymbol, defDocHash>` — first-definition-wins over non-`local` `definition` occurrences
 *     (byte-for-byte `unit-deps.ts`'s / `unit-exports.ts`'s `defDoc` / `createSymbolReverse`'s `defs`).
 * The per-unit candidate/resolve map (name → symbol) is memoized: one walk over the unit's own definitions
 * backs both `definitionsFor` (keys) and `resolveDefFor` (lookup). NO index-wide name→symbol map exists —
 * resolution is per-unit, so an admitted fact's symbol is provably DEFINED IN the unit it is attributed to.
 *
 * [PERF, waste-audit 2026-08-23] MEMOIZED by `scip` object identity (mirrors `createUnitDeps`): the definition
 * arm builds it twice per pass (candidate list + gate resolver) off the same `slotScip` variable, so the
 * O(all-occurrences) defDoc scan collapses 2→1 within an arm (`readScipOrEmpty` returns a fresh object per call,
 * so no cross-arm dedup). Pure function of `scip` ⇒ shared instance is byte-identical to a fresh build.
 */
const unitDefsCache = new WeakMap<ScipOutput, UnitDefsApi>()
export function createUnitDefs(scip: ScipOutput): UnitDefsApi {
  const memo = unitDefsCache.get(scip)
  if (memo !== undefined) return memo
  const api = buildUnitDefs(scip)
  unitDefsCache.set(scip, api)
  return api
}

function buildUnitDefs(scip: ScipOutput): UnitDefsApi {
  const defDoc = new Map<string, string>()
  for (const doc of scip.documents) {
    const h = String(nodeHashOfPath(doc.relativePath))
    for (const occ of doc.occurrences) {
      if (occ.role === "definition" && !isLocalSymbol(occ.symbol) && !defDoc.has(occ.symbol)) defDoc.set(occ.symbol, h)
    }
  }

  /** name → the unit's OWN defined symbol (lexically-first on a rare intra-unit name collision). Memoized per
   *  unit path — the same walk backs both `definitionsFor` (keys) and `resolveDefFor` (lookup). */
  const cache = new Map<string, ReadonlyMap<string, string>>()
  const defMap = (unitPath: string): ReadonlyMap<string, string> => {
    const memo = cache.get(unitPath)
    if (memo !== undefined) return memo
    const byName = new Map<string, string>()
    const self = String(nodeHashOfPath(unitPath))
    // Only symbols DEFINED IN this unit (defDoc === self). No doc lookup needed — an unknown path hashes to a
    // `self` no definition maps to, yielding an empty map (total: never throws). Mirrors `unit-exports.ts`.
    for (const [symbol, defHash] of defDoc) {
      if (defHash !== self) continue
      const n = symbolTerminalName(symbol)
      if (n === "") continue // conservative name extraction (see `symbolTerminalName`) — costs recall, never a wrong name
      const prev = byName.get(n)
      if (prev === undefined || symbol < prev) byName.set(n, symbol) // deterministic: lexically-first
    }
    cache.set(unitPath, byName)
    return byName
  }

  return {
    definitionsFor: (unitPath) => [...defMap(unitPath).keys()].sort(),
    resolveDefFor: (unitPath, name) => defMap(unitPath).get(name) ?? null,
  }
}

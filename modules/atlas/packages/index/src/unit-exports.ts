// @atlas/index — src/unit-exports.ts  (#196c candidate-grounded — the RECALL source for CARDINALITY genesis)
//
// The fan-IN DUAL of `unit-deps.ts`. Dependency mining asks "what does unit U REFERENCE across units" (fan-out);
// count mining asks "which symbols U DEFINES are referenced by OTHER units, and by HOW MANY" (fan-in). Same
// candidate-grounded principle (#196a): the INDEX supplies RECALL + the NUMBER, the LLM supplies SALIENCE, the
// sound `verifyCount` oracle (@atlas/genesis) supplies PRECISION. The model NEVER emits the number — it only
// SELECTS one exported NAME from the closed list; the harness derives `atLeast` from the live reverse-caller feed.
//
// A unit U's COUNT candidate = a GLOBAL symbol U DEFINES that has ≥1 CROSS-UNIT caller (a `reference` occurrence
// in a document OTHER than U's). This reuses the EXACT occurrence classification `createSymbolReverse` uses (a
// non-`local` `reference` whose symbol — direct, or via `canonicalizeSymbol` for a `dist/…d.ts` cross-package
// ref, #189 — has an in-index definition). Own-vocab-only symbols (defined AND only self-referenced) and symbols
// with zero cross-unit callers are EXCLUDED — a count about them would be vacuous or abstain. Node/npm builtins
// have no in-index definition, so a caller's ref to one never buckets here. Pure, $0-LLM, no I/O, no clock,
// deterministic — a rebuild is byte-identical.
//
// SCOPE + `atLeast` ARE DERIVED, NOT ASKED (soundness by construction). For a picked export symbol B the reader
// computes the DISTINCT caller UNITS (docHashes, already the granularity `reverseCallers` reports), maps them to
// their repo-relative paths, and sets `atLeast = |callers|` and `scope = the callers' common SEGMENT-prefix` —
// the TIGHTEST scope that provably covers every witnessed caller. So `verifyCount`'s `countInScope(callers,
// pathOfHash, scope)` re-derives EXACTLY `atLeast` (`witnessed === atLeast`), proving every well-formed pick.
// See the returned card's framing note: a literal "repo-root" scope is INEXPRESSIBLE under the family's
// segment-wise `underScope` (no string is a prefix of every path; the empty scope matches NOTHING), so the
// callers' common prefix is the sound, expressible substitute — strictly more honest than a fabricated root.

import { canonicalizeSymbol, isLocalSymbol, nodeHashOfPath } from "./build.js"
import { symbolTerminalName } from "./unit-deps.js"
import type { ScipOutput } from "./types.js"

/** One resolved count candidate — the unit's OWN exported symbol, plus the harness-derived witnessed bound and
 *  the scope that bound ranges over. `atLeast` is a positive integer (a candidate has ≥1 cross-unit caller);
 *  `scope` is the callers' common segment-prefix (non-empty by construction — see `createUnitExports`). */
export interface ExportCount {
  readonly symbol: string //  the RESOLVED SCIP global symbol B defined in this unit (the fact's identity)
  readonly atLeast: number // the WITNESSED distinct caller-unit count — the sound lower bound the oracle re-proves
  readonly scope: string //   the callers' common segment-prefix — the scope `atLeast` ranges over
}

/** The two lookups CARDINALITY genesis needs over one SCIP output. Both pure + total (never throw). */
export interface UnitExportsApi {
  /** The NAMES of a unit's exported symbols that have ≥1 CROSS-UNIT caller — the CANDIDATE set shown to the
   *  model (prompt side). Empty for an unknown path or a unit whose exports are all own-vocab/uncalled.
   *  Deterministic, sorted, deduped by terminal name. */
  exportsWithCallersFor(unitPath: string): readonly string[]
  /** Resolve a picked NAME to THIS UNIT'S OWN exported symbol + its harness-derived `atLeast`/`scope` — the
   *  gate/parser binding that keeps the admitted fact tied to the unit (the #196a lucy BLOCKER discipline: an
   *  index-wide name→symbol lookup let an off-list name ride an unrelated sibling's same-named symbol). `null`
   *  when `name` is not an externally-called export of `unitPath` (off-list guess, own-vocab, uncalled export,
   *  typo) — the caller then abstains. Deterministic: on a rare intra-unit terminal-name collision, the
   *  lexically-first symbol (a real externally-called export of this unit either way). */
  resolveExportFor(unitPath: string, name: string): ExportCount | null
}

/** The longest common SEGMENT-prefix of `paths` (`/`-split), joined back with `/`. A single path yields itself
 *  (all segments). Empty (or a set that diverges at the first segment) yields `''` — which the family's
 *  segment-wise `underScope` matches NOTHING against, so the caller EXCLUDES such a symbol rather than emit a
 *  vacuous scope. Total: `[]` → `''`. */
function commonSegmentPrefix(paths: readonly string[]): string {
  if (paths.length === 0) return ""
  let segs = (paths[0] ?? "").split("/")
  for (let i = 1; i < paths.length; i++) {
    const ps = (paths[i] ?? "").split("/")
    let k = 0
    while (k < segs.length && k < ps.length && segs[k] === ps[k]) k++
    segs = segs.slice(0, k)
    if (segs.length === 0) return ""
  }
  return segs.join("/")
}

/**
 * Build the unit-exports (fan-in) view over one SCIP output. Three global tables, assembled once:
 *   - `defDoc: Map<globalSymbol, defDocHash>` — first-definition-wins over non-`local` `definition` occurrences
 *     (byte-for-byte `unit-deps.ts`'s `defDoc` / `createSymbolReverse`'s `defs`, retaining the defining doc).
 *   - `callers: Map<globalSymbol, Set<callerDocHash>>` — for each RESOLVED (in-index-defined) symbol, the
 *     DISTINCT documents carrying a `reference` to it, resolved exactly as `createSymbolReverse` resolves a
 *     caller (direct, or `canonicalizeSymbol` for a cross-package `dist/…d.ts` ref, #189). The Set dedupes to
 *     distinct UNITS — the granularity `reverseCallers` reports (no per-occurrence multiplicity in the frozen
 *     projection). Byte-identical to what the `verifyCount` oracle counts, so `atLeast` and its `witnessed` agree.
 *   - `pathByHash: Map<docHash, relativePath>` — the caller-hash→path table used to derive the common-prefix scope.
 * The per-unit candidate/resolve map (name → `ExportCount`) is memoized: one walk over the unit's own definitions
 * backs both `exportsWithCallersFor` (keys) and `resolveExportFor` (lookup). NO index-wide name→symbol map exists —
 * resolution is per-unit, so an admitted fact's symbol is provably DEFINED IN the unit it is attributed to.
 *
 * [PERF, waste-audit 2026-08-23] MEMOIZED by `scip` object identity (mirrors `createUnitDeps`): the count arm
 * builds it twice per pass (candidate list + gate resolver) off the same `slotScip` variable, so the
 * O(all-occurrences) defDoc+callers scan collapses 2→1 within an arm (`readScipOrEmpty` returns a fresh object
 * per call, so no cross-arm dedup). Pure function of `scip` ⇒ shared instance is byte-identical to a fresh build.
 */
const unitExportsCache = new WeakMap<ScipOutput, UnitExportsApi>()
export function createUnitExports(scip: ScipOutput): UnitExportsApi {
  const memo = unitExportsCache.get(scip)
  if (memo !== undefined) return memo
  const api = buildUnitExports(scip)
  unitExportsCache.set(scip, api)
  return api
}

function buildUnitExports(scip: ScipOutput): UnitExportsApi {
  const defDoc = new Map<string, string>()
  const pathByHash = new Map<string, string>()
  for (const doc of scip.documents) {
    const h = String(nodeHashOfPath(doc.relativePath))
    pathByHash.set(h, doc.relativePath)
    for (const occ of doc.occurrences) {
      if (occ.role === "definition" && !isLocalSymbol(occ.symbol) && !defDoc.has(occ.symbol)) defDoc.set(occ.symbol, h)
    }
  }

  // The SRC-form symbol a reference resolves to, or undefined if it resolves to no in-index definition
  // (an external/builtin/unresolved ref — a hole, never a caller). Mirrors `createSymbolReverse`/`unit-deps`.
  const resolvedDef = (symbol: string): string | undefined =>
    defDoc.has(symbol) ? symbol : defDoc.has(canonicalizeSymbol(symbol)) ? canonicalizeSymbol(symbol) : undefined

  const callers = new Map<string, Set<string>>()
  for (const doc of scip.documents) {
    const from = String(nodeHashOfPath(doc.relativePath))
    for (const occ of doc.occurrences) {
      if (occ.role !== "reference" || isLocalSymbol(occ.symbol)) continue
      const resolved = resolvedDef(occ.symbol)
      if (resolved === undefined) continue // external/builtin/unresolved — not a caller of any in-index symbol
      const set = callers.get(resolved) ?? new Set<string>()
      set.add(from)
      callers.set(resolved, set)
    }
  }

  /** name → this unit's externally-called export (lexically-first symbol on a rare intra-unit name collision).
   *  Memoized per unit path — the same walk backs both `exportsWithCallersFor` (keys) and `resolveExportFor`. */
  const cache = new Map<string, ReadonlyMap<string, ExportCount>>()
  const exportMap = (unitPath: string): ReadonlyMap<string, ExportCount> => {
    const memo = cache.get(unitPath)
    if (memo !== undefined) return memo
    const byName = new Map<string, ExportCount>()
    const self = String(nodeHashOfPath(unitPath))
    // Only symbols DEFINED IN this unit (defDoc === self). No doc lookup needed — an unknown path hashes to a
    // `self` no definition maps to, yielding an empty map (total: never throws).
    for (const [symbol, defHash] of defDoc) {
      if (defHash !== self) continue
      const callerSet = callers.get(symbol)
      if (callerSet === undefined) continue // uncalled export — no count to ground
      const crossUnit = [...callerSet].some((h) => h !== self)
      if (!crossUnit) continue // own-vocab-only (defined AND only self-referenced) — excluded, never vacuous
      const callerPaths: string[] = []
      for (const h of callerSet) {
        const p = pathByHash.get(h)
        if (p !== undefined) callerPaths.push(p)
      }
      const scope = commonSegmentPrefix(callerPaths)
      if (scope === "") continue // callers diverge at the repo root — no expressible covering scope (recall loss, sound)
      const atLeast = callerPaths.length // every caller is UNDER its own common prefix ⇒ witnessed === atLeast
      if (atLeast < 1) continue
      const n = symbolTerminalName(symbol)
      if (n === "") continue // conservative name extraction (see `symbolTerminalName`) — costs recall, never a wrong name
      const prev = byName.get(n)
      if (prev === undefined || symbol < prev.symbol) byName.set(n, { symbol, atLeast, scope }) // deterministic: lexically-first
    }
    cache.set(unitPath, byName)
    return byName
  }

  return {
    exportsWithCallersFor: (unitPath) => [...exportMap(unitPath).keys()].sort(),
    resolveExportFor: (unitPath, name) => exportMap(unitPath).get(name) ?? null,
  }
}

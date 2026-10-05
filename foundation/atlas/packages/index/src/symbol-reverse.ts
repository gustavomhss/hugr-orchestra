// @atlas/index — src/symbol-reverse.ts  (#99b N0 — symbol-level reverse callers, the negation completeness feed)
//
// A SYMBOL-keyed reverse-caller view over the SAME SCIP occurrences `deriveEdges` reads (build.ts), one
// granularity BELOW the doc-level `dependencyAxis` / `createDepgraph`. `deriveEdges` PROJECTS symbol identity
// onto `docHash`; N0 RETAINS the global symbol so "symbol X is never called" is answerable at all. It ADDS a
// sibling view — it does NOT touch `deriveEdges` or the doc-level `dependencyAxis`. Pure, $0-LLM, no I/O, no
// clock, deterministic (sorted + deduped ⇒ a rebuild is byte-identical, exactly as `deriveEdges` sorts).

import type { Hash } from "@atlas/contracts"
import { canonicalizeSymbol, isLocalSymbol, nodeHashOfPath } from "./build.js"
import type { ScipOutput } from "./types.js"

/** The ONE indexer whose `local ` scheme (and the `canonicalizeSymbol` dist→src regex, #189) is proven. The
 *  collapsed-local heuristic in `createSymbolReverse` (`opaqueRefSources`) is trusted ONLY for this indexer —
 *  a byte-identical MIRROR of the escape leg's gate (adapter-io/src/escape/target-escapes.ts `SUPPORTED_INDEXER`),
 *  duplicated here because @atlas/index sits BELOW adapter-io and cannot import it. */
const SUPPORTED_INDEXER = "scip-typescript"

/** The reverse-caller query for a GLOBAL symbol, one granularity below the doc-level `depgraph`. Pure + total. */
export interface SymbolReverseApi {
  /** The units (docHash) that carry a `reference` occurrence of the GLOBAL symbol `symbol` — i.e. the files
   *  that reference/call it. A `local ` symbol (SCIP document-scoped) or a symbol with no reference ⇒ `[]`.
   *  Deterministic, sorted, deduped. TOTAL: never throws. */
  reverseCallers(symbol: string): readonly Hash[]
  /** The units (docHash) carrying ANY `unresolved`/`dynamic` reference — the honest holes whose target the
   *  index cannot see (an FFI/reflective/cross-language ref that COULD reach any symbol). Symbol-INDEPENDENT;
   *  returned so a caller can intersect it with a declared scope S to decide `underApprox` for a negation over
   *  that scope. Deterministic, sorted, deduped. Mirrors `createDepgraph`'s `unresolvedSources`, one level down. */
  holeSources(): readonly Hash[]
  /** The units (docHash) carrying a CLASS-2 COLLAPSED cross-package reference — a `reference`-role `local `
   *  symbol with NO matching `local ` DEFINITION in that SAME document. SCIP document-scopes a `local N`, so a
   *  local ref with no local def is NOT a genuine intra-doc local: it is a cross-package call the indexer
   *  collapsed onto an opaque `local` (#189/#99), whose real target VANISHES from `reverseCallers`/`holeSources`
   *  (both drop `local ` symbols). This set is DISTINCT from `holeSources()` (the CLASS-1 benign external
   *  `unresolved` holes) on purpose: the negation door UNIONS it into the oracle/fallback holes AND intersects
   *  it with S as a NEW v2 abstain, while v2 keeps IGNORING `holeSources()` (recall). Populated ONLY when the
   *  index was built by the supported indexer (`scip-typescript`) — for an unknown indexer the `local ` scheme
   *  is not proven, so this heuristic is OFF (fail-closed, empty). Per-document (a def in doc A never vouches
   *  for doc B). Deterministic, sorted, deduped. TOTAL: never throws. */
  opaqueRefSources(): readonly Hash[]
  /** Does the GLOBAL symbol `symbol` have an in-index DEFINITION — i.e. can Atlas SEE it defined at all?
   *  `true` iff `symbol` is non-`local` and appears as a `definition` occurrence somewhere in this index.
   *
   *  This is the predicate that separates "defined but uncalled" (a real, groundable negative) from
   *  "Atlas cannot see this symbol defined, so `reverseCallers` is `[]` by CONSTRUCTION" (a VACUOUS negative).
   *  Without it, `reverseCallers(phantom) === []` is indistinguishable from a genuinely uncalled symbol, and
   *  the negation door would ground "phantom is not called in S" for a target that does not resolve at all.
   *  A `local ` symbol is document-scoped (#189) and never resolves here. Total: never throws. */
  resolves(symbol: string): boolean
  /** The unit (docHash) where the GLOBAL symbol `symbol` is DEFINED — the FIRST-definition-wins document
   *  the `defs` map retained (byte-for-byte `deriveEdges`'s `defs`, build.ts). `undefined` for a `local `
   *  symbol (document-scoped, #189) or a symbol with no in-index definition (a phantom). This is the POSITIVE
   *  DUAL of `resolves`: `resolves(symbol)` iff `definesAt(symbol) !== undefined`, but it RETAINS the location
   *  `resolves` throws away — the `definition` PROVEN slot (#196d) proves "symbol X is DEFINED under scope S"
   *  by checking this def-doc's path lies under S (a witnessed existence, sound in any world). First-def-wins
   *  under-witnesses overloads (a second def in another unit is not seen), which costs recall, never
   *  soundness. Total: never throws. */
  definesAt(symbol: string): Hash | undefined
}

/** Deterministic, deduped, `String`-sorted `Hash[]` — the exact discipline `deriveEdges`/`dependencyAxis` use
 *  so a rebuild is byte-identical. `Hash` is a same-string brand (contracts/hash.ts), so a `String`-keyed set is
 *  its own dedup and a lexical sort on `String(hash)` is total. */
const sortedDeduped = (hashes: Iterable<Hash>): readonly Hash[] => {
  const seen = new Set<string>()
  for (const h of hashes) seen.add(String(h))
  return [...seen].sort() as unknown as readonly Hash[]
}

/**
 * Build the symbol-reverse view over one SCIP output. Reads the SAME occurrences `deriveEdges` reads and reuses
 * its EXACT classification (single edge model, no second one invented):
 *   - `defs: Map<globalSymbol, docHash>` from `role==='definition'` occurrences of NON-`local` symbols,
 *     first-definition-wins — byte-for-byte `deriveEdges`'s `defs`.
 *   - a `reference` occurrence of a NON-`local` symbol whose symbol HAS an in-index definition — directly, OR
 *     after `canonicalizeSymbol` rewrites its published-types (`dist/…d.ts`) descriptor to the source form
 *     (#189 cross-package, canon-and-verify) — is a RESOLVED caller, bucketed under the SRC-form symbol
 *     (`deriveEdges`'s resolved branch, which canonicalises identically).
 *   - a `reference` occurrence of a NON-`local` symbol with NO in-index definition even after canon is the
 *     `unresolved` hole — `deriveEdges`'s `else` branch — so its document is a hole source (and it is NOT a
 *     resolved caller of that unseeable target: `reverseCallers` of a symbol with no in-index definition is `[]`).
 *  `local ` symbols contribute nothing on either side (SCIP document-scoping, #189) — the same exclusion
 *  `deriveEdges` applies in BOTH loops. `dynamic` is an `EdgeKind` the frozen `ScipOccurrence` projection cannot
 *  express (it carries `role` only, never a dynamic role), so — exactly as in `deriveEdges` — the only hole this
 *  data can witness is the `unresolved` case; the interface names both because a richer projection (or N-level
 *  extractor) would fold `dynamic` into the identical `else` branch. Deterministic, no I/O, no clock.
 */
export function createSymbolReverse(
  scip: ScipOutput,
  opts?: { readonly indexerName?: string | undefined },
): SymbolReverseApi {
  // INDEXER GATE (#99 F1 step 3) — the collapsed-local heuristic below is trusted ONLY when the index was
  // built by the ONE indexer whose `local ` scheme is proven, MIRRORING the escape leg's `SUPPORTED_INDEXER`
  // gate (adapter-io/src/escape/target-escapes.ts). For an unknown/unsupported indexer a `local ` ref with no
  // local def is NOT reliably a collapsed cross-package call, so the heuristic is OFF and `opaqueRefSources`
  // stays EMPTY (fail-closed to prior behavior — the oracle/fallback blanket holes still apply; v2 is never
  // told these are safe). The identity is passed in by the composition root (which reads the raw dump's
  // `metadata.toolInfo.name`); the frozen `ScipOutput` projection deliberately carries no metadata, so absent
  // ⇒ untrusted (never a default that TRUSTS the heuristic).
  const trustCollapsedLocal = opts?.indexerName === SUPPORTED_INDEXER

  // defs: the SAME map `deriveEdges` builds — non-local `definition` occurrences, first-definition-wins,
  // RETAINING the defining doc (build.ts:217 keeps `h` identically). The membership set `resolves` /
  // `reverseCallers` / the reference-resolution loop read is exactly `defs.keys()`; retaining the value costs
  // nothing there (a Map answers `.has` the same) and gives `definesAt` (#196d) the location a Set discarded.
  const defs = new Map<string, Hash>()
  for (const doc of scip.documents) {
    const h = nodeHashOfPath(doc.relativePath)
    for (const occ of doc.occurrences) {
      if (occ.role === "definition" && !isLocalSymbol(occ.symbol) && !defs.has(occ.symbol)) defs.set(occ.symbol, h)
    }
  }

  // callersBySymbol: for each RESOLVED (in-index-defined) global symbol, the docHashes carrying a `reference`
  // to it. holeSourceSet: docHashes carrying a `reference` to a non-local symbol with NO in-index definition
  // (the `unresolved` branch). Both walk the SAME reference occurrences `deriveEdges`'s reference loop walks.
  const callersBySymbol = new Map<string, Hash[]>()
  const holeSourceSet = new Set<string>()
  const opaqueRefSet = new Set<string>()
  for (const doc of scip.documents) {
    const from = nodeHashOfPath(doc.relativePath)
    // F1 step 1 — PER-DOCUMENT pre-scan of this doc's `local ` DEFINITIONS. A `local N` string is meaningless
    // ACROSS documents (SCIP document-scopes it), so a def in doc A must NOT vouch for doc B: `localDefs` is
    // rebuilt per doc and read only for THIS doc's local refs. Skipped entirely on an untrusted indexer (the
    // heuristic is off, so the set is never consulted).
    const localDefs = new Set<string>()
    if (trustCollapsedLocal) {
      for (const occ of doc.occurrences) {
        if (occ.role === "definition" && isLocalSymbol(occ.symbol)) localDefs.add(occ.symbol)
      }
    }
    for (const occ of doc.occurrences) {
      if (occ.role !== "reference") continue
      if (isLocalSymbol(occ.symbol)) {
        // F1 step 2 — a `reference`-role `local ` symbol. Under the supported indexer, a local ref with NO
        // matching `local ` DEFINITION in THIS doc is a CLASS-2 COLLAPSED cross-package ref (the real caller the
        // indexer emitted as an opaque `local`): mark the DOCUMENT opaque so the negation door abstains over any
        // scope containing it. A local ref WITH a local def is a genuine intra-doc local — UNCHANGED behavior
        // (`continue`, contributes nothing). On an untrusted indexer `trustCollapsedLocal` is false, so every
        // local ref is simply dropped exactly as before (`localDefs` empty, guard skipped).
        if (trustCollapsedLocal && !localDefs.has(occ.symbol)) opaqueRefSet.add(String(from))
        continue
      }
      // CANON-AND-VERIFY (#189): resolve a same-package hit as-is, else the src-form of a published-types
      // (`dist/…d.ts`) descriptor — but ONLY if it lands on a real in-index definition. The caller is then
      // bucketed under the SRC-form symbol (the form `reverseCallers`/`resolves` are queried with), so a
      // cross-package caller becomes VISIBLE to the negation door instead of an honest-but-blind hole. A
      // ref whose canon does not resolve stays a hole (fail-closed) — see `canonicalizeSymbol` (build.ts).
      const resolved = defs.has(occ.symbol)
        ? occ.symbol
        : defs.has(canonicalizeSymbol(occ.symbol))
          ? canonicalizeSymbol(occ.symbol)
          : undefined
      if (resolved !== undefined) {
        const bucket = callersBySymbol.get(resolved) ?? []
        bucket.push(from)
        callersBySymbol.set(resolved, bucket)
      } else {
        holeSourceSet.add(String(from)) // `unresolved` (or, in a richer projection, `dynamic`) — a hole source
      }
    }
  }

  const holes = sortedDeduped([...holeSourceSet] as unknown as Hash[])
  const opaqueRefs = sortedDeduped([...opaqueRefSet] as unknown as Hash[])

  return {
    reverseCallers(symbol: string): readonly Hash[] {
      // A `local ` symbol is document-scoped (its callers are intra-doc, out of #99b v1 scope) and a symbol
      // with no in-index definition has only unresolved references (holes, not resolved callers) ⇒ `[]`.
      if (isLocalSymbol(symbol) || !defs.has(symbol)) return []
      return sortedDeduped(callersBySymbol.get(symbol) ?? [])
    },
    holeSources(): readonly Hash[] {
      return holes
    },
    opaqueRefSources(): readonly Hash[] {
      return opaqueRefs
    },
    resolves(symbol: string): boolean {
      // The SAME predicate the two loops above use to admit a symbol at all: non-`local` AND carrying an
      // in-index `definition`. `defs` is exactly that set, so a phantom (referenced-only, or absent) is `false`
      // and its `reverseCallers` is `[]` HONESTLY — the caller must abstain rather than ground a vacuous negative.
      return !isLocalSymbol(symbol) && defs.has(symbol)
    },
    definesAt(symbol: string): Hash | undefined {
      // The location `resolves` throws away: the first-definition-wins def-doc of a NON-`local` symbol. A
      // `local ` symbol is document-scoped (#189) and never resolves, so it has no global def-site here.
      if (isLocalSymbol(symbol)) return undefined
      return defs.get(symbol)
    },
  }
}

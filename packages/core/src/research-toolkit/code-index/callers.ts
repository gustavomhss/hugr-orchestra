export * as Callers from "./callers"

import { Enclosing } from "./enclosing"
import { Scip } from "./scip"
import { Role } from "./types"

// T-X3: reverse callers, symbol canonicalization and opaque references, transplanted from Atlas
// `index/src/symbol-reverse.ts:20-160` and `index/src/build.ts:188`. Atlas answers with document hashes; here every
// reference is a `{path, line}` site grouped by the definition that encloses it (J2.9 `callers`), and the collapsed
// local references become `coverage.opaqueSites` (J2.6). Pure and deterministic: no I/O, sorted output.

/** The one indexer whose `local ` scheme and dist→src canonicalization are proven (Atlas `SUPPORTED_INDEXER`). */
export const SUPPORTED_INDEXER = "scip-typescript"

export type Site = { readonly path: string; readonly line: number }

export type Resolution =
  /** An in-index definition, directly or after canonicalization; `symbol` is the defined (source) form. */
  | { readonly kind: "resolved"; readonly symbol: string }
  /** A document-scoped local with a local definition in the same document. */
  | { readonly kind: "local" }
  /** A local with no local definition in its document: a cross-package reference the indexer collapsed. */
  | { readonly kind: "opaque" }
  /** A global symbol with no in-index definition, such as a library outside every shard. */
  | { readonly kind: "unresolved" }

export type Caller = {
  readonly path: string
  /** The enclosing definition's symbol; undefined for a reference outside every known definition. */
  readonly enclosing: string | undefined
  readonly range: Scip.Span | undefined
  readonly sites: ReadonlyArray<number>
}

/**
 * Atlas measured 795 of 855 distinct dist-form references landing on a real definition after this rewrite. It assumes
 * the `.d.ts` path mirrors the `src` path, which holds for per-file `tsc --declaration` output; a bundler that
 * flattens declarations could land on a wrong source symbol that still exists. Orchestra packages export `src/*.ts`
 * directly, so the rewrite is a fallback here, not the main path.
 */
export function canonicalizeSymbol(symbol: string) {
  return symbol.replace(/ dist\/(?:src\/)?((?:[^`]*\/)?`[^`]+)\.d\.ts`/, " src/$1.ts`")
}

/**
 * Builds the reverse view over every document of the shards in scope; a reference resolves against definitions in
 * any of them, which is how a call from one workspace package reaches a definition in another.
 */
export function create(docs: ReadonlyArray<Enclosing.Document>, options?: { readonly indexerName?: string }) {
  // The collapsed-local heuristic is trusted only for the proven indexer; otherwise every local is plain local.
  const trustCollapsedLocal = options?.indexerName === SUPPORTED_INDEXER
  const defs = new Map<string, Site>()
  docs.forEach((doc) =>
    doc.occurrences.forEach((occ) => {
      if (occ.role & Role.definition && !Scip.isLocalSymbol(occ.symbol) && !defs.has(occ.symbol))
        defs.set(occ.symbol, { path: doc.path, line: occ.startLine })
    }),
  )

  const resolutions = new Map<Scip.Occurrence, Resolution>()
  const groups = new Map<string, Map<string, Group>>()
  const holes: Site[] = []
  const opaque: Site[] = []
  docs.forEach((doc) => {
    const ranges = new Map(doc.definitions.map((def) => [def.symbol, def.range]))
    // `local N` means nothing across documents, so a local definition vouches only for its own document.
    const localDefs = new Set(
      doc.occurrences.filter((occ) => occ.role & Role.definition && Scip.isLocalSymbol(occ.symbol)).map((occ) => occ.symbol),
    )
    doc.occurrences.forEach((occ, i) => {
      if (occ.role & Role.definition) return
      const resolution = resolve(occ.symbol)
      resolutions.set(occ, resolution)
      const site = { path: doc.path, line: occ.startLine }
      if (resolution.kind === "opaque") opaque.push(site)
      if (resolution.kind === "unresolved") holes.push(site)
      // An import names a symbol without calling it; it stays a resolved reference but joins no caller group.
      if (resolution.kind !== "resolved" || occ.role & Role.import) return
      const enclosing = doc.enclosing[i]
      const bucket = groups.get(resolution.symbol) ?? new Map<string, Group>()
      groups.set(resolution.symbol, bucket)
      const key = `${doc.path}\0${enclosing ?? ""}`
      const group = bucket.get(key) ?? { path: doc.path, enclosing, range: enclosing ? ranges.get(enclosing) : undefined, sites: new Set<number>() }
      bucket.set(key, group)
      group.sites.add(occ.startLine)
    })

    function resolve(symbol: string): Resolution {
      if (Scip.isLocalSymbol(symbol))
        return trustCollapsedLocal && !localDefs.has(symbol) ? { kind: "opaque" } : { kind: "local" }
      if (defs.has(symbol)) return { kind: "resolved", symbol }
      const canonical = canonicalizeSymbol(symbol)
      if (defs.has(canonical)) return { kind: "resolved", symbol: canonical }
      return { kind: "unresolved" }
    }
  })

  return {
    /** References grouped by enclosing definition, sorted by path and start line; `[]` for a phantom or a local. */
    callers(symbol: string): ReadonlyArray<Caller> {
      return [...(groups.get(symbol)?.values() ?? [])]
        .map((group) => ({ ...group, sites: [...group.sites].toSorted((a, b) => a - b) }))
        .toSorted((a, b) => byPath(a.path, b.path) || (a.range?.startLine ?? 0) - (b.range?.startLine ?? 0) || a.sites[0] - b.sites[0])
    },
    /** Whether the symbol has an in-index definition; separates "defined but uncalled" from "cannot see it". */
    resolves(symbol: string) {
      return !Scip.isLocalSymbol(symbol) && defs.has(symbol)
    },
    /** The first definition site of a global symbol. */
    definesAt(symbol: string) {
      return Scip.isLocalSymbol(symbol) ? undefined : defs.get(symbol)
    },
    /** How a reference occurrence resolved; undefined for a definition occurrence or one from another view. */
    resolution(occ: Scip.Occurrence) {
      return resolutions.get(occ)
    },
    /** Sites of references to global symbols no shard defines. */
    holes: () => sorted(holes),
    /** Sites of collapsed local references: `coverage.opaqueSites` and `occurrence.opaque`. */
    opaque: () => sorted(opaque),
  }
}

type Group = { path: string; enclosing: string | undefined; range: Scip.Span | undefined; sites: Set<number> }

/** Code-unit order, so output does not depend on the host locale. */
function byPath(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

function sorted(sites: ReadonlyArray<Site>) {
  return [...new Map(sites.map((site) => [`${site.path}\0${site.line}`, site])).values()].toSorted(
    (a, b) => byPath(a.path, b.path) || a.line - b.line,
  )
}

export * as Enclosing from "./enclosing"

import { Scip } from "./scip"
import { Role } from "./types"

// T-X4: the SCIP ⋈ tree-sitter join that gives every occurrence the definition enclosing it (J2.6), from Atlas
// `adapter-io/src/compose.ts:211-218` and `escape/target-escapes.ts:99`. Atlas joins to classify escapes for a
// negation; here the join fills `occurrence.enclosing_id`, which is what makes callers and callees answerable.
//
// scip-typescript 0.4.0 emits `enclosingRange` for most declarations but not for interface members, parameters
// or locals. The structural layer (tree-sitter, X2) supplies those ranges: a structural definition joins the SCIP
// definition occurrence on the same path and name line whose descriptor name matches. The same layer's import
// statements mark the references inside them with the import role, so an import line is not reported as a call.

/** What the structural layer knows about one file, in the same 1-based closed lines. */
export type Structural = {
  readonly definitions?: ReadonlyArray<{ readonly name: string; readonly startLine: number; readonly endLine: number; readonly nameLine: number }>
  /** Import and re-export statements. scip-typescript sets no Import role, so this is how an import is told apart. */
  readonly imports?: ReadonlyArray<{ readonly startLine: number; readonly endLine: number }>
}

export type Definition = { readonly symbol: string; readonly range: Scip.Span; readonly source: "scip" | "tree-sitter" }

export type Document = Scip.Document & {
  /** Parallel to `occurrences`: the SCIP symbol of the innermost definition enclosing each one, if any. */
  readonly enclosing: ReadonlyArray<string | undefined>
  /** Every definition with a known range, one per symbol; the rows of the `symbol` table. */
  readonly definitions: ReadonlyArray<Definition>
}

export function join(doc: Scip.Document, structural: Structural = {}): Document {
  const definitions = definitionsOf(doc, structural.definitions ?? [])
  const imports = structural.imports ?? []
  const occurrences = doc.occurrences.map((occ) =>
    occ.role & Role.definition || !imports.some((stmt) => occ.startLine >= stmt.startLine && occ.startLine <= stmt.endLine)
      ? occ
      : { ...occ, role: occ.role | Role.import },
  )
  // A sweep in position order. Definitions open at their start and stay active until their end; the innermost
  // active one is the latest-starting. Ranges from two layers need not nest perfectly, so the active set is
  // filtered rather than treated as a stack. Ties on the start put the wider range first.
  const opening = definitions.toSorted((a, b) => compare(start(a.range), start(b.range)) || compare(end(b.range), end(a.range)))
  const order = occurrences.map((_, i) => i).toSorted((a, b) => compare(start(occurrences[a]), start(occurrences[b])))
  const enclosing = new Array<string | undefined>(occurrences.length)
  let cursor = 0
  let active: Definition[] = []
  for (const i of order) {
    const occ = occurrences[i]
    const at = start(occ)
    while (cursor < opening.length && compare(start(opening[cursor].range), at) <= 0) active.push(opening[cursor++])
    active = active.filter((def) => compare(end(def.range), at) >= 0)
    // A definition never encloses its own definition occurrence; its container does, and a container must hold the
    // whole declaration. Without that, a zero-width file module definition at 1:1 would sit inside its first child.
    const own = occ.role & Role.definition
    const until = end(own ? (occ.enclosingRange ?? occ) : occ)
    enclosing[i] = active.findLast((def) => !(own && def.symbol === occ.symbol) && compare(end(def.range), until) >= 0)?.symbol
  }
  return { ...doc, occurrences, enclosing, definitions }
}

function definitionsOf(doc: Scip.Document, structural: NonNullable<Structural["definitions"]>) {
  const byLine = Map.groupBy(structural, (def) => def.nameLine)
  const seen = new Set<string>()
  return doc.occurrences.flatMap((occ): Definition[] => {
    if (!(occ.role & Role.definition) || seen.has(occ.symbol)) return []
    if (occ.enclosingRange) {
      seen.add(occ.symbol)
      return [{ symbol: occ.symbol, range: occ.enclosingRange, source: "scip" }]
    }
    const name = Scip.descriptorName(occ.symbol)
    const match = name === undefined ? undefined : byLine.get(occ.startLine)?.find((def) => def.name === name)
    if (!match) return []
    seen.add(occ.symbol)
    return [{
      symbol: occ.symbol,
      range: { startLine: match.startLine, startCol: 1, endLine: match.endLine, endCol: Number.MAX_SAFE_INTEGER },
      source: "tree-sitter",
    }]
  })
}

function start(span: Scip.Span) {
  return [span.startLine, span.startCol] as const
}

function end(span: Scip.Span) {
  return [span.endLine, span.endCol] as const
}

function compare(a: readonly [number, number], b: readonly [number, number]) {
  return a[0] - b[0] || a[1] - b[1]
}

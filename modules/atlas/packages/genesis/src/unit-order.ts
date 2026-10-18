// @atlas/genesis — src/unit-order.ts  (#182 — sub-file units, and the non-hash order a budget buys them in)
//
// Split out of `seeds.ts` at the 400-LOC ceiling, and cohesive on its own: `seeds.ts` answers "how do a
// dep-graph node identity, a content subtreeHash and a repo-relative path refer to the same node"; this
// file answers "which SUB-FILE unit of that node is worth a model call, and in what order". It holds no
// identity bridge and mints no seed.
//
// It is deliberately the INNER of the two — it imports nothing from `seeds.ts`, so the split is acyclic —
// which is why `cmp`, `filePartOf` and `isUnitSite` live here and are re-exported from `seeds.ts` for the
// callers that already import them from there.

import { nodeHashOfPath, unescapeKeyComponent } from "@atlas/index"
import type { IndexNode } from "@atlas/index"
import type { StructRef } from "@atlas/contracts"

/** The ONE string order used by every sort in this package — here and in `seeds.ts`, which re-exports it.
 *  Sorted pairs + first-wins makes each map built from it a function of the SET of nodes, never of the walk
 *  order (GEN-1 byte-identity). */
export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The FILE portion of a `StructRef.qualifiedPath` — the prefix up to the FIRST `::` (contracts/struct.ts
 *  states exactly this rule, and `adapter-io/src/prompt.ts` `filePathOf` applies it on the read side). A
 *  bare path is its own file part. */
export const filePartOf = (qualifiedPath: string): string => {
  const at = qualifiedPath.indexOf("::")
  return at === -1 ? qualifiedPath : qualifiedPath.slice(0, at)
}

/** Whether a site addresses a SUB-FILE unit (`file::item[::block]`) rather than a whole file. */
export const isUnitSite = (qualifiedPath: string): boolean => qualifiedPath.includes("::")

/**
 * The two NON-HASH ordering priors for ONE sub-file unit (#182). Both are PRIORS and neither is a measured
 * importance — see `byUnitPrior` for what is honestly unavailable and why.
 *
 * Declared HERE, in the consumer, and IMPLEMENTED by the adapter (`adapter-io/src/ast.ts`
 * `foldAstUnitsWithPriors`) — the direction every other genesis port takes (`SkeletonSource`,
 * `HistorySource`). It has to be a port rather than a field on the index node because `IndexNode` carries
 * no `content`: by the time the spatial axis reaches this file, export-ness has been discarded by
 * `unwrapExport` and the unit's size survives only as a hash. The index data model is out of scope for
 * this card, so the fact travels beside the tree instead of on it.
 */
export interface UnitPrior {
  readonly exported: boolean // the declaration was written under an `export` / `export default` wrapper
  readonly bytes: number //    UTF-8 byte length of the unit's own slice
}

/** Look one unit's prior up by its `file::item[::block]` address. `undefined` means UNKNOWN — never
 *  "zero as a fact" — and the comparator degrades to address order, which is stated, not hidden. */
export type UnitPriorSource = (qualifiedPath: string) => UnitPrior | undefined

// ── #182 — the SUB-FILE seeds, and the PRIOR that decides which of them a budget buys ────────────────
// `foldAstUnits` already parses, keys and Merkle-hashes every item/block on the production path (measured
// on this repository: 5283 sub-file units against 520 file sites — 10.2×), and until now the frontier
// offered NONE of them: `kind: 'file'` was the only literal it emitted.

/** One sub-file unit, as the frontier sees it in the SPATIAL axis: its address, its grounding leg, and the
 *  two NON-HASH priors the injected `UnitPriorSource` supplies for it (#182). */
export interface UnitNode {
  readonly kind: "symbol" | "block"
  readonly qualifiedPath: string
  readonly subtreeHash: string
  readonly exported: boolean
  readonly bytes: number
}

/**
 * Every sub-file unit in the spatial axis, indexed BOTH by its own `qualifiedPath` and grouped under the
 * file it lives in. ONE walk, so the two views can never disagree.
 *
 * THE ADDRESS IS THE FOLDED-TREE PATH, NOT THE INDEX KEY, and the difference is what makes S2 work: the
 * key's file portion is `/`-joined ESCAPED components (`build.ts` `mintKey`), while `createFileSourceReader`
 * and `filePathOf` need a real repo-relative path. So the file prefix is put back through the index's own
 * `unescapeKeyComponent` (imported, never restated) and the `::` tail is carried VERBATIM — which is
 * exactly the `path` `adapter-io/src/ast.ts` minted the unit under, i.e. the key the unit-granular reader
 * looks up. `kind` follows contracts/struct.ts's own chain: `file::item` is a `symbol`, anything deeper is
 * a `block`.
 */
export function unitsOfAxis(
  root: IndexNode,
  prior: UnitPriorSource | undefined,
): {
  readonly byPath: ReadonlyMap<string, UnitNode>
  readonly byFile: ReadonlyMap<string, readonly UnitNode[]>
} {
  const byPath = new Map<string, UnitNode>()
  const byFile = new Map<string, UnitNode[]>()
  const collect = (n: IndexNode): void => {
    const at = n.key.indexOf("::")
    if (at !== -1) {
      const file = n.key.slice(0, at).split("/").map(unescapeKeyComponent).join("/")
      const tail = n.key.slice(at) // leading '::' included
      const qualifiedPath = `${file}${tail}`
      const p = prior?.(qualifiedPath)
      const unit: UnitNode = {
        kind: tail.split("::").length - 1 === 1 ? "symbol" : "block",
        qualifiedPath,
        subtreeHash: n.subtreeHash,
        exported: p?.exported ?? false, // NO supplier / unknown unit ⇒ not claimed as surface
        bytes: p?.bytes ?? 0, //          NO supplier / unknown unit ⇒ the weakest possible prior
      }
      if (!byPath.has(qualifiedPath)) byPath.set(qualifiedPath, unit)
      const group = byFile.get(file)
      if (group) group.push(unit)
      else byFile.set(file, [unit])
    }
    n.children.forEach(collect)
  }
  collect(root)
  for (const group of byFile.values()) group.sort(byUnitPrior)
  return { byPath, byFile }
}

/**
 * THE WITHIN-FILE ORDER, AND IT IS DELIBERATELY NOT A HASH.
 *
 * Sub-file units have no PPR of their own (see `resolveSiteKey`), so every unit inside one file ties with
 * that file and with its siblings, and this comparator — not the numeric score — is what spends the
 * budget. A hash-ordered selection of 200-from-5803 would be a coin toss wearing a ranking's clothes.
 *
 * Two signals, both already computed by the pipeline and both formerly discarded at a type boundary:
 *   1. `exported` — an exported declaration is the package's SURFACE; a private helper is not. The
 *      strongest prior available, and it costs one boolean (`ast.ts` `unwrapExport`).
 *   2. `bytes`    — mechanical, free, and a defensible WEAK prior: a larger unit holds more to say.
 * Then `qualifiedPath` ascending, which is already a total order among the units of one file (the `::`
 * local carries a kind + an ordinal + a name, so two siblings cannot share it).
 *
 * WITH NO `UnitPriorSource` SUPPLIED both signals read false/0 for every unit and the order collapses to
 * `path asc`. That is a real degradation and it is deliberately VISIBLE rather than papered over: it is
 * still a strict total order and still not a hash, but it is not the ranked order this comparator
 * documents, and a caller that wants the ranking must inject the seam.
 *
 * BOTH ARE STATED AS PRIORS AND NEITHER IS A MEASURED IMPORTANCE. The principled signal would be a
 * per-symbol reference count, and it is NOT available: `index/src/types.ts` `ScipOccurrence` keeps
 * `{symbol, role}` and drops SCIP's `range`, so a symbol cannot be joined to an AST unit by POSITION, and
 * joining it by NAME would be the spelling-based join #189/#153 punished. That gap is named, not papered
 * over — same register `own-source.ts` uses for what is honestly unavailable.
 *
 * The final `subtreeHash` leg is a TOTAL-ORDER guarantee and nothing else: reaching it means the three
 * priors above discriminated nothing whatsoever, which for two distinct units of one file cannot happen.
 */
function byUnitPrior(a: UnitNode, b: UnitNode): number {
  return (
    (b.exported ? 1 : 0) - (a.exported ? 1 : 0) ||
    b.bytes - a.bytes ||
    cmp(a.qualifiedPath, b.qualifiedPath) ||
    cmp(a.subtreeHash, b.subtreeHash)
  )
}

// ── #182 — the TOTAL ORDER `rank` breaks PPR ties by ─────────────────────────────────────────────────

/** The tie-break key of one ranked site. `group` is the FILE seed's `subtreeHash`, which is why this is a
 *  strict REFINEMENT of the shipped order rather than a replacement: for two FILE sites it reduces to
 *  `cmp(subtreeHash)` exactly, so a file-only frontier ranks byte-identically to master. */
export interface SiteOrderKey {
  readonly group: string //     the file seed's subtreeHash — the shipped file-vs-file tie-break, verbatim
  readonly sub: boolean //      a file sorts before its own units
  readonly exported: boolean // prior 1 (surface)
  readonly bytes: number //     prior 2 (weak, mechanical)
  readonly path: string //      total among the units of one file
  readonly hash: string //      LAST resort only — reaching it means every prior above discriminated nothing
}

/** Order two ranked sites once their PPR scores are equal. Pure, total, and INDEPENDENT OF THE ORDER THE
 *  FRONTIER WAS BUILT IN — GEN-11's byte-identity property survives (`rank(g, f)` ≡ `rank(g, reverse(f))`),
 *  which an "input position" tie-break would have quietly destroyed. */
export function compareSiteOrder(a: SiteOrderKey, b: SiteOrderKey): number {
  return (
    cmp(a.group, b.group) ||
    (a.sub ? 1 : 0) - (b.sub ? 1 : 0) ||
    (b.exported ? 1 : 0) - (a.exported ? 1 : 0) ||
    b.bytes - a.bytes ||
    cmp(a.path, b.path) ||
    cmp(a.hash, b.hash)
  )
}

// @atlas/index — src/resolve.ts  (INDEX-4/9: covering-node resolve over an axis hierarchy)
//
// `resolve(axis, key)` walks the named axis hierarchy to THE covering node (deepest node matched step by
// step, at ANY depth). TOTAL: an unknown axis, non-string key, or step that leaves the tree yields
// `undefined`, never a throw and never a wrong ancestor (INDEX-9). Pure — same forest + key resolves
// identically (INDEX-8); the hierarchy roll-up lives at the retrieval layer, which reuses `coveringPath`.
//
// The descent matches a child by EXACT equality against the accumulated path at that depth (`build.ts:38`
// keys every node `key: node.path`) or against the bare local token (the hash-keyed dependency axis). It
// never tests a character prefix, so `src/m0` reaches neither `srcM0` nor `src/m0x`.

import type { Axis, IndexNode } from "./types.js"

/** Path resolution over an axis hierarchy (INDEX-4/9): `resolve(axis, key)` returns the covering node,
 *  total — a malformed/missing axis or key yields `undefined`, never a throw. */
export interface ResolveApi {
  /** Axis + key → the covering node, total (miss ⇒ `undefined`, no throw — INDEX-9). (atlas-index:210) */
  resolve(axis: Axis, key: string): IndexNode | undefined
}

/** The multi-axis view the resolver walks: one rooted `IndexNode` per axis (spatial/territory/dependency).
 *  Each root carries its OWN `subtreeHash` rollup — the axes are never collapsed onto a shared root. */
export type AxisForest = Readonly<Record<Axis, IndexNode>>

const VALID_AXES: readonly Axis[] = ["spatial", "territory", "dependency"]

/** Total axis guard — junk (bad token, null, non-string) is not an axis, so it resolves nothing. */
export function isAxis(x: unknown): x is Axis {
  return typeof x === "string" && (VALID_AXES as readonly string[]).includes(x)
}

/** Split a path into non-empty, trimmed segments. `"a / b //c "` → `['a','b','c']`; `""` → `[]`. Total. */
export function pathSegments(key: string): string[] {
  return key
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** The sub-file refinement separator (`file::item::block`, adapter-io/ast.ts `unitPath`). A node key may
 *  nest on `::` as well as `/`, so the descent must step on BOTH — a `::` chain is real containment. */
const UNIT_SEP = "::"

/** One descent step: the CANONICAL accumulated key at this depth (`packages/index/src/x.ts::12:fn:f`) and
 *  the bare local token (`x.ts`). Both are compared by EXACT EQUALITY — never `startsWith`. */
interface Step {
  readonly prefix: string
  readonly token: string
}

/**
 * Expand `key` into its ordered descent steps, deepest last. Segments come from `pathSegments` (so the
 * `trim`/drop-empty normalization is unchanged); each segment is further split on `::` so a sub-file
 * refinement chain descends step by step.
 *
 * Each `prefix` is REBUILT by joining with a WHOLE separator, so a boundary can only ever fall on a real
 * `/` or `::`. There is no character-wise prefix test anywhere in this module: `src/m0` cannot match
 * `srcM0` (different string) nor `src/m0x` (different string). Total — never throws.
 */
function descentSteps(key: string): readonly Step[] {
  const steps: Step[] = []
  let acc = ""
  for (const seg of pathSegments(key)) {
    // An empty unit (from a stray `::`) is KEPT, not dropped: it yields a key that matches nothing, so a
    // malformed scope fails CLOSED rather than silently normalizing `a/::/b` into `a/b`.
    const units = seg.split(UNIT_SEP)
    for (let i = 0; i < units.length; i++) {
      const unit = units[i] as string
      acc = i === 0 ? (acc === "" ? unit : `${acc}/${unit}`) : `${acc}${UNIT_SEP}${unit}`
      steps.push({ prefix: acc, token: unit })
    }
  }
  return steps
}

/**
 * Descend `root` one step per `key` token; return the node chain `[root, …, coveringNode]`. A step that
 * matches no child (the path leaves the tree) ⇒ `[]` (a total miss, never a partial/wrong-ancestor hit).
 * An empty/whitespace/non-string path ⇒ `[]`.
 *
 * A child matches when its `key` equals EITHER the accumulated path at that depth (`build.ts:38` keys every
 * node `key: node.path` — the FULL repo-relative path) OR the bare local token (the dependency axis keys its
 * children by node HASH, and the transcribed goldens key theirs by symbolic level name). Full-path equality
 * is preferred so the canonical encoding always wins. Both are `===` — the resolver never tests a character
 * prefix, so no sibling can be reached by sharing a leading substring.
 *
 * Cost is O(depth × branching), NOT O(nodes): the descent consults only one child list per level.
 */
export function coveringPath(root: IndexNode, key: string): readonly IndexNode[] {
  if (typeof key !== "string") return []
  const steps = descentSteps(key)
  if (steps.length === 0) return []
  const chain: IndexNode[] = [root]
  let current: IndexNode = root
  for (const { prefix, token } of steps) {
    const next = current.children.find((c) => c.key === prefix) ?? current.children.find((c) => c.key === token)
    if (next === undefined) return [] // the path leaves the tree ⇒ not a covering resolve
    current = next
    chain.push(current)
  }
  return chain
}

/** Construct a `ResolveApi` over a fixed axis forest. `resolve` is a pure, total query over it. */
export function createResolve(forest: AxisForest): ResolveApi {
  return {
    resolve(axis: Axis, key: string): IndexNode | undefined {
      if (!isAxis(axis)) return undefined // unknown axis ⇒ no default-axis fall-through (INDEX-9)
      if (typeof key !== "string") return undefined
      const root: IndexNode | undefined = forest[axis]
      if (root === undefined) return undefined
      const chain = coveringPath(root, key)
      return chain.length === 0 ? undefined : chain[chain.length - 1]
    },
  }
}

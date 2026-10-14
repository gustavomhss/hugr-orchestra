// @atlas/index — src/rollup.ts  (WP-2.7-a.INDEX · rollup / structural-fold facet — INDEX-2 / INDEX-12)
//
// THE Merkle rollup core. `foldNodeHash` is the ONE place in this repo where a node's subtreeHash is
// computed — `build` (src/build.ts) and the incremental `rehashPath`/`subtreeHash` below all route through
// it, so a rebuild and an incremental re-hash cannot disagree by construction. SORTED entries make the
// root order-independent, and an edit re-hashes only the leaf→root path (`rehashPath`, 0 sibling touches).
// `createRollup` surfaces a node's dual root — `rId` (structure) + `rState` (state) — so a status flip
// never moves `rId`. ALL hashing goes through the sealed kernel `id` seam, never a re-rolled blake3.
//
// PREIMAGE LAW (why every hash here is minted through `id`, never through string concatenation): the
// preimage is a STRUCTURED OBJECT handed to `canonicalForm`, exactly as `nodeKey` does. A separator-joined
// string is not injective — a value containing the separator migrates across a field boundary, so two
// different nodes collide (that was the defect: `["a\0b","c"]` and `["a","b\0c"]` hashed identically, and a
// caller-supplied `status` could therefore FORGE another node's state root). JSON escaping makes the
// encoding injective, so no field content can ever be mistaken for a field boundary.

import { asSubtreeHash, id } from "@atlas/kernel"
import type { SubtreeHash } from "@atlas/contracts"
import type { Axis, IndexNode, Rollup } from "./types.js"

/** The Merkle rollup core (INDEX-2): a node's subtreeHash is the injective digest of its OWN content plus
 *  its NAMED, sorted child hashes (order-independent) + a node's dual root via `rollup` (`rId`=structure,
 *  `rState`=state). */
export interface RollupApi {
  /** This node's dual Merkle rollup (INDEX-12): `rId` (structure) + `rState` (state). Total.
   *  (atlas-index:211) */
  rollup(axis: Axis, key: string): Rollup
  /** BLAKE3 over the node's own content + its sorted, NAMED child hashes — the drift oracle root (branded
   *  `SubtreeHash`, from contracts). Order-independent given the sort (INDEX-2).
   *  (atlas-index:40, 62; method-tags-idx:31) */
  subtreeHash(node: IndexNode): SubtreeHash
}

/** Domain tag in the fold preimage: no other `id()` call site can collide with a node rollup preimage.
 *  Bumping it is a deliberate, repo-wide re-key of every subtreeHash. */
const FOLD_DOMAIN = "atlas.index.node.v2"
/** Domain tag for the STATE root — keeps `rState` preimages disjoint from `rId` preimages. */
const STATE_DOMAIN = "atlas.index.state.v2"

/** The state side-index a node's `rState` folds (KERNEL-8 status+freshness) — the STATE root input. */
export interface NodeState {
  readonly status: string
  readonly freshness: number
}
/** The result of an incremental re-hash: the new tree + the SET of node keys whose hash was recomputed. */
export interface RehashResult {
  readonly root: IndexNode
  readonly touched: readonly string[]
}

/** The material a node's hash is folded from. `key` is the node's own key (used ONLY to derive its
 *  children's relative names); `content` is the node's OWN bytes and is ABSENT (not empty) for a node that
 *  has none — a directory. That absent-vs-empty distinction is load-bearing: it is what stops an empty FILE
 *  and an empty REPO ROOT from sharing one identity. */
export interface NodeMaterial {
  readonly key: string
  readonly content?: string | undefined
  readonly children: readonly { readonly key: string; readonly subtreeHash: SubtreeHash }[]
}

/** A child's name RELATIVE to its parent — the git-tree model: a tree entry records a basename, not a full
 *  path. Binding the relative name (rather than the absolute key) is what makes a RENAME and a SIBLING SWAP
 *  drift while keeping a whole-subtree MOVE content-addressable, so `resolveBySubtreeAt` can still relocate
 *  a moved unit by content. Keys that do not sit under the parent fall back to the full key. */
function childName(parentKey: string, childKey: string): string {
  return childKey.startsWith(parentKey) ? childKey.slice(parentKey.length) : childKey
}

/**
 * THE fold (INDEX-2) — the single implementation of a node's subtreeHash in this repo.
 *
 * A node commits to (a) its OWN content and (b) the NAME→hash binding of each child, sorted. Both halves
 * are load-bearing and each closes a class of fact-invalidating change that a child-hash-multiset-only fold
 * declared FRESH:
 *   - own content ⇒ an edit to a node's own bytes that lies OUTSIDE any modelled child (a changed `import`
 *     target, an appended top-level statement, a class field, a class rename, a new `extends`) drifts. A
 *     fold that dropped `content` whenever a node had children reported all of those FRESH.
 *   - named children ⇒ renaming a child, or swapping two siblings' contents, drifts. A multiset of bare
 *     child hashes is invariant under both.
 * Order-independence (the INDEX-2 law) is preserved: the entries are SORTED, so any presentation order of
 * the same (name, hash) entries folds to the same root.
 */
export function foldNodeHash(material: NodeMaterial): SubtreeHash {
  const entries = material.children
    .map((c) => ({ name: childName(material.key, c.key), hash: String(c.subtreeHash) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0))
  // `content: undefined` is DROPPED by canonicalForm, which is exactly the absent-vs-empty distinction.
  return asSubtreeHash(id({ v: FOLD_DOMAIN, children: entries, content: material.content }))
}

/**
 * Structure root: the fold above, recomputed over an `IndexNode` subtree. A leaf (no children) keeps its
 * recorded content hash — that is the base case of the rollup (INDEX-2).
 *
 * `contentOf` supplies a node's OWN bytes, because `IndexNode` is a LOSSY projection of the built tree: it
 * carries `key`/`children`/`subtreeHash` but NOT a branch's own content (a file that has parsed item
 * children is such a branch). Without it this recompute folds a content-free node, which for a
 * content-bearing branch yields a value that DIFFERS from the recorded root — a mismatch, i.e. DRIFTED.
 * That is fail-CLOSED and deliberate: an incomplete re-derivation must never be able to certify FRESH.
 * Hand it the same material `build` had and it reproduces `build`'s hash exactly.
 */
export function subtreeHash(
  node: IndexNode,
  contentOf: (key: string) => string | undefined = () => undefined,
): SubtreeHash {
  if (node.children.length === 0) return node.subtreeHash
  const children = node.children.map((c) => ({ key: c.key, subtreeHash: subtreeHash(c, contentOf) }))
  return foldNodeHash({ key: node.key, content: contentOf(node.key), children })
}

/** State root: the injective digest of (structure root ‖ status ‖ freshness), distinct from `rId` by its
 *  own domain tag.
 *
 *  The preimage keys are `stateStatus`/`stateFreshness`, NOT `status`/`freshness`, and that is not
 *  cosmetic: `status` and `freshness` are KERNEL-8 SIDE_INDEX keys which `canonicalForm` DELETES from every
 *  preimage. Naming them literally would silently drop BOTH from the digest, collapsing `rState` to a
 *  function of `rId` alone — a state root that no longer depends on state, and INDEX-12a's two distinct
 *  roots quietly merged into one. Routing through `id` is also what rejects a non-integer `freshness`
 *  (`0.1+0.2`): the kernel float guard THROWS instead of letting `"0.30000000000000004"` reach the digest. */
function stateRoot(rId: SubtreeHash, s: NodeState): string {
  return id({ v: STATE_DOMAIN, rId: String(rId), stateStatus: s.status, stateFreshness: s.freshness })
}

/** A node's dual Merkle rollup: `rId` (structure) + `rState` (state). Two distinct roots (INDEX-12a).
 *  `contentOf` is forwarded to `subtreeHash` — see its note on the lossy `IndexNode` projection. */
export function nodeRollup(node: IndexNode, state: NodeState, contentOf?: (key: string) => string | undefined): Rollup {
  const rId = subtreeHash(node, contentOf)
  return { axis: node.axis, bucket: node.key, rId, rState: stateRoot(rId, state) }
}

/** The frozen `RollupApi` over a resolver (axis+key → node+state) — proves the interface is satisfiable. */
export function createRollup(resolve: (axis: Axis, key: string) => { node: IndexNode; state: NodeState }): RollupApi {
  return {
    rollup(axis, key) {
      const { node, state } = resolve(axis, key)
      return nodeRollup(node, state)
    },
    subtreeHash,
  }
}

/** Re-hash exactly the leaf→root path (`pathKeys`, root→leaf), setting the edited leaf's new hash. Every
 *  sibling node is kept BY REFERENCE (its subtreeHash is READ, never recomputed) — so `touched` is exactly
 *  the path and unaffected subtrees stay byte-identical (INDEX-2b/2c, INDEX-12e).
 *
 *  Each ancestor is re-folded through `foldNodeHash`, the SAME function `build` uses — so given the same
 *  material this incremental re-hash reproduces a full rebuild's root byte-for-byte. `contentOf` supplies
 *  each ancestor's OWN bytes for exactly the reason documented on `subtreeHash`: `IndexNode` does not carry
 *  them, and omitting them fails CLOSED (a differing root ⇒ DRIFTED), never open. */
export function rehashPath(
  root: IndexNode,
  pathKeys: readonly string[],
  newLeafHash: SubtreeHash,
  contentOf: (key: string) => string | undefined = () => undefined,
): RehashResult {
  const touched: string[] = []
  const recurse = (node: IndexNode, depth: number): IndexNode => {
    if (depth === pathKeys.length - 1) {
      touched.push(node.key)
      return { ...node, subtreeHash: newLeafHash }
    }
    const nextKey = pathKeys[depth + 1]
    const children = node.children.map((c) => (c.key === nextKey ? recurse(c, depth + 1) : c))
    touched.push(node.key)
    return {
      ...node,
      children,
      subtreeHash: foldNodeHash({ key: node.key, content: contentOf(node.key), children }),
    }
  }
  return { root: recurse(root, 0), touched }
}

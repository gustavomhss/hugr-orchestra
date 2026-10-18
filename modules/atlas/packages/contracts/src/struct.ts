// @atlas/contracts — struct.ts
//
// The grounding anchor. A StructRef points at a structural unit; its `subtreeHash` is THE drift
// oracle (BLAKE3 of the unit's source slice), never line numbers. NOT "the normalized subtree" — no
// normalizer exists in this product, so a reformat OF the cited unit drifts. REQ-GROUND-5b / KNOW-3
// were amended 2026-08-02; `@atlas/grounding` `src/subtree.ts` carries the reason.

import type { SubtreeHash } from "./hash.js"

/** A grounding anchor into the structural tree. `subtreeHash` is the drift oracle (never line
 *  numbers). 'repo'/'project' anchors a global rule to a policy artifact's heading/section BLOCK
 *  subtreeHash, never anchorless (GROUND-12). (atlas-grounding line 44; atlas-index line 56)
 *
 *  'directory' is a SPATIAL CONTAINER node whose `subtreeHash` folds its sorted, NAMED children
 *  (the git-tree Merkle, `foldNodeHash`/`rollupHash`, @atlas/index src/rollup.ts) — so it re-hashes
 *  when an in-scope file's bytes change OR when a file ENTERS/LEAVES it (the named-child set moves).
 *  That INSERTION-sensitivity is exactly what a per-unit `subtreeHash` lacks, which is why it is the
 *  carrier for a directory-scoped negation's completeness witness (#99b / ADR-0015 D3, §3(ii)): the
 *  scope Merkle root a `(¬calls, X, S)` fact grounds against so a NEW caller entering S drifts it. */
export interface StructRef {
  readonly kind: "symbol" | "block" | "file" | "repo" | "project" | "directory"

  /**
   * A REPO-RELATIVE PATH, and — since #155 — only ever that. **ONE FORM. There is no union.**
   *
   * Written down because the failure was SILENCE, not complexity (task #159). This field was an UNSTATED
   * union: `adapter-io/src/git-history.ts` `fileRef` put a repo-relative path here, while
   * `genesis/src/seeds.ts` `structuralFrontier` put a DEPENDENCY-GRAPH NODE-IDENTITY HASH here. Every
   * reader — `createFileSourceReader`, `filePathOf`, `bucketOf` — assumed a path, so on a thin-history
   * repository every site threw `source-unreadable`. The type said `string` and both producers were
   * type-correct; nothing could have caught it.
   *
   * #155 (D5 REJECT) fixed it AT THE PRODUCER: `structuralFrontier` now resolves the node-identity key
   * back to a path through the index correspondence and DROPS any dep-graph node with no spatial
   * counterpart (counted out as `StructuralFrontier.droppedNoPath`, never silently). So the second form
   * was ELIMINATED rather than taught to consumers.
   *
   * WHAT A READER MAY ASSUME, therefore: a repo-relative path, usable as a filesystem path after the
   * containment checks, and as a resolution key into the spatial/territory axes. For `symbol`/`block` the
   * path is extended by the `::`-separated unit chain (`file::item::block`, `adapter-io/src/ast.ts`) — the
   * FILE portion is the prefix up to the first `::`. A reader that needs the file must take that prefix
   * (`filePathOf`), never the whole string.
   *
   * WHAT A PRODUCER OWES: a path that exists in the repository, or nothing at all. A producer that holds
   * only a node identity MUST resolve it or drop the site — it may NOT widen this field back into a union.
   */
  readonly qualifiedPath: string

  readonly subtreeHash: SubtreeHash
}

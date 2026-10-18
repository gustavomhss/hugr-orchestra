// @atlas/grounding — src/ground.ts   (WP-4.10-c.GROUND · GROUND-3 · the ground() anchor builder)
//
// The anchor-builder front door carved from WP-4.10-a: `ground(node, src)` RE-DERIVES the grounding
// anchor for a groundable unit against the BUILT-index snapshot `src` (Owner-DEFINE pin: `Axes`,
// oracle-pin-map §5). For each of `node`'s CITATION TARGETS it resolves the unit's CURRENT `subtreeHash`
// by walking the axes hierarchy on the citation's `qualifiedPath` (the same resolution the sealed sibling
// `driftDetect` uses); a citation whose unit is gone / whose path is absent is DROPPED — fail-closed
// (GROUND-3), never a throw. Pure + total (no clock, no IO). Conforms to the frozen `GroundApi.ground`
// (`GroundApi` in `./types.ts`, atlas-grounding:128), pinning `node` from the reference data model.
//
// `node` (SIG-TBD in the frozen oracle) is PINNED HERE, not guessed. The reference gives `ground` no
// concrete `node` shape but its OUTPUT is fully pinned: a `Grounding` of `GroundingEntry`s each carrying an
// `anchor: StructRef = { kind, qualifiedPath, subtreeHash }` (atlas-grounding:38-44). Since `ground`
// RE-DERIVES the `subtreeHash` (the drift oracle) from `src`, the groundable unit must carry every anchor
// coordinate EXCEPT that one: `kind`, `qualifiedPath` (the resolution key), the human `path`, and the
// optional `displayLines` nav hint. A `Citation` is therefore exactly a `GroundingEntry`/`StructRef` minus
// the re-derived oracle — the minimal faithful shape the reference implies, NOT invented. The upward
// `@atlas/knowledge` `GroundedFact` is deliberately NOT imported (it would invert the layer DAG).
//
// SCOPE: `isGrounded` is the SEALED co-verb (WP-4.10-a, ../src/drift.ts) — imported/reused, never
// redefined. `findByKey` is module-local/private in the sealed `drift.ts`; `resolveCurrent` IS exported
// there (and reused by adapter-io's grounding-computer + governed-emit-negation), but the minimal axes walk
// is replicated here rather than editing the sealed sibling to widen its private surface.

import type { StructRef, SubtreeHash } from "@atlas/contracts"
import type { Axes, IndexNode } from "@atlas/index"
import type { Grounding, GroundingEntry } from "./types.js"

/**
 * A CITATION TARGET on a groundable unit: the anchor coordinates `ground` re-resolves — everything a
 * resolved `GroundingEntry`/`StructRef` (atlas-grounding:39-44) carries EXCEPT the `subtreeHash` drift
 * oracle, which `ground` re-derives from `src`. `qualifiedPath` is the axes resolution key (GROUND-1:
 * `displayLines`/line-ranges are NEVER the oracle, only an optional nav hint).
 */
export interface Citation {
  readonly kind: StructRef["kind"]
  readonly qualifiedPath: string
  readonly path: string
  readonly displayLines?: string
}

/** The groundable unit `ground` re-derives an anchor for: a bag of citation targets. */
export interface GroundableUnit {
  readonly citations: readonly Citation[]
}

/** Resolve a unit's CURRENT subtreeHash under `n` by its qualified key. Total: an absent unit returns
 *  `undefined` (unresolvable), never a throw. Replicates the sealed `drift.ts` walk (not exported there),
 *  INCLUDING its refusal of a node whose `subtreeHash` is its own `key` — a "hash" that is a constant of
 *  the address commits to no content and can never witness drift, so it is treated as absent. `ground` and
 *  `driftDetect` MUST agree on what resolves, or `ground` would build an anchor `driftDetect` then reads
 *  as gone. */
function findByKey(n: IndexNode, key: string): SubtreeHash | undefined {
  if (n.key === key) return String(n.subtreeHash) === n.key ? undefined : n.subtreeHash
  for (const child of n.children) {
    const hit = findByKey(child, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** The current subtreeHash of `qualifiedPath` across the CONTENT-COMMITTING built-index axes, or
 *  `undefined` if the unit is gone/unresolvable (GROUND-3 fail-closed). `displayLines`/line-ranges are
 *  never consulted (GROUND-1). The `dependency` axis is deliberately NOT scanned — its leaf hashes are
 *  node IDENTITIES (`asSubtreeHash(id({file: path}))`), invariant under every content change; see the
 *  full note on the sealed sibling `drift.ts::resolveCurrent`, whose axis list this MIRRORS. */
function resolveCurrent(src: Axes, qualifiedPath: string): SubtreeHash | undefined {
  for (const root of [src.spatial, src.territory]) {
    const hit = findByKey(root, qualifiedPath)
    if (hit !== undefined) return hit
  }
  return undefined
}

/**
 * GROUND-3 anchor builder. RE-DERIVES the grounding anchor for `node` against the built-index `src`: for
 * each citation target, resolve its CURRENT `subtreeHash` (the re-derived drift oracle, read from the
 * already-hashed index — never re-hashed locally) and emit a `GroundingEntry`. Pure + total, never a
 * throw. Conforms to the frozen `GroundApi.ground`, with `node` pinned to `GroundableUnit`.
 *
 * FAIL-CLOSED AT THE FACT, NOT AT THE ENTRY — the amendment this function carries.
 * The dropped-per-entry rule (`continue` past each unresolvable citation) is fail-CLOSED for the entry and
 * fail-OPEN for the fact, and the fact is the thing being certified. Reproduced: a fact citing TWO sites,
 * one of them deleted, re-grounded to a ONE-entry receipt that `isGrounded` accepted and `driftDetect`
 * read FRESH. Half the evidence had vanished and the receipt came back clean; only a fact whose EVERY
 * citation died was caught, because the empty receipt is the one state GROUND-2 rejects.
 *
 * A grounding receipt is a claim about what a fact is anchored to. A receipt that quietly answers a
 * narrower question than it was asked is a lie about grounding, and the truth gate (GROUND-4: HOLDS iff
 * grounded ∧ FRESH) then certifies the claim against evidence the repository no longer contains. So: if
 * ANY declared citation is unresolvable, NO receipt is built — `{ entries: [] }`, which `isGrounded`
 * rejects (GROUND-2) and `driftDetect` reads DRIFTED (GROUND-3), sending the author back to re-ground the
 * claim against what actually exists. Nothing is guessed and nothing is retained: the dangling citation
 * still never appears in the output (the SCN-GROUND-3a teeth), it just no longer takes the surviving
 * evidence down a path that reads clean.
 *
 * [AMENDS REQ-GROUND-3a / SCN-GROUND-3a-1/-2, which pin the PER-ENTRY drop — "the resulting grounding
 * contains only E_arr". That wording is what makes the receipt fail-open at the fact level. Flagged for
 * owner adjudication + a docs/requirements amendment; the goldens file is NOT edited here.]
 */
export function ground(node: GroundableUnit, src: Axes): Grounding {
  const entries: GroundingEntry[] = []
  for (const c of node.citations) {
    const subtreeHash = resolveCurrent(src, c.qualifiedPath)
    // GROUND-3, fact-level: one unresolvable citation sinks the whole receipt. Never a throw.
    if (subtreeHash === undefined) return { entries: [] }
    const anchor: StructRef = { kind: c.kind, qualifiedPath: c.qualifiedPath, subtreeHash }
    entries.push(
      c.displayLines === undefined ? { anchor, path: c.path } : { anchor, path: c.path, displayLines: c.displayLines },
    )
  }
  return { entries }
}

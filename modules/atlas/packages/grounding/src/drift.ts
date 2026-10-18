// @atlas/grounding — src/drift.ts   (WP-4.10-a.GROUND · GROUND-1 / GROUND-2 / GROUND-3 / GROUND-5)
//
// The LOCAL single-entry drift oracle + the real-grounding predicate.
//   - `isGrounded(g)`  — GROUND-2: `g` is real iff it has ≥1 entry AND EVERY entry carries a non-empty
//     `subtreeHash`. An empty/partial grounding fails and MUST never surface FRESH.
//   - `driftDetect(grounding, src)` — the freshness verdict against the BUILT-index snapshot `src`
//     (Owner-DEFINE pin: `Axes`). FRESH iff `isGrounded` AND every anchor's recorded `subtreeHash` still
//     RESOLVES to the same structural unit in `src` (GROUND-1: the oracle is `subtreeHash`, never
//     `displayLines`/line-ranges). An ungrounded grounding is DRIFTED (GROUND-2); an unresolvable citation
//     is DRIFTED, fail-closed, NEVER a throw (GROUND-3); a real change to the cited unit's bytes
//     subtree is DRIFTED (GROUND-5). Both pure + total. Transcribed against the frozen oracles
//     `./types.ts` (`DriftApi.driftDetect` + `GroundApi.isGrounded`).
//
// SCOPE (card exclusions): NOT the GROUND-11 forward-closure interface fold (owned by WP-4.10-b.GROUND) —
// this slice folds only the LOCAL grounding-set; NOT the GROUND-13 advisory→`STALE` routing (owned by
// WP-4.12-a.GROUND, keys on the UPWARD-owned `Fact.kind` this layer MUST NOT import). `driftDetect`
// therefore returns the raw LOCAL structural `Freshness` — `FRESH` | `DRIFTED`, never `STALE` here.
// The `ground(node)` verb is DEFINE-parked (its `node` type is unpinned) and CARVED to a successor WP —
// `isGrounded` (its co-verb in `GroundApi`) is co-located here with `driftDetect`, which depends on it.

import type { Freshness, SubtreeHash } from "@atlas/contracts"
import type { Axes, IndexNode } from "@atlas/index"
import type { Grounding, DriftApi, GroundApi } from "./types.js"

/** Resolve a structural unit's CURRENT subtreeHash in `node`'s subtree by its qualified key (the anchor's
 *  `qualifiedPath`). Total: an absent unit returns `undefined` (unresolvable), never a throw.
 *
 *  A node whose `subtreeHash` IS its own `key` is treated as ABSENT. Such a node is not hashing anything —
 *  its "hash" is a constant of its address, so it is byte-identical before and after any edit and can
 *  never witness drift. Reading one as the oracle is not a weak check, it is NO check; refusing it is
 *  fail-closed (the anchor reads DRIFTED, never FRESH). */
function findByKey(node: IndexNode, key: string): SubtreeHash | undefined {
  if (node.key === key) return String(node.subtreeHash) === node.key ? undefined : node.subtreeHash
  for (const child of node.children) {
    const hit = findByKey(child, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

/**
 * The current subtreeHash of `qualifiedPath` across the CONTENT-COMMITTING built-index axes, or
 * `undefined` if the unit is gone/unresolvable (GROUND-3 fail-closed). `displayLines`/line-ranges are
 * never consulted (GROUND-1).
 *
 * THE DEPENDENCY AXIS IS NOT SCANNED, and that omission is the load-bearing part. `spatial` and
 * `territory` are hierarchies folded by `foldNodeHash` over each node's own bytes plus its named children,
 * so their hashes move when the code moves. The `dependency` axis is a GRAPH view: its leaves are keyed by
 * `nodeHashOfPath(p) = id({file: p})` and carry `subtreeHash = asSubtreeHash(<that same key>)` (see
 * @atlas/index src/build.ts `dependencyAxis`), an IDENTITY that commits to no content. Scanning it here —
 * first-hit-wins, as this loop used to, over `[spatial, territory, dependency]` — meant an author could
 * CHOOSE a dependency-axis key as a fact's anchor and mint a fact that CAN NEVER DRIFT: reproduced by
 * replacing a file's entire contents and re-reading the verdict as FRESH. Freshness is the truth door's
 * other leg, so an anchor the oracle cannot invalidate is a hole straight through it.
 *
 * An anchor that names a dependency-axis node is now simply UNRESOLVABLE ⇒ DRIFTED, fail-closed. A fact
 * that wants a freshness-bearing anchor names the unit on the spatial/territory rail (the file path, or a
 * `file::item::block` refinement key), where the hash actually folds the bytes.
 */
export function resolveCurrent(src: Axes, qualifiedPath: string): SubtreeHash | undefined {
  for (const root of [src.spatial, src.territory]) {
    const hit = findByKey(root, qualifiedPath)
    if (hit !== undefined) return hit
  }
  return undefined
}

/**
 * GROUND-2 real-grounding predicate: `true` iff `g` has ≥1 entry AND every entry's `anchor.subtreeHash`
 * is a NON-EMPTY STRING. The conjunct is `every` (AND), never `some` (OR) — one bad anchor sinks it.
 * Conforms to the frozen `GroundApi.isGrounded`. Pure + total — and total is LOAD-BEARING here, not a
 * nicety: `subtreeHash`'s brand (`@atlas/contracts` `SubtreeHash = string & {brand}`) evaporates at
 * runtime, and every value reaching this predicate may have come through `JSON.parse`, an SDK-parsed MCP
 * argument, or a CAS blob — none of which enforce the brand. Reading `.length` off the raw field (as a
 * prior revision did) THREW on `undefined`/`null` and fail-OPEN read a non-string carrier of `.length`
 * (an array, `{length:5}`, a boxed `String`) as grounded — and `driftDetect` calls this FIRST
 * (`¬isGrounded ⇒ DRIFTED`), so that throw propagated up the SEALED drift oracle and broke its own
 * "no throw" contract. The `typeof … === 'string'` guard makes only an actual non-empty string pass,
 * fail-CLOSED on everything else. This body is BYTE-IDENTICAL to `knowledge`'s door-side copy
 * (`ratify/fastpath.ts`) — the two are kept from diverging by `test/fastpath-isgrounded-parity.test.ts`.
 */
export const isGrounded: GroundApi["isGrounded"] = (g: Grounding): boolean =>
  g.entries.length >= 1 &&
  g.entries.every((e) => typeof e.anchor.subtreeHash === "string" && e.anchor.subtreeHash.length > 0)

/**
 * GROUND-1/2/3/5 local freshness verdict against the built-index snapshot `src`. Conforms to the frozen
 * `DriftApi.driftDetect(grounding, src)`. Pure + total (no clock, no IO, no throw):
 *   - `¬isGrounded(grounding)`                              ⇒ DRIFTED (GROUND-2: ungrounded never FRESH).
 *   - an anchor whose unit is gone/unresolvable in `src`    ⇒ DRIFTED (GROUND-3: fail-closed, no throw).
 *   - an anchor whose current subtreeHash ≠ the recorded one ⇒ DRIFTED (GROUND-5: a real change drifts).
 *   - every anchor resolves and matches                     ⇒ FRESH   (GROUND-1/5: the verdict reads the
 *                                                              subtreeHash ONLY — never `displayLines` or a
 *                                                              line range — so a change that moves a cited
 *                                                              unit's LINE NUMBERS without changing the
 *                                                              unit itself stays FRESH).
 *
 * What that does NOT mean — the two overclaims this docstring used to make:
 *   - a REFORMAT does NOT stay FRESH. There is no whitespace or comment normalization anywhere on this
 *     path; the subtreeHash folds the unit's bytes as recorded, so re-indenting drifts.
 *   - a RENAME does NOT stay FRESH, and must not. Renaming a unit re-keys it, so its own anchor stops
 *     resolving (DRIFTED, fail-closed above) and the PARENT drifts too, because the rollup binds each
 *     child's NAME to its hash (see `foldNodeHash`, @atlas/index src/rollup.ts). A rename that left an
 *     ancestor FRESH was the drift oracle certifying a fact against a tree that no longer contains it.
 * The one normalization that IS applied is the kernel's: `canonicalForm` NFC-normalizes strings, so a pure
 * Unicode NFD→NFC rewrite of a unit's bytes does NOT drift (KERNEL-1, owned by @atlas/kernel).
 */
export const driftDetect: DriftApi["driftDetect"] = (grounding: Grounding, src: Axes): Freshness => {
  if (!isGrounded(grounding)) return "DRIFTED"
  for (const e of grounding.entries) {
    const current = resolveCurrent(src, e.anchor.qualifiedPath)
    if (current === undefined || current !== e.anchor.subtreeHash) return "DRIFTED"
  }
  return "FRESH"
}

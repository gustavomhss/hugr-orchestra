// @atlas/knowledge — src/read/sameas.ts  (WP-SAMEAS · derive `sameAs` equivalence on read)
//
// The READ-side human-asserted equivalence relation. `sameAs` edges are STORED symmetrically on each node
// (CurrentNode.sameAs — a HUMAN asserts "nodeKey A names the SAME fact as nodeKey B" at unrelated code
// sites, H1), but the OBSERVABLE relation is their TRANSITIVE closure: a union-find fold over the current
// projection. For each equivalence class of size ≥2 among current nodes, EVERY canonical intra-class pair
// {a,b} (a<b) is emitted — so A≡B and B≡C surface A≡C too. This is a NON-destructive observability edge
// (like `subsumes`), never a merge. Pure + total — no throw, no clock, no LLM (A1).
//
// Mirrors `read/subsumes.ts`: sorted output, pure+total, dangling edges ignored (a `sameAs` peer NOT in
// `current` never throws — it is simply not unioned, so a stored-but-since-retired peer degrades cleanly).
//
// ── RETRACTION (A-D3 / task #83) ──────────────────────────────────────────────────────────────────────────
// THE MEASUREMENT THAT DECIDED THE WHOLE DESIGN: `deriveSameAs` is REBUILD-PER-READ, not an incrementally
// maintained union-find. Every call mints a fresh `parent` map from `projection.current` (see the body); the
// ONLY persisted state is the per-node edge list (`sameAs`, and now `sameAsRetracted`), and `WireProjection`
// (adapter-io `sidecar.ts`) serializes `current`/`cas`/`builtAt`/`gen`/`identity` — nothing derived, no
// class membership, no parent pointers. There is no module-level cache and no memo: the fold is a pure
// function of its argument, re-run per call.
//
// So there is no merged structure to un-merge, and classical union-find's missing DELETE is simply not on
// the critical path. Filtering a withdrawn edge out of the fold INPUT makes the class SPLIT on the very next
// read, for free. (Were it incrementally maintained, dropping an edge would leave the class merged and the
// retraction door would be a false promise — a door that retracts nothing is worse than no door, because it
// makes a governance guarantee it does not keep.)
//
// A retraction is an APPEND: the peer STAYS in `sameAs` and additionally appears in `sameAsRetracted`, so
// the row records that the equivalence was asserted AND that it was withdrawn. Deleting the edge would make
// "never linked" and "linked, then unlinked" the same bytes — the store lying about its own history.

import { asNodeKey } from "@atlas/kernel"
import type { NodeKey } from "@atlas/contracts"
import type { StoreProjection } from "../write/router.js"

/** A derived symmetric equivalence edge — two current nodes a human asserted name the SAME fact.
 *  CANONICAL: `a < b` lexicographically, so each unordered pair is emitted exactly once. */
export interface SameAs {
  readonly a: NodeKey
  readonly b: NodeKey
}

/** Lexicographic string comparator (the same one subsumes sorts by) — total, no locale. */
function cmp(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0
}

/** The state of ONE unordered `sameAs` pair, as the stored relation records it (A-D3, task #83). */
export type SameAsEdgeState = "absent" | "asserted" | "retracted"

/**
 * The CANONICAL key of an unordered pair — LENGTH-PREFIXED, hence INJECTIVE over ANY two strings.
 *
 * `${lo.length}:${lo}${hi}` with `lo < hi`. Decoding is unambiguous by construction: the leading run of
 * DIGITS ends at the first `:` (a digit is never a `:`), and it states exactly how many code units of the
 * remainder belong to `lo`; everything after those is `hi`. So `pairKey(x,y) === pairKey(x2,y2)` iff the
 * unordered pairs are equal. NO character is reserved and there is nothing to escape — the split point is
 * carried out of band, in the prefix, rather than searched for in the payload.
 *
 * ── WHAT THIS REPLACED (task #144) ──────────────────────────────────────────────────────────────────────
 * The key was `${lo}<NUL>${hi}`, a NUL-separated join, resting on the claim that NUL "cannot be smuggled
 * inside a nodeKey to forge another pair's key". That was never a property of THIS function — it was an
 * assumption about PRODUCERS. REPRODUCED against the built product before this change: record a retraction
 * on the pair {'a', 'b<NUL>c'} and the UNRELATED pair {'a<NUL>b', 'c'} — which nobody retracted — reports
 * `sameAsEdgeState === 'retracted'`, drops out of `deriveSameAs`, and is then LATCHED against re-assertion
 * for good, because a retraction does not reverse by design. Two pairs, one key, one silent casualty.
 *
 * ── WHY THE ENCODING AND NOT A CHECKED `asNodeKey` ──────────────────────────────────────────────────────
 * Because a checked constructor DOES NOT FIX THIS ONE, which is a measurement rather than a preference.
 * Nothing on this path is minted by `asNodeKey`: `sameAsEdgeState` takes plain `string`s, and `pairKey`'s
 * other inputs are `projection.current`'s MAP KEYS, `node.nodeKey` and the `sameAs`/`sameAsRetracted` peer
 * lists — all declared `string` (see `write/upsert.ts`), all rehydrated from `.atlas/projection.json` by
 * `adapter-io` `sidecar.ts`, and none of them routed through the kernel mint. The reproduction above builds
 * exactly that shape and calls `asNodeKey` ZERO times. So validating the mint would have left the
 * demonstrated forgery working while reading like a fix, which is the worse outcome. (Cost was never the
 * objection either: instrumented, the whole unit suite makes 546 `asNodeKey` calls in total.)
 *
 * Validating at the DOORS instead has the same hole — the projection FILE is not a door — and it is a
 * policy someone must remember to re-apply at every new door. Length-prefixing makes the forgery
 * unrepresentable regardless of what any producer hands us. Same shape as the `::` decision at task #110.
 *
 * ── NO MIGRATION, and this was checked rather than assumed ──────────────────────────────────────────────
 * A pair key never leaves this module. Its only two callers are `retractedPairs` and `sameAsEdgeState`
 * below; both build a `Set<string>` per call and drop it. The DURABLE relation is the per-row `sameAs` /
 * `sameAsRetracted` PEER LISTS — plain nodeKeys written by `write/link.ts` and serialized by `sidecar.ts`.
 * Re-encoding this key changes no byte on disk and no wire field. (Bonus, and the reason `git grep` could
 * not search this file before: the literal NUL made git classify `sameas.ts` as a BINARY file.)
 */
const pairKey = (x: string, y: string): string => {
  const lo = x < y ? x : y
  const hi = x < y ? y : x
  return `${String(lo.length)}:${lo}${hi}`
}

/**
 * Every unordered pair with a RETRACTION recorded on EITHER endpoint (A-D3, task #83).
 *
 * EITHER, NOT BOTH, and that is a fail-closed choice rather than a convenience. `atlas-link --retract`
 * writes the marker symmetrically, so under a well-formed projection the two readings coincide. They differ
 * only for a HALF-WRITTEN retraction — and this file's own header already records that the projection is
 * untrusted input (`ratify/tier.ts` names it in as many words). Under "either", a half-written retraction
 * SPLITS a class; under "both", it keeps the class MERGED. Splitting loses an equivalence: local, bounded,
 * visible in the query envelope. Staying merged keeps a withdrawn edge live and, because the relation is
 * transitive, keeps it unboundedly contagious — the exact harm A-D3 was opened about. So the ambiguous case
 * resolves to "does not merge".
 */
function retractedPairs(projection: StoreProjection): ReadonlySet<string> {
  const out = new Set<string>()
  for (const [key, node] of projection.current) {
    for (const peer of node.sameAsRetracted ?? []) {
      out.add(pairKey(key, peer))
      // The row's DECLARED identity too, for the same reason `deriveSameAs` unions on both: under KNOW-4g
      // these are one string and this adds nothing; under a divergent row it can only ADD pairs, i.e. it can
      // only cause a SPLIT, never a merge. Monotone in the safe direction.
      out.add(pairKey(node.nodeKey, peer))
    }
  }
  return out
}

/**
 * The state the stored relation records for the unordered pair `{a, b}` (A-D3, task #83). Pure + total; an
 * unknown key is simply in no pair. THE ONE DEFINITION both the read fold below and the governed retraction
 * door (`adapter-io/src/governed-link.ts` gate 4.5) consume, so the door can never refuse a pair the fold
 * still merges, or accept one it ignores.
 *
 * `retracted` DOMINATES `asserted` — the peer is still in `sameAs` by construction (a retraction appends, it
 * never deletes), so asking "is it asserted" first would report every retracted edge as live, and the door
 * would then accept a re-link that changes nothing and that the fold goes on ignoring.
 * `asserted` reads EITHER endpoint's list, matching the fold, which unions on the edge stored at whichever
 * row it is iterating and therefore merges on a half-written assertion too.
 */
export function sameAsEdgeState(projection: StoreProjection, a: string, b: string): SameAsEdgeState {
  if (a === b) return "absent" // a node never names itself; there is no self-pair to be in any state
  if (retractedPairs(projection).has(pairKey(a, b))) return "retracted"
  const peersOf = (k: string): readonly string[] => projection.current.get(k)?.sameAs ?? []
  return peersOf(a).includes(b) || peersOf(b).includes(a) ? "asserted" : "absent"
}

/**
 * Derive the FULL transitive equivalence relation over the projection's current nodes (WP-SAMEAS). Union-find
 * over `projection.current` keys: for each entry, `union(key, peer)` for every `peer` in its stored `sameAs`
 * ONLY IF `peer` is ALSO a current node (a dangling edge to a retired/absent nodeKey is ignored, never a
 * throw), plus `union(key, node.nodeKey)` — a no-op under KNOW-4g's `key === nodeKey` invariant, and the
 * conservative reading of a row that violates it. Then group by root; for every class of size ≥2 emit ALL
 * canonical intra-class pairs `{a,b}` with `a<b`. Result is SORTED by `(a,b)` ascending — total,
 * self-pair-free, each pair once. Pure + total, no clock/LLM. A node with no `sameAs` is a singleton
 * (contributes nothing). `find` is TOTAL over off-domain keys — see the comment on it; the partial version
 * spliced unrelated classes through a shared `undefined` parent slot.
 */
export function deriveSameAs(projection: StoreProjection): readonly SameAs[] {
  const keys = [...projection.current.keys()]
  const present = new Set(keys)
  // A-D3 (task #83): the withdrawn edges, resolved ONCE per fold. See `retractedPairs` for why a retraction
  // recorded on EITHER endpoint is enough to stop the merge.
  const retracted = retractedPairs(projection)
  // REBUILD-PER-READ, and this line is the whole reason retraction is cheap: the union-find is minted here,
  // per call, from the stored edge list. Nothing about class membership survives between calls.
  const parent = new Map<string, string>()
  for (const k of keys) parent.set(k, k)

  // TOTAL `find` — a key with NO entry in `parent` is its OWN root, and NOTHING is written for it.
  // The previous `while (parent.get(r) !== r) r = parent.get(r) as string` was PARTIAL: for an off-domain key
  // the first `parent.get` returned `undefined`, `undefined !== undefined` is false, so the walk STOPPED on
  // `undefined` and returned it as a root. `union` then stored that root as a KEY (`parent.set(undefined, …)`),
  // and the NEXT off-domain `find` walked into that one shared `undefined` slot and came back with a root from
  // a COMPLETELY UNRELATED class — splicing two classes together on an edge nobody stored. Measured: it also
  // broke PROP-SAMEAS-1 (the spliced pair is derived-equal yet outside the door class), the one direction the
  // link gate may never lose.
  const find = (x: string): string => {
    let r = x
    for (;;) {
      const p = parent.get(r)
      if (p === undefined || p === r) return r // absent ⇒ its own root (total); self-parent ⇒ the root
      r = p
    }
  }
  const union = (x: string, y: string): void => {
    const rx = find(x)
    const ry = find(y)
    if (rx === ry) return
    // Attach the LARGER root under the SMALLER — the class root is deterministically the MIN member of the
    // class, independent of edge/iteration order, so the fold is a pure function of the stored relation.
    // (MEMBER, not "current key": a divergent row's declared `nodeKey` below may be off-domain and may be that
    // minimum. It never reaches the OUTPUT — the grouping pass below enumerates `keys` only — it merely roots
    // the bucket, and it is chosen by the same min rule, so determinism is unchanged.)
    if (rx < ry) parent.set(ry, rx)
    else parent.set(rx, ry)
  }

  for (const [key, node] of projection.current) {
    // A row has TWO identities: the ADDRESS it is stored at (`key` — what every reader and every write door
    // looks it up by) and the identity it declares about ITSELF (`node.nodeKey`). KNOW-4g makes them the same
    // string, and `readSidecar` (adapter-io) now REFUSES a whole sidecar in which any row diverges — but this
    // fold is a pure library function over ANY `StoreProjection`, so it relates BOTH identities instead of
    // silently trusting one. Under the invariant `key === node.nodeKey` and this union is a no-op, so nothing
    // about a well-formed projection changes; under a divergent row the class only ever WIDENS (the
    // conservative direction), and in particular the edges stored AT `key` are never lost — losing them is
    // class SHRINKAGE, which is the bypass direction the door is priced against.
    union(key, node.nodeKey)
    if (node.sameAs === undefined) continue
    for (const peer of node.sameAs) {
      // A-D3 (task #83): a RETRACTED edge stops merging here. Because the `parent` map above is rebuilt per
      // call, dropping the union is ALL a retraction has to do — the class SPLITS on the next read wherever
      // the withdrawn edge was its only bridge. Classical union-find has no delete; this fold never needed
      // one, because it holds no state between calls.
      if (retracted.has(pairKey(key, peer))) continue
      if (present.has(peer)) union(key, peer) // dangling peer (not current) ⇒ ignored (total)
    }
  }

  // Group the current keys by their union-find root — one bucket per equivalence class.
  const classes = new Map<string, string[]>()
  for (const k of keys) {
    const root = find(k)
    const bucket = classes.get(root)
    if (bucket === undefined) classes.set(root, [k])
    else bucket.push(k)
  }

  const edges: SameAs[] = []
  for (const members of classes.values()) {
    if (members.length < 2) continue // a singleton class asserts no equivalence
    const sorted = [...members].sort(cmp)
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        edges.push({ a: asNodeKey(sorted[i]!), b: asNodeKey(sorted[j]!) }) // i<j ⇒ a<b (canonical)
      }
    }
  }
  edges.sort((x, y) => cmp(String(x.a), String(y.a)) || cmp(String(x.b), String(y.b)))
  return edges
}

/**
 * The members of `key`'s equivalence class — `key` itself plus every node TRANSITIVELY equated to it by the
 * stored relation. `key` need not be a current node; an unknown key is its own singleton.
 *
 * Why a write door needs this: the relation this module folds is TRANSITIVE, so the security boundary is the
 * CLASS, not the edge. A door that gates a new `a~b` link on the classes of `a` and `b` ALONE is gating on
 * one edge of a graph whose reachability it just extended. That was a live two-hop bypass: billy legitimately
 * equates a `T0` node A with a `T2` node B; afterwards ANY in-scope actor holding ANY non-empty ratifier
 * links B to their own node M, and the derived relation contains `{A, M}` — the attacker's node is inside the
 * `T0` node's class, and every read fold walks it, without billy ever signing that.
 *
 * The class is expanded on ALL THREE of a row's identities — the map key it is STORED at, the `nodeKey` it
 * DECLARES, and its stored peers. Seeding on the key while expanding only on `nodeKey` was a live class
 * SHRINKAGE: for a row written at key `M` declaring `nodeKey: B, sameAs: [A]`, `classOf(M)` came back the
 * singleton `[M]`, so `governed-link.ts` resolved ZERO members and priced its authz and ratify gates over
 * nothing. That row shape needs write access to `.atlas/projection.json`, which is squarely IN the threat
 * model (see `ratify/tier.ts` on the projection as untrusted input) — `readSidecar` now refuses such a
 * sidecar outright, and this fold degrades conservatively if one ever arrives by another route.
 *
 * ── THIS FOLD IS DELIBERATELY BLIND TO RETRACTION (A-D3, task #83) ──────────────────────────────────────
 * `deriveSameAs` honours `sameAsRetracted`; this one does not. The asymmetry is the decision, not an
 * oversight, and it rests entirely on WHO CALLS WHICH.
 *
 * CALLER CONTRACT, because getting this wrong would turn a safety margin into a governance hole: this fold
 * answers "how much authority does touching this class cost?" — it PRICES GATES and nothing else. It must
 * NEVER be used to serve, render or export the observed equivalence relation; that is `deriveSameAs`'s job
 * and only `deriveSameAs` reflects retraction. A reader served from this fold would be told a withdrawn
 * equivalence still holds. (Measured at the time of writing: the only callers are `governed-link.ts`'s
 * authz and ratify gates. `wire.ts` serves `deriveSameAs`.)
 *
 * Given that contract, blindness is the conservative direction, for three reasons in order of weight:
 *   1. IT NEVER UNDER-CHARGES. Shrinkage is the bypass direction on this surface (see the paragraph above,
 *      and `sidecar.ts`'s `isKeyedEntry`). If retraction narrowed the class, retracting would become a way
 *      to LOWER the price of a subsequent link — and while the retraction is itself governed, the
 *      projection is untrusted input, so a hand-written `sameAsRetracted` marker would be a one-byte way to
 *      cheapen the gate. Blind here, that move does not exist.
 *   2. IT KEEPS PROP-SAMEAS-1 TRUE BY CONSTRUCTION. Honouring retraction can only SHRINK the derived class;
 *      leaving this one wide preserves `derived ⊆ door` with no new case. Teaching both folds about
 *      retraction would make the subset law depend on the two agreeing about half-written markers — a
 *      coupling this property has already been broken by once.
 *   3. THE COST IS STATED, NOT HIDDEN: after retracting a link that once merged a `T0` node into a class,
 *      further links across that class still require billy. Retraction restores what every READER observes;
 *      it does not buy back a lower signature. That is the half a governance gate should be on.
 *
 * Pure + total, no clock/LLM. NOT the same fold as `deriveSameAs`: that one is a union-find that SKIPS
 * non-current peers, this one is a fixed-point expansion that follows them. So the two DO disagree — a
 * retired peer bridging two live nodes merges them here and not there. The divergence is a deliberate,
 * property-tested SOUND OVER-APPROXIMATION (`PROP-SAMEAS-1`): the derived class is always a SUBSET of this
 * one. Larger means a link asks for a stronger signature than strictly needed; smaller would be a bypass.
 * (This docstring previously asserted the two "can never disagree" — false on both halves.)
 */
export function sameAsClassOf(projection: StoreProjection, key: string): readonly string[] {
  const members = new Set<string>([key])
  // Transitive closure by repeated expansion over the SYMMETRIC stored edges. The relation is stored on both
  // endpoints (the link door writes it symmetrically), but a peer is followed from EITHER direction here so a
  // half-written edge still widens the class — the conservative reading for a gate.
  let grew = true
  while (grew) {
    grew = false
    for (const [rowKey, node] of projection.current) {
      // THREE identities per row, all of them followed: the ADDRESS the row is stored at (`rowKey` — what
      // this query is SEEDED with, and what the door then looks members up by), the identity the row DECLARES
      // (`node.nodeKey` — what the expansion used to run on, exclusively), and its stored peers. KNOW-4g makes
      // the first two the same string, so under a well-formed projection this is exactly the old fold. When
      // they DIVERGE, seeding on one and expanding on the other made the endpoint's own edges invisible and
      // COLLAPSED the class to a singleton — `classOf(M) = [M]` for a row at `M` declaring `B ~ A` — which is
      // class shrinkage, i.e. the gate prices its authz and ratify checks over nothing. Following all three
      // can only ever WIDEN, and a wider class merely asks a link for a stronger signature.
      const peers = node.sameAs ?? []
      const touches = members.has(rowKey) || members.has(node.nodeKey) || peers.some((p) => members.has(p))
      if (!touches) continue
      for (const k of [rowKey, node.nodeKey, ...peers]) {
        if (!members.has(k)) {
          members.add(k)
          grew = true
        }
      }
    }
  }
  return [...members].sort(cmp)
}

// @atlas/kernel — src/fold.ts  (the fold reconstruction over the event log — KERNEL-5)
//
// `fold` PURELY reduces an `EventLog` to `AtlasState` (fresh state per call, no clock/network/LLM, no
// cache) so replay from empty is byte-identical (KERNEL-5a/5b). INVARIANT: the per-nodeKey OR-Set union is
// idempotent by `contentHash` and order-independent (KERNEL-11) because each slot holds a CANONICAL
// representative chosen by a pure content function — NOT because "first seen wins", which is an
// arrival-order rule and was the defect (see the §canonical entry representative block below).

import type { AtlasState, Event, EventLog, Node } from "./types.js"
import { combine } from "./log.js"

/**
 * The convergent fold + CRDT OR-Set merge core (frozen, KERNEL-10/11): `fold` reduces the event set to
 * `AtlasState` order-independently; `merge`/`mergeNode` are the set/grow-only unions; `head` picks the
 * single FRESH head by `contentHash` ALONE (never seq/clock/LLM). (fspec-merge:128, 139-160)
 */
export interface FoldApi {
  /** Convergent reconstruction of current state from the set; order-independent (KERNEL-11).
   *  (atlas-kernel:103; fspec-merge:152) */
  fold(log: EventLog): AtlasState
  /** Set-union by event id; commutative, associative, idempotent (KERNEL-9/11).
   *  (atlas-kernel:102; fspec-merge:128) */
  merge(a: EventLog, b: EventLog): EventLog
  /** Commutative, grow-only per-nodeKey union — 0 dropped (KERNEL-10). (fspec-merge:139-143) */
  mergeNode(x: Node, y: Node): Node
  /** The forced single head = `max-by-contentHash` among FRESH, non-superseded entries — contentHash
   *  ALONE, never seq/clock/LLM (KERNEL-10). (fspec-merge:144-147) */
  head(n: Node): Event
}

// ── the canonical entry representative — what makes the union a JOIN rather than a race ───────────────
//
// An OR-Set slot holds ONE `Event`, but the slot key (`contentHash`) is COARSER than event identity, so two
// genuinely different events can land on one slot. "First-seen wins" then resolves them by ARRIVAL ORDER,
// which is precisely what KERNEL-11 forbids. Two independent shapes reach that fork, both MEASURED on the
// base commit (c76d26b) and both previously invisible because the ∀-generators excluded them:
//
//   (1) SAME `contentHash`, DIFFERENT `fresh` ⇒ DISTINCT event ids (`fresh` is in the id preimage), so BOTH
//       events survive the id-keyed log and collide on one slot. Witness: nodeKey `nk-0`, contentHash
//       `ch-001`, payload `{c:1}` — id(fresh:true) = 87d9f7fd8af1f3e64bc5fab751dfd2f2ee0f6a962280010abdb28f7
//       e65d4944d, id(fresh:false) = e956c48c5761aecbedb5d74b710c5fde9ba0d2be44670d06f955809c7827d705;
//       `fold({x,y})` surfaced `fresh:true` and `fold({y,x})` surfaced `fresh:false`.
//   (2) IDENTICAL content but a different `seq` ⇒ ONE id (`seq` is pinned out of the preimage, KERNEL-9), so
//       the log's version map retains whichever event ARRIVED FIRST — and its `seq` value then leaks into
//       the folded state. Witness: the same content at seq 1 vs seq 2 folds to `"seq":1` or `"seq":2`
//       depending on delivery order, under one id 87d9f7fd8af1f3e64bc5fab751dfd2f2ee0f6a962280010abdb28f7e6
//       5d4944d. This one is NOT a slot collision at all — it is upstream of the fold — and no change to the
//       event-identity preimage can fix it.
//
// The two are killed by one rule: the fold stores a CANONICAL REPRESENTATIVE, never the arrival-first object.
// `canonicalEntry` normalizes the part of an event that lives OUTSIDE the algebra; `preferred` picks the slot
// winner by a fixed total order that is a pure content function.
//
// NOT chosen, recorded because it looks right and is not: dropping `fresh` from the `eventId` preimage (as a
// KERNEL-8 SIDE_INDEX). MEASURED — it collapses x and y onto ONE id (6710b5e196ac0d49e539f82890a149611be3b42
// ece04e32f327e947e5d8981aa) but does NOT restore convergence: `append`/`combine` are first-write-wins on the
// id, so the log then retains x or y by arrival order and the folded `fresh` still flips. It relocates the
// race from `fold` up into the log (where the KEYSET looks identical, so it is harder to witness), moves
// every event id, and contradicts ratified text (`fspec-merge` §DOWN `RefLog.id`, goldens-krn's event table
// which lists `fresh` as a preimage column) — it would be a spec amendment that does not even work.

/** `seq` pinned to the canonical constant `eventId` pins it to (log.ts). `seq` is a LOCAL ordering hint that
 *  lives OUTSIDE the algebra — never in identity, `⊑`, or `⊔` (KERNEL-9; fspec-merge §reduction) — so it MUST
 *  NOT reach the folded state, where a retained arrival-first value would make `AtlasState` order-dependent.
 *  The LOG keeps each event's `seq` verbatim (it is a legitimate local hint there); only the fold normalizes. */
function canonicalEntry(e: Event): Event {
  return e.seq === 0 ? e : { ...e, seq: 0 }
}

/** The slot winner when two DISTINCT events collide on one `contentHash`: MAX by the event's own content
 *  address `id`. Pure content function — never `seq`, never a clock, never an LLM (KERNEL-10) — and `max` is
 *  the direction already pinned-canonical for the `head` tie-break (fspec-merge §UP KERNEL-10), so the fold
 *  and the head agree on direction. `contentHash` itself cannot discriminate here: it is EQUAL by
 *  construction, which is why the slot collided.
 *
 *  Total and allocation-free: it compares the stored `id` STRING and never re-hashes, so `fold` stays pure
 *  and total (KERNEL-7) even on a payload that would be a canonical-form violation. CAVEAT, stated because
 *  it bounds the guarantee: this discriminates events whose `id` is the real content address (KERNEL-1/9).
 *  A caller that hand-rolls `id` (KERNEL-1b forbids it) can present two different events under one `id`; they
 *  are then already indistinguishable to the id-keyed log itself, so the ambiguity is upstream, not here. */
function preferred(incumbent: Event, candidate: Event): Event {
  return candidate.id > incumbent.id ? candidate : incumbent
}

/** Re-key a Map in ascending key order. A JS `Map` iterates in INSERTION order, so a fold that inserted
 *  nodeKeys/contentHashes as they arrived hands back a state whose ITERATION is still arrival-dependent —
 *  even when every value is already canonical. The ratified byte-identity notion hides this (it serializes
 *  through the KERNEL-1 canonicalizer, which SORTS keys — fspec-merge §DOWN closing note), so the law is
 *  satisfied either way; MEASURED on the value-fixed fold, `fold([a,b,c])` iterated `ch-1,ch-3` while
 *  `fold([c,b,a])` iterated `ch-3,ch-1` and both serialized identically. Sorting here makes the state a
 *  function of the event SET under RAW iteration too, so a consumer that walks `fold(...)` without
 *  re-sorting cannot pick up an arrival-order dependence the canonical projection would have masked.
 *  This is STRONGER than the ratified law demands — flagged as such in the completion card. */
function sorted<K extends string, V>(m: ReadonlyMap<K, V>): Map<K, V> {
  return new Map([...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))
}

/**
 * Convergent reconstruction of the current `AtlasState` from the event set (KERNEL-5a/5b, KERNEL-11).
 * Order-independent: the folded state depends only on the SET of events, not their insertion order.
 */
export function fold(log: EventLog): AtlasState {
  const state: AtlasState = new Map()
  for (const ev of log.values()) {
    const nodeKey = ev.nodeKey
    if (nodeKey === undefined) continue // non-node-forming event — nothing to project
    let node = state.get(nodeKey)
    if (node === undefined) {
      node = { nodeKey, entries: new Map<Event["contentHash"], Event>() }
      state.set(nodeKey, node satisfies Node)
    }
    // grow-only OR-Set union keyed by contentHash. The slot value is the CANONICAL representative and, on a
    // collision, the MAX-by-id one — a pure content function, so the result is a function of the event SET.
    const entry = canonicalEntry(ev)
    const incumbent = node.entries.get(entry.contentHash)
    node.entries.set(entry.contentHash, incumbent === undefined ? entry : preferred(incumbent, entry))
  }
  // canonical key ORDER as well as canonical values — see `sorted`.
  const out: AtlasState = new Map()
  for (const [nodeKey, node] of sorted(state))
    out.set(nodeKey, { nodeKey: node.nodeKey, entries: sorted(node.entries) })
  return out
}

// ── KERNEL-10 / KERNEL-11: the merge / collision fold — set-union, grow-only node union, forced head ────
// (WP-1.3-b.KERNEL — the FSPEC-merge cluster). EXTENDS the sealed fold() above (KERNEL-5/11) with the
// collision-resolution surface the FoldApi names: `merge` (log set-union by event id), `mergeNode` (the
// grow-only per-nodeKey OR-Set union, 0 dropped), and `head` (the forced single head = MAX-by-contentHash
// among the FRESH, non-superseded entries — `contentHash` ALONE, never seq/clock/LLM). The head direction
// is pinned-canonical `max` (fspec-merge §UP KERNEL-10). No hash is computed here; identity + the log-level
// set-union are CONSUMED from the sealed log seam (`combine`), never re-rolled (KERNEL-9).

/**
 * Set-union of two event logs by event id — commutative, associative, idempotent (KERNEL-9/11). Reuses the
 * sealed `combine` seam: a shared id is deduped (first-write-wins), nothing is dropped or duplicated. This
 * is the log-level join `RefLog.merge`; the per-nodeKey resolution is `mergeNode` / `head` below.
 */
export function merge(a: EventLog, b: EventLog): EventLog {
  return combine(a, b)
}

/**
 * Grow-only per-nodeKey OR-Set union keyed by `contentHash` — commutative, 0 slot dropped (KERNEL-10a/10c,
 * fspec-merge §mergeNode). `|entries(mergeNode(x,y))| ≥ max(|x|,|y|)` and `x ⊑ mergeNode(x,y)`.
 *
 * Uses the SAME slot rule as `fold` (canonical representative + MAX-by-id winner), because `fold` is a
 * homomorphism from `(2^Event, ∪)` to `(AtlasState, mergeState)` (fspec-merge §UP KERNEL-11) — if the two
 * disagreed on a collided slot, `fold(merge(a,b))` and `mergeNode(fold a, fold b)` would diverge. The old
 * "a shared contentHash is a content-identical entry, so first-seen-wins is order-independent" comment was
 * the exact false premise: a shared `contentHash` with a different `fresh`/`seq` is NOT a content-identical
 * entry, and first-seen-wins made `mergeNode(x,y) ≠ mergeNode(y,x)` on precisely that input.
 */
export function mergeNode(x: Node, y: Node): Node {
  const entries = new Map<Event["contentHash"], Event>()
  for (const src of [x.entries, y.entries]) {
    for (const [h, e] of src) {
      const entry = canonicalEntry(e)
      const incumbent = entries.get(h)
      entries.set(h, incumbent === undefined ? entry : preferred(incumbent, entry))
    }
  }
  return { nodeKey: x.nodeKey, entries }
}

/** Whether entry `e` is archived by some other entry's supersedes-DAG within node `n` (fspec-merge:148). */
function supersededIn(e: Event, n: Node): boolean {
  for (const o of n.entries.values()) if (o.supersedes.includes(e.contentHash)) return true
  return false
}

/**
 * The forced single head = MAX-by-contentHash among the FRESH, non-superseded entries — `contentHash`
 * ALONE, never seq/clock/LLM (KERNEL-10b, fspec-merge §head; direction pinned-canonical `max`). Because no
 * seq/clock enters the selection, the head is invariant under any reseq/reclock. Returns `undefined` when
 * the node has no eligible (fresh, non-superseded) entry — no head is forced over an empty candidate set.
 */
export function head(n: Node): Event | undefined {
  let winner: Event | undefined
  for (const e of n.entries.values()) {
    if (!e.fresh || supersededIn(e, n)) continue
    if (winner === undefined || e.contentHash > winner.contentHash) winner = e
  }
  return winner
}

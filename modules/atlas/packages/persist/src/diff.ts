// @atlas/persist — src/diff.ts  (WP-7.32.PERSIST · EPIC-32 — atlas-diff version-delta, PERSIST-14)
//
// The version-delta = a DETERMINISTIC, READ-ONLY fold-diff over two store states → a total, disjoint
// {added, edited, superseded, decayed}, each carrying persist-local provenance (a provenance-less fact is
// never surfaced). Consumes the SEALED kernel fold/head/canonicalForm — 0 mutation, byte-identical.

import { canonicalForm, fold, head } from "@atlas/kernel"
import type { AtlasState, Event, EventLog, Node } from "@atlas/kernel"
import type { Hash, NodeKey } from "@atlas/contracts"
import type { VersionDelta, VersionDeltaEntry } from "./types.js"

/** The read-only fold-diff surface (PERSIST-14): `diff(shaA, shaB)` = a pure fold-comparison over two
 *  commit states → the total, disjoint {added, edited, superseded, decayed} partition. (atlas-persist:94) */
export interface DiffApi {
  diff(shaA: Hash, shaB: Hash): VersionDelta
}

/** Resolve a commit sha to its append-only event SET (read-only). The store wiring is the caller's; this
 *  facet only folds+partitions what the resolver yields — it opens/persists nothing. */
export type LogResolver = (sha: Hash) => EventLog

// ── provenance (persist-local) ──────────────────────────────────────────────────────────────────────

/** Recover a fact's persist-local provenance from the responsible event's opaque payload (`{ prov }`).
 *  Returns `undefined` when no provenance is recoverable — such a fact is never surfaced (PERSIST-14-c). */
function provOf(ev: Event): unknown {
  const p = ev.payload
  if (p !== null && typeof p === "object" && "prov" in p) {
    const prov = (p as { prov: unknown }).prov
    return prov === "" ? undefined : prov
  }
  return undefined
}

/** The B-side entry that archives `target` via the supersedes-DAG (the supersede/decay signal), if any. */
function supersederOf(nodeB: Node | undefined, target: Event): Event | undefined {
  if (nodeB === undefined) return undefined
  for (const o of nodeB.entries.values()) if (o.supersedes.includes(target.contentHash)) return o
  return undefined
}

// ── the read-only fold-diff over two folded AtlasStates ───────────────────────────────────────────────

/**
 * Set-partition two folded AtlasStates into {added, edited, superseded, decayed} by the PERSIST-5
 * lifecycle, keyed on the kernel `head` (the active, non-superseded fact per node):
 *   - added      — no head in A, a head in B.
 *   - decayed    — a head in A, no head in B (its active fact left the set via supersede/decay).
 *   - superseded — heads on both sides AND the A-head is archived by a B-side supersedes-DAG entry.
 *   - edited     — heads on both sides differ (re-grounding) with no supersedes link.
 * The A-head being contentHash-equal to the B-head is UNCHANGED (in 0 partitions). Provenance for a
 * supersede/decay is the archiving B-entry's `prov`; for an add/edit it is the new B-head's `prov`.
 * Entries are emitted in canonical `nodeKey` order, so each partition is deterministic across runs and
 * insertion orders (byte-identity + order-independence). Pure: reads both states, mutates neither.
 */
export function partition(a: AtlasState, b: AtlasState): VersionDelta {
  const added: VersionDeltaEntry[] = []
  const edited: VersionDeltaEntry[] = []
  const superseded: VersionDeltaEntry[] = []
  const decayed: VersionDeltaEntry[] = []

  const keys = [...new Set<NodeKey>([...a.keys(), ...b.keys()])].sort()
  for (const k of keys) {
    const nodeB = b.get(k)
    const headA = ((n) => (n ? head(n) : undefined))(a.get(k))
    const headB = nodeB ? head(nodeB) : undefined

    let bucket: VersionDeltaEntry[]
    let fact: Event
    let signal: Event
    if (headA === undefined) {
      if (headB === undefined) continue // no active fact either side — not a change
      bucket = added
      fact = headB
      signal = headB
    } else if (headB === undefined) {
      bucket = decayed
      fact = headA
      signal = supersederOf(nodeB, headA) ?? headA
    } else if (headA.contentHash === headB.contentHash) {
      continue // unchanged — in 0 partitions
    } else {
      const sup = supersederOf(nodeB, headA)
      if (sup !== undefined) {
        bucket = superseded
        fact = headA
        signal = sup
      } else {
        bucket = edited
        fact = headB
        signal = headB
      }
    }

    const provenance = provOf(signal)
    if (provenance === undefined) continue // provenance-less fact is never surfaced (PERSIST-14-c)
    bucket.push({ fact, provenance })
  }

  return { added, edited, superseded, decayed }
}

/** The read-only fold-diff over two event SETs: `partition(fold(logA), fold(logB))`. Reuses the SEALED
 *  kernel `fold` as the sole state oracle — order-independent by KERNEL-11. */
export function diffLogs(logA: EventLog, logB: EventLog): VersionDelta {
  return partition(fold(logA), fold(logB))
}

/** Wire a read-only `DiffApi` over a log resolver: `diff(shaA,shaB) = partition(fold(shaA),fold(shaB))`.
 *  It resolves-then-folds-then-partitions — a PURE READ, materializing/persisting nothing. */
export function createDiff(resolve: LogResolver): DiffApi {
  return { diff: (shaA: Hash, shaB: Hash): VersionDelta => diffLogs(resolve(shaA), resolve(shaB)) }
}

/** Deterministic canonical bytes of a `VersionDelta`, reached through the SEALED KERNEL-1 canonicalizer
 *  (sorted keys) — two runs (and two fold/event orderings) serialize byte-identically. */
export function serializeDelta(delta: VersionDelta): string {
  return new TextDecoder().decode(canonicalForm(delta))
}

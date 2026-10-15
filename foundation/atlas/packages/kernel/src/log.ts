// @atlas/kernel — src/log.ts  (the append-only, content-keyed event log — KERNEL-4 / KERNEL-7)
//
// `EventLog = Map<Hash, Event>` keyed by the event's own `id`. `append` is a set-insert by id:
// idempotent, STRICTLY append-only (never overwrite/remove ⇒ size monotone, KERNEL-4a/4b), returns a
// fresh immutable snapshot, and is TOTAL — a malformed event is a no-op rejection, never a throw (KERNEL-7).

import type { Hash } from "@atlas/contracts"
import type { Event, EventLog } from "./types.js"
import { id as objectId } from "./canonical.js"

/** The kernel log API (frozen): set-insert by event id, idempotent on equal id (atlas-kernel:101, 111). */
export interface LogApi {
  /** Set-insert by event id; idempotent on equal id. (atlas-kernel:101) */
  append(ev: Event): EventLog
}

/**
 * The `RefLog` reference model surface (frozen) — instance ops (fspec-merge:110-135). An OR-Set log = a
 * set of ids + a version map; grow-only, idempotent (KERNEL-9). Reused verbatim as the unit-test oracle.
 */
export interface RefLog {
  /** Set-insert; idempotent on equal id — re-append of equal bytes is a no-op. (fspec-merge:113-116) */
  append(e: Event): RefLog
  /** Relabel `seq` only — the KERNEL-9 seq-invariant oracle; id drops seq ⇒ keyset + fold unchanged.
   *  (fspec-merge:120-127) */
  reseq(relabel: (e: Event) => number): RefLog
  /** The version map's events. (fspec-merge:134) */
  events(): readonly Event[]
}

/**
 * The `RefLog` static ops (frozen, fspec-merge:117-119, 128-133). Split out because TypeScript instance
 * interfaces cannot declare `static` members; these are the constructor-side ops of the RefLog class.
 */
export interface RefLogStatics {
  /** Identity = content, `seq` EXCLUDED from the preimage (KERNEL-9, cf KERNEL-8). (fspec-merge:117-119) */
  id(e: Omit<Event, "id">): Hash
  /** Plain set-union; commutative / associative / idempotent (KERNEL-9/11). (fspec-merge:128-133) */
  merge(a: RefLog, b: RefLog): RefLog
}

/** Total structural guard — a malformed event is rejected (no-op), never allowed to throw downstream. */
function isEvent(ev: unknown): ev is Event {
  if (ev === null || typeof ev !== "object") return false
  const e = ev as Record<string, unknown>
  return (
    typeof e["id"] === "string" &&
    typeof e["seq"] === "number" &&
    Number.isFinite(e["seq"]) &&
    typeof e["contentHash"] === "string" &&
    typeof e["fresh"] === "boolean" &&
    Array.isArray(e["supersedes"])
  )
}

/** Construct the append-only event log — one insert-only backing set keyed by event id. */
export function createLog(): LogApi {
  const log = new Map<Event["id"], Event>()
  return {
    append(ev: Event): EventLog {
      // set-insert by id: only a well-formed, not-yet-present event is admitted (first-write-wins).
      if (isEvent(ev) && !log.has(ev.id)) {
        log.set(ev.id, ev)
      }
      // an immutable snapshot: prior returns never change, and a later append never mutates them.
      return new Map(log)
    },
  }
}

// ── KERNEL-9: content-addressed event identity, idempotent content-keyed set-union (WP-1.3-a) ──────────
//
// Identity is CONTENT, `seq` EXCLUDED (KERNEL-9a, fspec-merge §DOWN `RefLog.id`): an event's id =
// hash(canonicalForm(event)) reached ONLY through the sealed encoder seam (reuse `id` from canonical.ts —
// no digest is hand-rolled here). `seq` is a local ordering hint that lives OUTSIDE the algebra, so it is
// pinned to a constant in the preimage (⇒ any reseq leaves every id fixed), and the `id` field itself is
// dropped (a hash can never include itself). The mutable side-indexes are already excluded upstream by the
// canonicalizer (KERNEL-8). Collision/nodeKey head-resolution is EPIC-3-b (fold.ts) — deliberately NOT here.

/** Event identity = `hash(canonicalForm({ ...event, seq: 0 }))`: content-addressed, `seq` and `id` excluded
 *  from the preimage (KERNEL-9a). Reaches the digest only through the sealed encoder seam. */
export function eventId(e: Omit<Event, "id">): Hash {
  const { id: _drop, ...content } = e as Event // a hash never includes itself; seq pinned out below
  return objectId({ ...content, seq: 0 })
}

/** Content-keyed set-union of two logs on the event id — grow-only, idempotent, commutative & associative
 *  on the keyset (KERNEL-9c). A shared id is deduped (first-write-wins); nothing is dropped or duplicated.
 *  This is the LOG-level union; the per-nodeKey merge/head-resolution is WP-1.3-b, not here. */
export function combine(a: EventLog, b: EventLog): EventLog {
  const out = new Map(a)
  for (const [id, ev] of b) if (!out.has(id)) out.set(id, ev)
  return out
}

/** Relabel every event's `seq`, recomputing each id — the KERNEL-9d seq-invariant oracle. Because `id`
 *  drops `seq`, the recomputed ids are identical ⇒ the keyset and the fold are unchanged (`seq` is neither
 *  an object key nor a merge discriminator). */
export function reseq(log: EventLog, relabel: (e: Event) => number): EventLog {
  const out = new Map<Hash, Event>()
  for (const e of log.values()) {
    const { id: _drop, ...content } = e
    const relabelled = { ...content, seq: relabel(e) }
    const newId = eventId(relabelled)
    if (!out.has(newId)) out.set(newId, { ...relabelled, id: newId })
  }
  return out
}

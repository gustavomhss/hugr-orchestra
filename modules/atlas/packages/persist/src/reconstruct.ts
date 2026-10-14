// @atlas/persist — src/reconstruct.ts  (WP-1.2-b.PERSIST)
//
// Set-fold reconstruction over git history · never-delete archive / forget path · rebase-rewind
// reconciliation (REQ-PERSIST-2 / 5 / 12). Atlas state is the fold of the append-only event SET, so
// reconstruction depends on the SET, never on linear commit history or a mutable in-place snapshot; a
// rebase/cherry-pick (a permutation/re-parenting of the same set) leaves the folded state byte-identical,
// and a PR rewind is set-difference-then-refold. Memory/knowledge is never deleted — superseded/closed
// entries are archived (grow-only, deduped, retained, re-spawnable); forgetting removes from the ACTIVE
// projection only, the archive untouched.
//
// The fold/convergence/union semantics are CONSUMED from the SEALED @atlas/kernel seam (`fold`, `combine`,
// the OKF export/import, the KERNEL-1 `canonicalForm`) — NOT redefined here (card exclusion: fold semantics
// are owned by KERNEL WP-1.2-b + WP-1.3-b). This facet only assembles the git-native set and projects the
// result; no hash is computed outside the kernel seam, and no clock/network/LLM is read.

import { canonicalForm, combine, createLog, exportCas, fold, importCas } from "@atlas/kernel"
import type { AtlasState, Cas, Event, EventLog } from "@atlas/kernel"

// ── git-native set assembly ───────────────────────────────────────────────────────────────────────────
//
// "git history" is modelled as a collection of commits, each carrying a subset of the append-only event
// set. A commit's POSITION never affects the reconstruction: the events are unioned into one content-keyed
// set (deduped by id via the sealed kernel `combine`), then folded. Order- and parentage-independent.

/** One commit's payload: the events it carries. */
export type Commit = readonly Event[]
/** A (possibly non-linear) git history: a collection of commits in any order. */
export type History = readonly Commit[]

/** Lift a flat event list into a content-keyed set (`EventLog`), first-write-wins on a shared id. The
 *  set-union algebra itself is the kernel's — this is only the array→set adapter at the persist seam. */
function asSet(events: Iterable<Event>): EventLog {
  const out = new Map<Event["id"], Event>()
  for (const e of events) if (!out.has(e.id)) out.set(e.id, e)
  return out
}

/** Union a whole history's commits into ONE event set through the sealed kernel `combine` — the result
 *  depends only on the union of events, not on which commit (or in what order) carried them. */
export function collect(history: History): EventLog {
  let log: EventLog = new Map()
  for (const commit of history) log = combine(log, asSet(commit))
  return log
}

/** Reconstruct the `AtlasState` by folding the collected git-native set — no linear-history / snapshot
 *  dependence (the fold is over the SET). */
export function reconstruct(history: History): AtlasState {
  return fold(collect(history))
}

// ── replay-from-empty (export → import → replay → fold) ──────────────────────────────────────────────

/** Rebuild a FRESH append-only log from empty by replaying an event stream through the sealed kernel log
 *  (`createLog`), so nothing seeds from a prior mutable snapshot. */
export function replay(events: Iterable<Event>): EventLog {
  const log = createLog()
  let out: EventLog = new Map()
  for (const e of events) out = log.append(e)
  return out
}

// Keep event-log replay available to direct reconstruction consumers without colliding with the frozen
// package-level re-invoke surface, where `replay` means Checkpoint replay.
export { replay as replayEvents }

/** The portable-source reconstruction: export the set through the sealed OKF seam, import into a FRESH
 *  empty store, replay from empty, and fold — `fold(replay(export(S)))`. Byte-identical to `fold(S)`
 *  because the OKF round-trip is 1:1 and the fold is snapshot-free (REQ-PERSIST-2-a). */
export function replayFromExport(set: EventLog): AtlasState {
  const fresh = importCas(exportCas(set as unknown as Cas)) as unknown as EventLog
  return fold(replay(fresh.values()))
}

// ── canonical projection (byte-identity comparison) ─────────────────────────────────────────────────
//
// The reconstruction's byte-identity is asserted over the KERNEL-1 canonicalizer: the `AtlasState` `Map`
// is projected to a plain object (nodeKey → { nodeKey, entries: contentHash → Event }); `canonicalForm`
// then sorts every key, so equal CONTENT ⇒ byte-identical bytes regardless of `Map` insertion order. The
// projection is the only persist-local step; the serialization itself is the sealed kernel canonicalizer.

const UTF8 = new TextDecoder()

/** Deterministic canonical bytes of an `AtlasState`, reached through the sealed KERNEL-1 canonicalizer;
 *  insertion-order-independent (SCN-PERSIST-2b: "serialize (KERNEL-1 canonicalizer)"). */
export function serializeState(state: AtlasState): string {
  const projection: Record<string, unknown> = {}
  for (const [nodeKey, node] of state) {
    const entries: Record<string, unknown> = {}
    for (const [contentHash, ev] of node.entries) entries[contentHash] = ev
    projection[nodeKey] = { nodeKey, entries }
  }
  return UTF8.decode(canonicalForm(projection))
}

// ── rebase / rewind reconciliation (REQ-PERSIST-12) ─────────────────────────────────────────────────

/** Rewind a PR: set-difference (remove the PR's event subset from the reconstruction input) then RE-FOLD
 *  — `fold(S \ P)`. Order/parentage-independent; this re-projects the ACTIVE state and never touches the
 *  grow-only archive. (REQ-PERSIST-12-b) */
export function rewind(set: EventLog, remove: Iterable<Event>): AtlasState {
  const out = new Map(set)
  for (const e of remove) out.delete(e.id)
  return fold(out)
}

// ── never-delete archive / forget (REQ-PERSIST-5) ───────────────────────────────────────────────────
//
// A memory/knowledge entry is a content-addressed `Event`. The archive is a grow-only OR-Set (`EventLog`)
// unioned through the sealed kernel `combine`: it only ever grows, so `A ⊑ archive(A, e)` and re-running
// the union loses nothing (`merge(A, A) ≡ A`). Nothing dies — a delete is refused, superseded entries stay
// re-spawnable, and forgetting removes from the ACTIVE projection alone.

/** A memory/knowledge datum, content-addressed by its event id. */
export type Entry = Event
/** The grow-only archive — nothing dies. */
export type Archive = EventLog
/** The active/injected projection — the working set a `forget` prunes (the archive is separate). */
export type ActiveSet = EventLog

/** Grow-only archive insert via the sealed content-keyed union: `A ⊑ archive(A, e)` — never shrinks. */
export function archive(a: Archive, e: Entry): Archive {
  return combine(a, asSet([e]))
}

/** A delete is REFUSED — memory/knowledge is never removed. Returns the archive UNCHANGED (a no-op); there
 *  is no path here that removes an archive entry, so `A' ⊒ A` always holds. (REQ-PERSIST-5-a) */
export function del(a: Archive, _k: Entry): Archive {
  return a
}

/** Dedup-idempotent merge of two archives via the sealed union — a re-run loses nothing: `merge(A, A) ≡ A`
 *  (a shared id is deduped, first-write-wins; nothing dropped or duplicated). (REQ-PERSIST-5-b) */
export function mergeArchive(a: Archive, b: Archive): Archive {
  return combine(a, b)
}

/** Re-spawn an archived (superseded) entry back into the active set, reconstructed byte-identically — the
 *  archive stores the full entry, never a lossy digest. Absent ⇒ `null` (total). (REQ-PERSIST-5-c) */
export function respawn(a: Archive, k: Entry): Entry | null {
  return a.get(k.id) ?? null
}

/** Forget an entry from the ACTIVE/injected set ONLY — the grow-only archive is untouched (it remains
 *  retained and re-spawnable). "Nothing dies": forgetting is a projection prune, not a deletion of the
 *  datum. (REQ-PERSIST-5-d) */
export function forget(active: ActiveSet, k: Entry): ActiveSet {
  const out = new Map(active)
  out.delete(k.id)
  return out
}

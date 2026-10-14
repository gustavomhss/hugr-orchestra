// @atlas/persist — src/merge.ts  (git merge driver + self-install + on-disk append-only union — WP-1.3-b.PERSIST)
//
// PERSIST-11 is the git-integration CONSUMER of the SEALED `FSPEC-merge` core — it is NOT a second model
// (fspec-merge.md §PERSIST-11). Merging two branches never line-merges the log: a registered
// `merge=orchestra-atlas` driver unions the two event sets by content-hash and re-folds, colliding `seq` is
// never a conflict (it is outside the algebra), a shared `nodeKey` resolves by the deterministic KERNEL-10
// fold-merge (head = MAX-by-contentHash), and the merged Atlas is byte-identical regardless of direction
// (the KERNEL-11 commutativity law at the git seam). The driver is self-installing (on init/clone), and the
// on-disk form is an APPEND-ONLY, content-keyed JSONL union so a bypassed plain 3-way text merge on an
// un-configured clone degrades to a lossless dedup-by-id union that the next fold cleans up (KERNEL-12).
//
// Every algebra step is CONSUMED from the SEALED @atlas/kernel seam — `merge` (log set-union by id), `fold`
// (convergent reconstruction), `head` (max-by-contentHash), and the JSONL forms (`toJsonl`/`parseJsonl`/
// `lineMerge`). This facet only wires those into the git merge-driver shape; it defines NO fold/collision
// semantics and computes NO hash outside the kernel seam (card exclusion: the fold/head rule is owned by
// WP-1.3-b.KERNEL). No clock/network/LLM/mutable-cache is read in the merge path.

import { lineMerge, merge, parseJsonl, toJsonl } from "@atlas/kernel"
import type { Event, EventLog } from "@atlas/kernel"

/** The tracked atlas-log path the driver is attached to via `.gitattributes` (PERSIST-11-a/f). */
export const ATLAS_LOG_PATH = ".atlas/log.jsonl"
/** The git merge-driver name registered in `.git/config` and referenced from `.gitattributes`. */
export const MERGE_DRIVER_NAME = "orchestra-atlas"

/** Lift a flat event stream into a content-keyed set (`EventLog`), first-write-wins on a shared id. The
 *  set-union algebra itself is the kernel's — this is only the array→set adapter at the persist/git seam. */
function asLog(events: Iterable<Event>): EventLog {
  const out = new Map<Event["id"], Event>()
  for (const e of events) if (!out.has(e.id)) out.set(e.id, e)
  return out
}

/**
 * The 3-way merge-driver core: union the two event sets by content-hash and re-fold (REQ-PERSIST-11-b). The
 * union is the SEALED kernel `merge` (log-level set-union by event id) — commutative, associative,
 * idempotent, 0 dropped. A colliding positional `seq` is never a conflict because `seq` is outside the
 * algebra (REQ-PERSIST-11-c); a shared `nodeKey` is resolved downstream by the deterministic KERNEL-10
 * fold-merge (REQ-PERSIST-11-d), never by hand. `base` (the common ancestor of a 3-way merge) is folded into
 * the same union so no ancestor event is ever lost — union is idempotent, so an event already carried by
 * `ours`/`theirs` is a no-op. Direction-independent by construction (REQ-PERSIST-11-e): `merge` is
 * commutative on the keyset, so `mergeAtlas(a,b)` and `mergeAtlas(b,a)` fold to byte-identical AtlasState.
 */
export function mergeAtlas(ours: EventLog, theirs: EventLog, base?: EventLog): EventLog {
  const unioned = merge(ours, theirs)
  return base === undefined ? unioned : merge(unioned, base)
}

/**
 * The on-disk `merge=orchestra-atlas` driver body: parse the two (optionally three) JSONL branch logs,
 * union-fold via `mergeAtlas`, and re-serialize to the APPEND-ONLY content-keyed JSONL form (REQ-PERSIST-11-a).
 * Because every event is its own line and the union dedups by id, the driver never line-splices two events
 * into one corrupt line — one whole event per output line, id-union preserved, nothing dropped.
 */
export function mergeDriver(ours: string, theirs: string, base?: string): string {
  const merged = mergeAtlas(
    asLog(parseJsonl(ours)),
    asLog(parseJsonl(theirs)),
    base === undefined ? undefined : asLog(parseJsonl(base)),
  )
  return toJsonl(merged)
}

/**
 * Safe-degrade path (REQ-PERSIST-11-g): if the driver is BYPASSED on an un-configured clone, git's default
 * 3-way TEXT merge on the append-only JSONL log can only union/duplicate whole lines. Re-folding the
 * SEALED-kernel `lineMerge` (dedup-by-id union of the two branch texts) is byte-identical to the real
 * `mergeAtlas` fold — worst case a harmless duplicate line the fold dedups by id, 0 events lost or corrupted.
 */
export function degradeMerge(ours: string, theirs: string): EventLog {
  return asLog(lineMerge(ours, theirs))
}

/** The `.gitattributes` entry that attaches the driver to the atlas-log path (`<atlas-log> merge=<name>`). */
export function gitattributesEntry(): string {
  return `${ATLAS_LOG_PATH} merge=${MERGE_DRIVER_NAME}`
}

/** The `.git/config` merge-driver registration — the `merge.<name>.driver` key and its invocation. `%O`/`%A`/
 *  `%B` are git's base/ours/theirs placeholders the driver body consumes. */
export interface DriverRegistration {
  readonly key: string
  readonly value: string
}
export function mergeDriverRegistration(): DriverRegistration {
  return {
    key: `merge.${MERGE_DRIVER_NAME}.driver`,
    value: `${MERGE_DRIVER_NAME}-merge %O %A %B`,
  }
}

/** The self-install result: the `.gitattributes` entry + the `.git/config` driver registration a setup hook
 *  applies on init/clone (the driver lives in `.git/config`, which does not clone — REQ-PERSIST-11-f). */
export interface SetupResult {
  readonly gitattributes: string
  readonly config: DriverRegistration
}

/**
 * The setup hook (REQ-PERSIST-11-f): registers `merge.orchestra-atlas.driver` in `.git/config` AND writes
 * the `.gitattributes` entry — with no manual step — so a fresh clone re-registers the driver rather than
 * silently falling back to a text merge. Pure descriptor: the actual git wiring (residue integration) is the
 * caller's; this returns exactly what must be registered.
 */
export function setupHook(): SetupResult {
  return { gitattributes: gitattributesEntry(), config: mergeDriverRegistration() }
}

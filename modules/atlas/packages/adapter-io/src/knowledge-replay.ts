// @atlas/adapter-io — src/knowledge-replay.ts  (rebuild the local projection from the committed knowledge logs)
//
// A committed line is a CLAIM that some seat applied a row, never authority to apply it here: anyone with push
// access can write a line. So replay re-runs the one check a line cannot forge, and holds everything else:
//
//   applied  the fact's bytes carry `seal:'proven'`, its seat is in the row's scope (`actorInScope`), and it
//            RE-PROVES now against this checkout's index (`reproven`, the same oracle `atlas verify-store`
//            rides). One batched `commitProjection`, through the raw store, so a replayed row is not logged twice.
//   staged   every other line: a candidate in the staging sidecar (ADR-0008), held for ratify like any mined
//            candidate. There is no merged-PR check; the ratify door is where a person decides.
//   missing  the row's bytes are not under `.atlas/blobs/`, or they do not hash to the row's `contentHash`.
//
// A line is considered only when its row differs from the projection's row at that key (ignoring the store's `derivedAt` stamp), so a replay after a
// replay does nothing. Known limit: a staged candidate that ratify rejected is staged again on a later boot,
// because nothing records the rejection in the logs yet.

import { readFileSync } from "node:fs"
import type { Hash } from "@atlas/contracts"
import type { CasObject } from "@atlas/kernel"
import type { CurrentNode, GroundedFact, StoreProjection } from "@atlas/knowledge"
import { blobPath } from "./layout.js"
import { knowledgeRegresses, readKnowledge } from "./knowledge-log.js"
import type { KnowledgeEntry } from "./knowledge-log.js"
import { actorInScope } from "./policy.js"
import type { AtlasPolicy } from "./policy.js"
import type { CommitRefusal } from "./sidecar.js"
import type { DiskStore } from "./store.js"
import { rehydrateProjection } from "./store.js"

export interface KnowledgeReplay {
  readonly applied: number
  readonly staged: number
  readonly missing: number
  /** Log lines that did not verify (torn, edited, or under another seat's folder). */
  readonly rejected: number
  /** A knowledge folder or file could not be read, so some rows may not have been replayed. */
  readonly unreadable?: true
  readonly refusal?: CommitRefusal
}

export function replayKnowledge(
  repoPath: string,
  disk: DiskStore,
  policy: AtlasPolicy,
  reproven: (node: CurrentNode, fact: GroundedFact) => boolean,
): KnowledgeReplay {
  const read = readKnowledge(repoPath)
  const projection = rehydrateProjection(disk)
  const pending = [...read.rows.values()].filter((entry) => {
    const held = projection.current.get(entry.row.nodeKey)
    if (sameRow(held, entry.row)) return false
    return held === undefined || !knowledgeRegresses(held, entry.row, read.lines)
  })
  const resolved = pending.flatMap((entry) => {
    const fact = restoreBlob(repoPath, disk, entry)
    // Capture the validated read, so absence cannot fall through into either proven or staging candidates.
    return fact === undefined ? [] : [{ entry, fact: fact as GroundedFact }]
  })
  const proven = resolved.filter(
    (item) =>
      item.fact.seal === "proven" &&
      actorInScope(policy, item.entry.seat, item.entry.row.scope) &&
      boundToFact(item.entry.row, item.fact) &&
      reproven(item.entry.row, item.fact),
  )
  const candidates = resolved.filter((item) => !proven.includes(item))
  const applied =
    proven.length === 0
      ? undefined
      : disk.commitProjection((p) => ({
          out: proven.length,
          next: withRows(
            p,
            proven.map((item) => item.entry),
          ),
        }))
  const staged =
    candidates.length === 0
      ? undefined
      : disk.commitStaging((p) => {
          const fresh = candidates.filter(
            (item) => p.current.get(item.entry.row.nodeKey)?.contentHash !== item.entry.row.contentHash,
          )
          return fresh.length === 0
            ? { out: 0 }
            : {
                out: fresh.length,
                next: withRows(
                  p,
                  fresh.map((item) => item.entry),
                ),
              }
        })
  const refusal = [applied, staged].flatMap((r) => (r !== undefined && !r.settled ? [r.refusal] : []))[0]
  const counts = {
    applied: applied?.settled === true ? applied.out : 0,
    staged: staged?.settled === true ? staged.out : 0,
    missing: pending.length - resolved.length,
    rejected: read.rejected,
    ...(read.unreadable === true ? { unreadable: true as const } : {}),
  }
  const result = refusal === undefined ? counts : { ...counts, refusal }
  // Stderr only, so a command's stdout stays its answer; silent when nothing happened.
  if (
    counts.applied + counts.staged + counts.missing + counts.rejected > 0 ||
    read.unreadable === true ||
    refusal !== undefined
  )
    console.error(`atlas: knowledge replay ${JSON.stringify(result)}`)
  return result
}

/** Restore the row's bytes and return the actual guarded read, not merely the handle a put returned. */
function restoreBlob(repoPath: string, disk: DiskStore, entry: KnowledgeEntry): CasObject | undefined {
  const hash = entry.row.contentHash as Hash
  const existing = disk.get(hash)
  if (existing !== undefined) return existing
  try {
    if (disk.put(JSON.parse(readFileSync(blobPath(repoPath, hash), "utf8")) as CasObject) !== hash) return undefined
    return disk.get(hash)
  } catch {
    return undefined
  }
}

/**
 * The store stamps `derivedAt` on a row it publishes (`freshness-watermark.ts`), after the log took the row from the
 * decision, so the clone that wrote a row holds it with a stamp its own log line lacks. That row is already here.
 */
function sameRow(held: CurrentNode | undefined, logged: CurrentNode): boolean {
  if (held === undefined) return false
  const { derivedAt: _held, ...heldRest } = held
  const { derivedAt: _logged, ...loggedRest } = logged
  return JSON.stringify(heldRest) === JSON.stringify(loggedRest)
}

// Imported row restriction; canonical-family compatibility remains under audit.
function boundToFact(row: CurrentNode, fact: GroundedFact) {
  if (!Array.isArray(row.claims)) return false
  if (typeof fact.id !== "string" || row.nodeKey !== fact.id) return false
  const sentence = "claimNorm" in fact && typeof fact.claimNorm === "string" ? fact.claimNorm : undefined
  return row.claims.every((claim) => claim === sentence)
}

const withRows = (p: StoreProjection, entries: readonly KnowledgeEntry[]): StoreProjection => ({
  ...p,
  current: new Map([...p.current, ...entries.map((e) => [e.row.nodeKey, e.row] as const)]),
  cas: new Set([...p.cas, ...entries.map((e) => e.row.contentHash)]),
})

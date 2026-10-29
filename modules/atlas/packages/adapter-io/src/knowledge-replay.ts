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
import { readKnowledge } from "./knowledge-log.js"
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
  const pending = [...read.rows.values()].filter(
    (e) => !sameRow(projection.current.get(e.row.nodeKey), e.row),
  )
  const resolved = pending.filter((e) => restoreBlob(repoPath, disk, e))
  const proven = resolved.filter((e) => {
    const fact = disk.get(e.row.contentHash as Hash) as GroundedFact
    return fact.seal === "proven" && actorInScope(policy, e.seat, e.row.scope) && reproven(e.row, fact)
  })
  const candidates = resolved.filter((e) => !proven.includes(e))
  const applied = proven.length === 0 ? undefined : disk.commitProjection((p) => ({ out: proven.length, next: withRows(p, proven) }))
  const staged =
    candidates.length === 0
      ? undefined
      : disk.commitStaging((p) => {
          const fresh = candidates.filter((e) => p.current.get(e.row.nodeKey)?.contentHash !== e.row.contentHash)
          return fresh.length === 0 ? { out: 0 } : { out: fresh.length, next: withRows(p, fresh) }
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
  if (counts.applied + counts.staged + counts.missing + counts.rejected > 0 || read.unreadable === true || refusal !== undefined)
    console.error(`atlas: knowledge replay ${JSON.stringify(result)}`)
  return result
}

/** Put the row's committed bytes into the local CAS. False when they are absent or name another hash. */
function restoreBlob(repoPath: string, disk: DiskStore, entry: KnowledgeEntry): boolean {
  const hash = entry.row.contentHash as Hash
  if (disk.get(hash) !== undefined) return true
  try {
    return disk.put(JSON.parse(readFileSync(blobPath(repoPath, hash), "utf8")) as CasObject) === hash
  } catch {
    return false
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

const withRows = (p: StoreProjection, entries: readonly KnowledgeEntry[]): StoreProjection => ({
  ...p,
  current: new Map([...p.current, ...entries.map((e) => [e.row.nodeKey, e.row] as const)]),
  cas: new Set([...p.cas, ...entries.map((e) => e.row.contentHash)]),
})

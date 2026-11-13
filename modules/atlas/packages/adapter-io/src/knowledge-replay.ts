// @atlas/adapter-io — src/knowledge-replay.ts  (rebuild the local projection from the committed knowledge logs)
//
// A committed line is a CLAIM that some seat applied a row, never authority to apply it here: anyone with push
// access can write a line. So replay re-runs the one check a line cannot forge, and holds everything else:
//
//   applied  the complete row binds to its proven fact and independently re-proven claim support; each seat
//            is authorized against the fact's validated scope and anchor. Reproof uses this checkout's index
//            (`reproven`, the same oracle `atlas verify-store` rides). One raw `commitProjection`, never re-logged.
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
import { describeReplayFact, validReplayRow, sameReplayRow, bindReplayRow } from "./knowledge-replay-binding.js"
import type { ReplayFact } from "./knowledge-replay-binding.js"
import { actorInScope, scopeOwnsAnchor } from "./policy.js"
import type { AtlasPolicy } from "./policy.js"
import type { CommitRefusal } from "./sidecar.js"
import type { DiskStore } from "./store.js"
import { rehydrateProjection } from "./store.js"

export interface KnowledgeReplay {
  readonly applied: number
  readonly staged: number
  readonly missing: number
  /** Log lines that did not verify, including structurally malformed accepted rows. */
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
  // Folded winners are references to accepted lines. Validate both surfaces once, without falling back to an
  // older valid generation when its winning row is malformed.
  const accepted = [...new Set([...read.lines, ...read.rows.values()])]
  const valid = new Set(accepted.filter((entry) => validReplayRow(entry.row)))
  const history = read.lines.filter((entry) => valid.has(entry))
  const projection = rehydrateProjection(disk)
  const pending = [...read.rows.values()].filter((entry) => {
    if (!valid.has(entry)) return false
    const held = projection.current.get(entry.row.nodeKey)
    // Exact local preservation is not new activation or certification of previously held assertions.
    if (sameReplayRow(held, entry.row)) return false
    return held === undefined || !knowledgeRegresses(held, entry.row, history)
  })
  const restored = new Map<string, CasObject | undefined>()
  const descriptions = new Map<string, ReplayFact | undefined>()
  const proofs = new Map<string, boolean>()
  const restore = (entry: KnowledgeEntry) => {
    if (!restored.has(entry.row.contentHash)) restored.set(entry.row.contentHash, restoreBlob(repoPath, disk, entry))
    return restored.get(entry.row.contentHash)
  }
  const describe = (entry: KnowledgeEntry, fact: CasObject) => {
    if (!descriptions.has(entry.row.contentHash))
      descriptions.set(entry.row.contentHash, describeReplayFact(fact, entry.row.contentHash))
    return descriptions.get(entry.row.contentHash)
  }
  const verify = (entry: KnowledgeEntry, description: ReplayFact) => {
    if (!actorInScope(policy, entry.seat, description.scope) ||
      !scopeOwnsAnchor(policy, description.scope, description.anchor)) return false
    if (!proofs.has(description.row.contentHash))
      proofs.set(description.row.contentHash, reproven(description.row, description.fact))
    return proofs.get(description.row.contentHash) === true
  }
  const resolved = pending.flatMap((entry) => {
    const fact = restore(entry)
    // Capture the guarded read. Missing historical support never contributes to this current-body count.
    return fact === undefined ? [] : [{ entry, fact }]
  })
  const proven = resolved.filter((item) => {
    const current = describe(item.entry, item.fact)
    if (current === undefined || !verify(item.entry, current)) return false
    const support = new Map<string, readonly ReplayFact[]>([[current.claim, [current]]])
    if (bindReplayRow(item.entry.row, current, support)) return true
    if (!item.entry.row.claims.some((claim) => claim !== current.claim) &&
      item.entry.row.provenanceByClaim === undefined) return false
    const claims = new Set(item.entry.row.claims)
    // A supporting fact proves only its own canonical claim. Its historical row is never recursively activated,
    // and copied claims cannot turn another fact into evidence for a statement that fact did not make.
    history.forEach((entry) => {
      if (entry.row.nodeKey !== current.row.nodeKey || entry.row.scope !== current.scope || entry.row.tier !== "T2") return
      if (!entry.row.claims.some((claim) => claims.has(claim))) return
      const fact = restore(entry)
      if (fact === undefined) return
      const description = describe(entry, fact)
      if (description === undefined || description.row.nodeKey !== entry.row.nodeKey ||
        description.row.contentHash !== entry.row.contentHash || description.scope !== entry.row.scope ||
        description.row.tier !== entry.row.tier || !claims.has(description.claim) ||
        !entry.row.claims.includes(description.claim) || !verify(entry, description)) return
      support.set(description.claim, [...(support.get(description.claim) ?? []), description])
    })
    return bindReplayRow(item.entry.row, current, support)
  })
  const candidates = resolved.filter((item) => !proven.includes(item))
  const applied =
    proven.length === 0
      ? undefined
      : disk.commitProjection((p) => ({
          out: proven.length,
          next: withRows(
            p,
            proven.map((item) => {
              const { derivedAt: _incoming, ...row } = item.entry.row
              return { ...item.entry, row }
            }),
          ),
        }))
  const staged =
    candidates.length === 0
      ? undefined
      : disk.commitStaging((p) => {
          const fresh = candidates.filter(
            (item) => !sameReplayRow(p.current.get(item.entry.row.nodeKey), item.entry.row),
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
    rejected: read.rejected + accepted.length - valid.size,
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

const withRows = (p: StoreProjection, entries: readonly KnowledgeEntry[]): StoreProjection => ({
  ...p,
  current: new Map([...p.current, ...entries.map((e) => [e.row.nodeKey, e.row] as const)]),
  cas: new Set([...p.cas, ...entries.map((e) => e.row.contentHash)]),
})

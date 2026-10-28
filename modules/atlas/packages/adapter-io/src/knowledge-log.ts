// @atlas/adapter-io — src/knowledge-log.ts  (the committed knowledge logs, `.atlas/members/<seat>/knowledge/`)
//
// The projection sidecar and the CAS stay local and untracked (`store-provenance.ts`): a committed projection would
// be a store that arrived by commit, not through a door. What travels instead is the OUTCOME of each door: one line
// per projection row a settled commit produced or changed, appended by the seat that wrote it, plus a copy of the CAS
// object the row names under `.atlas/blobs/`. A fresh clone rebuilds its projection from these lines by replay
// (`knowledge-replay.ts`), under the trust rule there, never by copying them in.
//
// Every line is a kernel `Event` (`durable-log.ts`) whose `id` is `eventId` of the rest, so a torn or edited line is
// counted, never folded. `at` is in the payload, so the same row written twice at different times is two lines; the
// fold keeps, per `nodeKey`, the latest by `(at, contentHash)`, never by `seq` or by file order, which differ across
// branches. A line under `members/<seat>/` whose payload names another seat is rejected: a seat appends only to its
// own folder, so a line elsewhere was moved or forged.
//
// Only rows that a commit PRODUCED are logged. A row a commit removes from the projection is not, so replay cannot
// remove it either; no door removes a row today (a retraction is a row change, which is logged).

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { eventId } from "@atlas/kernel"
import type { Event } from "@atlas/kernel"
import type { CurrentNode, StoreProjection } from "@atlas/knowledge"
import type { Hash } from "@atlas/contracts"
import { createDurableLog, jsonlFiles, readDurableLogs } from "./durable-log.js"
import { blobPath, knowledgeShardPath, membersDir, segment } from "./layout.js"
import type { DiskStore } from "./store.js"

/** Where an applied row came from: the card and attempt that ran the door, or the one-shot migration. */
export type KnowledgeSource =
  | { readonly card?: string; readonly attempt?: string; readonly commit?: string }
  | { readonly migrated: true }

/** One logged outcome: which seat applied which row, when (ISO-8601 UTC), and from where. */
export interface KnowledgeEntry {
  readonly seat: string
  readonly row: CurrentNode
  readonly at: string
  readonly source: KnowledgeSource
}

/** Every seat's log folded to the latest entry per `nodeKey`. `rejected` counts lines that did not verify. */
export interface KnowledgeRead {
  readonly rows: ReadonlyMap<string, KnowledgeEntry>
  readonly rejected: number
  readonly unreadable?: true
}

/** Append one applied row to its seat's shard, and copy the row's CAS object once. `blob` is that object. */
export function appendKnowledge(repoPath: string, entry: KnowledgeEntry, blob: unknown): void {
  const event: Omit<Event, "id"> = {
    seq: 0,
    nodeKey: entry.row.nodeKey as Event["nodeKey"],
    contentHash: entry.row.contentHash as Hash,
    fresh: true,
    supersedes: [],
    payload: entry,
  }
  createDurableLog(knowledgeShardPath(repoPath, entry.seat, entry.row.nodeKey)).append({ ...event, id: eventId(event) })
  const path = blobPath(repoPath, entry.row.contentHash)
  if (blob === undefined || existsSync(path)) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(blob))
}

export function readKnowledge(repoPath: string): KnowledgeRead {
  const seats = seatDirs(membersDir(repoPath))
  const reads = seats.dirs.map((dir) => {
    const files = jsonlFiles(join(membersDir(repoPath), dir, "knowledge"))
    const read = readDurableLogs(files.paths)
    const events = [...read.log.values()]
    const entries = events.flatMap((ev) => {
      const entry = ev.payload
      return isEntry(entry) && segment(entry.seat) === dir && entry.row.nodeKey === ev.nodeKey ? [entry] : []
    })
    return { entries, rejected: read.rejected + events.length - entries.length, unreadable: files.unreadable ?? read.unreadable }
  })
  const rows = new Map<string, KnowledgeEntry>()
  reads.flatMap((r) => r.entries).forEach((entry) => {
    const prior = rows.get(entry.row.nodeKey)
    if (prior === undefined || later(entry, prior)) rows.set(entry.row.nodeKey, entry)
  })
  const rejected = reads.reduce((n, r) => n + r.rejected, 0)
  return seats.unreadable === true || reads.some((r) => r.unreadable === true) ? { rows, rejected, unreadable: true } : { rows, rejected }
}

/**
 * The same store with every settled `commitProjection` logged for `seat`. `decide` may run several times on a race;
 * only the run whose decision was published is diffed, which is the last one. Staging is not logged: a candidate is
 * not an outcome until a door applies it.
 */
export function withKnowledgeLog(
  store: DiskStore,
  opts: { readonly repoPath: string; readonly seat: string; readonly source?: KnowledgeSource; readonly now?: () => string },
): DiskStore {
  // The card and attempt come from the host, through `ATLAS_CARD` and `ATLAS_ATTEMPT`, unless the caller names them.
  const source = opts.source ?? {
    ...(process.env.ATLAS_CARD === undefined ? {} : { card: process.env.ATLAS_CARD }),
    ...(process.env.ATLAS_ATTEMPT === undefined ? {} : { attempt: process.env.ATLAS_ATTEMPT }),
  }
  return {
    ...store,
    commitProjection(decide) {
      const seen: { before?: StoreProjection; next?: StoreProjection } = {}
      const result = store.commitProjection((projection) => {
        const decision = decide(projection)
        seen.before = projection
        seen.next = decision.next
        return decision
      })
      if (!result.settled || seen.before === undefined || seen.next === undefined) return result
      const before = seen.before
      const at = (opts.now ?? (() => new Date().toISOString()))()
      ;[...seen.next.current.values()]
        .filter((row) => JSON.stringify(before.current.get(row.nodeKey)) !== JSON.stringify(row))
        .forEach((row) =>
          appendKnowledge(opts.repoPath, { seat: opts.seat, row, at, source }, store.get(row.contentHash as Hash)),
        )
      return result
    },
  }
}

const later = (a: KnowledgeEntry, b: KnowledgeEntry): boolean =>
  a.at !== b.at ? a.at > b.at : a.row.contentHash > b.row.contentHash

function seatDirs(dir: string): { readonly dirs: readonly string[]; readonly unreadable?: true } {
  try {
    return {
      dirs: readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort(),
    }
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code === "ENOENT") return { dirs: [] }
    return { dirs: [], unreadable: true }
  }
}

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0

function isEntry(v: unknown): v is KnowledgeEntry {
  if (v === null || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  const row = o.row as Partial<CurrentNode> | null | undefined
  if (typeof o.seat !== "string" || !isText(o.at) || o.source === null || typeof o.source !== "object") return false
  return row !== null && typeof row === "object" && isText(row.nodeKey) && isText(row.contentHash)
}

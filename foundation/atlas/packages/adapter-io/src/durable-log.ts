// @atlas/adapter-io — src/durable-log.ts  (the APPEND-ONLY, content-keyed JSONL log primitive)
//
// One file, one record per line, each line's `id` its own content hash (KERNEL-12b/12c). Reading is parse
// then fold; writing is a single `O_APPEND` write. Nothing is ever rewritten, moved, or truncated.
//
// EXTRACTED FROM `memory-store.ts` WHEN THE SECOND CALLER ARRIVED, not before. CAMPAIGN-11 W2 built this
// shape for `.atlas/memory.jsonl`; W3 needs the same durability for the Orientation event log, whose
// payload is a derived-channel label rather than a memory record. Copying the module would have duplicated
// the torn-line defence and the travel argument into two places that must stay identical, which is how two
// files drift into disagreeing about what a corrupt line means.
//
// ── WHY APPEND-ONLY, AND NOT THE KNOWLEDGE SIDECAR PROTOCOL ──────────────────────────────────────────────
// `sidecar.ts` exists because the knowledge projection is the ONE MUTABLE CELL in the product: every
// governed write is a read-modify-WHOLE-FILE-write, which is why it needed a `link(2)` compare-and-swap and
// a whole-decision retry, and why its lost-update leg measured 1-5 nodes lost per 8 concurrent writers.
// Neither caller here has such a cell — both are insert-only, grow-only, first-write-wins by content id —
// and an append-only log has no lost update to lose. Two writers appending two lines produce both lines
// under any interleaving, with no snapshot read in between.
//
// ── THE CONCURRENCY CLAIM, AND ITS HONEST BOUND ──────────────────────────────────────────────────────────
// A record is appended by ONE `writeFileSync(path, line, { flag: 'a' })` — a single `write(2)` on a fd
// opened `O_APPEND`, where the seek-to-end and the write are atomic with respect to other writers. That is
// what makes two concurrent appends safe WITHOUT a lock. The bound, stated rather than left to be found:
// atomicity of a single append is guaranteed by POSIX for a local filesystem; it is NOT guaranteed for an
// arbitrarily large write over NFS, and a `logbook` entry is prose and can be large.
//
// So the reader does not TRUST the bound, it CHECKS it. Every line self-verifies: the line's stored `id` is
// its own content hash, so a torn or interleaved line either fails to parse or fails `isContentKeyed`, and
// is detectable rather than silently served. A rejected line is COUNTED and named in the read result —
// never dropped in silence, which is the failure the knowledge sidecar's leg 2 was ("the file looked
// corrupt" and "there is no knowledge" were the SAME VALUE). A torn append is thus visible data loss with a
// count, not invisible data loss with an exit code of 0.
//
// ── TRAVEL ───────────────────────────────────────────────────────────────────────────────────────────────
// Both logs are git-tracked (`.gitignore` re-includes them under the `.atlas/*` deny-by-default rule) and
// the JSONL form is what makes a plain git text merge SAFE: whole lines union or duplicate and can never
// splice two records together, and a duplicate is deduped by content id on the fold. That is KERNEL-12b's
// safe-degrade line merge, and it is why a fork inherits the whole log with 0 records lost.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname } from "node:path"
import { combine, createLog, isContentKeyed } from "@atlas/kernel"
import type { Event, EventLog } from "@atlas/kernel"

/**
 * What a read found. `rejected` is the load-bearing field: a line that failed to parse or failed its own
 * content-key check is counted here, so a caller can surface partial data as PARTIAL rather than as all
 * there is.
 */
export interface LogRead {
  readonly log: EventLog
  /** Lines that did not parse, or whose stored `id` is not their content hash. Never silently discarded. */
  readonly rejected: number
}

/**
 * The self-verification predicate a log holds every line to. It exists as a PARAMETER because the two
 * callers key their events differently, and pretending otherwise would have meant either a silently weaker
 * check or surgery on a frozen module.
 *
 * `@atlas/memory`'s `toEvent` sets `id = eventId(content)` — the hash of the whole event — so the memory log
 * uses `isContentKeyed` and a tampered `nodeKey`, `supersedes` or `fresh` is caught along with the payload.
 * `orientEvent` sets `id = contentHash = id(payload)`, and its supersedes-DAG chains on `contentHash`, so
 * re-keying it on `eventId` would silently break lineage: `predecessorLabel` resolves `supersedes` hashes
 * against the log's own keys. That convention is frozen behind goldens and held-out tests, so it is
 * ACCOMMODATED here rather than changed mid-campaign.
 *
 * The cost is stated, not glossed: a payload-keyed log detects a torn line and an edited PAYLOAD, and does
 * NOT detect an edit to an event's `nodeKey`, `supersedes` or `fresh` that leaves the payload intact. That
 * is a narrower guarantee than the memory log's, it is the difference between the two conventions rather
 * than a defect in this file, and closing it means re-keying `orientEvent` on `eventId` and moving its
 * lineage onto `id` — a change to a frozen surface, tracked as its own work, not smuggled into a store.
 */
export type LineKeyed = (event: Event) => boolean

/** The primitive's surface. Deliberately two verbs: the log is appended and folded, never mutated. */
export interface DurableLog {
  readonly path: string
  /** Fold the tracked file into an event log. Total — a missing file is an empty log, not an error. */
  read(): LogRead
  /** Append one content-keyed event. Idempotent by content id: the same event twice folds to one. */
  append(event: Event): void
}

/**
 * Parse one line, TOTALLY. Returns `undefined` for anything that is not a content-keyed event — a torn
 * append, a partial line, a hand-edited row. `JSON.parse` throws, so the catch is what makes this total;
 * without it one bad byte would make a whole log unreadable, which is the amplification the knowledge
 * sidecar was rewritten to end.
 */
function parseLine(line: string, keyed: LineKeyed): Event | undefined {
  const trimmed = line.trim()
  if (trimmed.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== "object") return undefined
  const ev = parsed as Event
  // The self-verification. A line whose id is not its own content hash was not written by this door — it
  // was torn, spliced, or edited — and is refused rather than folded in as a record.
  if (typeof ev.id !== "string" || !keyed(ev)) return undefined
  return ev
}

export function createDurableLog(path: string, keyed: LineKeyed = isContentKeyed): DurableLog {
  function read(): LogRead {
    if (!existsSync(path)) return { log: new Map(), rejected: 0 }
    let text: string
    try {
      text = readFileSync(path, "utf8")
    } catch {
      // An unreadable file is NOT an empty log. Reporting it as one is precisely how the knowledge sidecar
      // turned a torn read into a total loss, so the whole file counts as one rejection and the caller sees
      // a non-zero count against an empty log.
      return { log: new Map(), rejected: 1 }
    }
    const appender = createLog()
    let snapshot: EventLog = new Map()
    let rejected = 0
    for (const line of text.split("\n")) {
      if (line.trim().length === 0) continue
      const ev = parseLine(line, keyed)
      if (ev === undefined) {
        rejected += 1
        continue
      }
      // `combine` is the content-keyed set-union (KERNEL-9): a duplicated line — which a git line-merge can
      // legitimately produce — folds to one record, first-seen-wins.
      snapshot = combine(snapshot, appender.append(ev))
    }
    return { log: snapshot, rejected }
  }

  function append(event: Event): void {
    if (!keyed(event)) {
      // A line that is not content-keyed would be rejected by this module's own reader, so writing one
      // would mean writing data that can never be read back — a silent black hole with an exit code of 0.
      // Writing a line this log's own reader would reject means writing data that can never be read back
      // — a silent black hole with an exit code of 0.
      throw new Error("durable-log: refusing to append a line its own reader would reject (KERNEL-12c)")
    }
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify(event)}\n`, { flag: "a" })
  }

  return { path, read, append }
}

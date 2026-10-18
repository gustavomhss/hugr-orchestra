// @atlas/kernel — src/jsonl.ts  (content-keyed JSONL log form + safe-degrade line-merge — KERNEL-12b/12c)
//
// APPEND-ONLY, one content-keyed JSON event per line (KERNEL-12c) ⇒ a git text merge can only union/
// duplicate whole lines, never splice two events. INVARIANT: `lineMerge` degrades to a lossless
// dedup-by-id union whose re-fold equals `RefLog.merge` (KERNEL-12b); identity via `eventId`, never re-rolled.

import type { Hash } from "@atlas/contracts"
import type { Event, EventLog } from "./types.js"
import { eventId } from "./log.js"

/**
 * Serialize an event log to the append-only JSONL form: one JSON event per line, in append order. Because
 * every event is its own line, a downstream git text merge unions/duplicates lines but can never splice two
 * events together (KERNEL-12c).
 */
export function toJsonl(log: EventLog): string {
  return [...log.values()].map((e) => JSON.stringify(e)).join("\n")
}

/** Parse the JSONL log form back to events (blank lines skipped) — one event per non-empty line. Total. */
export function parseJsonl(text: string): Event[] {
  const out: Event[] = []
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    out.push(JSON.parse(trimmed) as Event)
  }
  return out
}

/**
 * The content-keyed predicate for one line: its stored `id` IS the content hash (with `seq` excluded), so a
 * git line-merge can dedup by id (KERNEL-12c). Holds iff `eventId(parse(L)) === parse(L).id` — a line keyed
 * by an appended counter / `seq` instead of content fails this.
 */
export function isContentKeyed(e: Event): boolean {
  return eventId(e) === e.id
}

/**
 * Safe-degrade line-merge: the union of two branch JSONL logs deduped by event id — exactly what a plain git
 * text/line merge (driver bypassed) yields once the fold dedups (KERNEL-12b). No event's bytes are spliced
 * into another because each event is a whole line; a shared line is deduped by id (first-seen-wins), so
 * `re-fold(lineMerge(a,b)) ≡ fold(RefLog.merge(a,b))` with 0 events lost.
 */
export function lineMerge(ours: string, theirs: string): Event[] {
  const byId = new Map<Hash, Event>()
  for (const e of [...parseJsonl(ours), ...parseJsonl(theirs)]) {
    if (!byId.has(e.id)) byId.set(e.id, e)
  }
  return [...byId.values()]
}

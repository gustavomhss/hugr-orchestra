// @atlas/adapter-io — src/record-log.ts  (what the host writes in a bundle's record commit)
//
// The merge queue lands each bundle with one record commit (merge-queue spec §4.7, repo-layout design §4): the
// members' attempt files, the board records since the previous bundle, one logbook entry and one Orientation
// milestone per member. This module is the writer set for it, and the `@orchestra/atlas-boundary/record-log` entry the
// host imports; the card and attempt writers live in `card-log.ts` and are re-exported here.
//
// A public repository travels redacted (design §6): the caller decides `redact` from `repoVisibility`, and every writer
// here keeps ids, links, timings and hashes but drops free text when it is set. The milestone writer builds its label
// from ids, so it has no free text to drop.

import { eventId, id } from "@atlas/kernel"
import type { Event } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import { LOGBOOK_AUTHOR, LOGBOOK_SECTIONS, validateLogbookEntry } from "@atlas/memory"
import type { LogbookEntry, LogbookVerdict } from "@atlas/memory"
import { createDurableLog } from "./durable-log.js"
import { projectLogPath } from "./layout.js"
import { createDurableMemory } from "./memory-store.js"
import { createDurableOrientation } from "./orientation-store.js"

export { appendAttempt, appendCardEvent, attemptNumbers, readAttempt, readCard } from "./card-log.js"
export type { AttemptEntry, AttemptRead, CardEvent, CardEventInput, CardRead, ThreadKind } from "./card-log.js"
export { repoVisibility } from "./repo-visibility.js"
export type { GetJson, Visibility } from "./repo-visibility.js"

/**
 * One board write as the host offers it: the `board_activity` row. `before` and `after` hold structure only (ids,
 * columns, order, titles); any free text (a reason, a note body, a question) goes in `text`, so a public repository
 * can drop it. `at` is ISO-8601 UTC.
 */
export interface BoardEventInput {
  readonly activity: string
  readonly project: string
  readonly issue?: string
  readonly actor: string
  readonly action: string
  readonly at: string
  readonly before?: Readonly<Record<string, unknown>>
  readonly after?: Readonly<Record<string, unknown>>
  readonly undoes?: string
  readonly text?: Readonly<Record<string, string>>
}

/** One board write as committed: `text` only on a private repository, its hash always. */
export type BoardEvent = Omit<BoardEventInput, "text"> & { readonly text?: Readonly<Record<string, string>>; readonly textHash?: Hash }

export interface BoardRead {
  readonly events: readonly BoardEvent[]
  readonly rejected: number
}

export const boardLogPath = (repoPath: string): string => projectLogPath(repoPath, "board")

export function appendBoardEvent(repoPath: string, input: BoardEventInput, opts: { readonly redact: boolean }): void {
  // `before` and `after` are stored as JSON text: the kernel hash drops `status` keys at every depth and refuses
  // floats (KERNEL-8), and a board row has both, so as objects an edited status would keep its line's id.
  const { text, before, after, ...rest } = input
  const payload = {
    ...rest,
    ...(before === undefined ? {} : { before: JSON.stringify(before) }),
    ...(after === undefined ? {} : { after: JSON.stringify(after) }),
    ...(text === undefined ? {} : { textHash: id({ kind: "BoardText", text }), ...(opts.redact ? {} : { text }) }),
  }
  const event: Omit<Event, "id"> = {
    seq: 0,
    nodeKey: input.project as NonNullable<Event["nodeKey"]>,
    contentHash: id(payload),
    fresh: true,
    supersedes: [],
    payload,
  }
  createDurableLog(boardLogPath(repoPath)).append({ ...event, id: eventId(event) })
}

/** Every board write in the tree, in `(at, contentHash)` order: the input `board import` folds. */
export function readBoard(repoPath: string): BoardRead {
  const read = createDurableLog(boardLogPath(repoPath)).read()
  const lines = [...read.log.values()].flatMap((ev) => {
    const event = boardEvent(ev.payload)
    return event === undefined ? [] : [{ event, hash: ev.contentHash }]
  })
  return {
    events: lines
      .sort((a, b) =>
        a.event.at !== b.event.at ? (a.event.at < b.event.at ? -1 : 1) : a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0,
      )
      .map((line) => line.event),
    rejected: read.rejected + read.log.size - lines.length,
  }
}

/**
 * Append the orchestrator's logbook entry for one landed PR (`members/orch/memory/logbook.jsonl`). The entry is
 * validated in full first (MEM-5, MEM-8c), and a PR that already has an entry is refused (MEM-8: one per PR). On a
 * public repository the five prose sections are written empty and `textHash` names them.
 */
export function appendLogbookEntry(repoPath: string, entry: LogbookEntry, opts: { readonly redact: boolean }): LogbookVerdict {
  const verdict = validateLogbookEntry(entry)
  if (!verdict.valid) return verdict
  const memory = createDurableMemory(repoPath)
  const exists = memory
    .read()
    .store.some((r) => r.kind === "logbook" && (r.entry as LogbookEntry).prId === entry.prId)
  if (exists) return { valid: false, reasons: [`logbook entry exists for PR ${entry.prId}`] }
  const prose = Object.fromEntries(LOGBOOK_SECTIONS.map((section) => [section, entry[section]]))
  const kept = opts.redact
    ? { ...entry, shipped: "", decisions: "", tradeoffs: "", risks: "", openThreads: "", textHash: id({ kind: "LogbookText", prose }) }
    : entry
  memory.append({ owner: LOGBOOK_AUTHOR, kind: "logbook", entry: kept })
  return verdict
}

/** Append the Orientation `milestone` event for a card that landed in `pr`. The label is ids only. */
export function appendMilestone(repoPath: string, landed: { readonly card: string; readonly pr: number }): void {
  createDurableOrientation(repoPath).append("milestone", `${landed.card} landed in #${landed.pr}`)
}

function boardEvent(v: unknown): BoardEvent | undefined {
  if (v === null || typeof v !== "object") return undefined
  const o = v as Record<string, unknown>
  const text = (k: string) => typeof o[k] === "string" && (o[k] as string).length > 0
  if (!text("activity") || !text("project") || !text("actor") || !text("action") || !text("at")) return undefined
  const before = parse(o.before)
  const after = parse(o.after)
  if (before === null || after === null) return undefined
  const { before: _b, after: _a, ...rest } = o
  return {
    ...(rest as Omit<BoardEvent, "before" | "after">),
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
  }
}

/** A stored `before`/`after`: absent stays absent, and anything that is not a JSON object is `null` (rejected). */
function parse(v: unknown): Record<string, unknown> | undefined | null {
  if (v === undefined) return undefined
  if (typeof v !== "string") return null
  try {
    const parsed: unknown = JSON.parse(v)
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

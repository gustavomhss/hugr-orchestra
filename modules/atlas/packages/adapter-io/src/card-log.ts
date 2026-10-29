// @atlas/adapter-io — src/card-log.ts  (the committed card logs, `.atlas/cards/<CARD>/`)
//
// A card is one board issue, keyed `${project.key}-${number}`. Its folder holds two kinds of log (repo-layout design
// §3): `card.jsonl`, the card's status moves, thread messages, decisions and links, written by the host on the card's
// branch; and `attempts/a<n>.jsonl`, one attempt's metering, written by the host in the bundle's record commit. No
// seat writes either.
//
// Every line is a kernel `Event` (`durable-log.ts`) keyed by `eventId`, so a torn or edited line is counted, never
// folded. Order is `(at, contentHash)`: `seq` and file position differ across branches after a union merge.
//
// A public repository travels redacted (design §6): a message or decision keeps the hash of its text but not the
// text, and an attempt keeps its model, timings and hashes but not its spend. The caller decides `redact` from the
// remote host (`repo-visibility.ts`); these writers only apply it.

import { readdirSync } from "node:fs"
import { dirname } from "node:path"
import { eventId, id } from "@atlas/kernel"
import type { Event } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { AttemptMetering } from "@atlas/persist"
import { createDurableLog } from "./durable-log.js"
import { attemptPath, cardLogPath } from "./layout.js"

/** What a thread message is for (merge-queue design): the brief out, a question and its answer, a return, a review, a rework. */
export type ThreadKind = "brief" | "question" | "answer" | "return" | "review" | "rework"

/** One card event as the host offers it. `at` is ISO-8601 UTC. */
export type CardEventInput =
  | { readonly kind: "status"; readonly status: string; readonly by: string; readonly at: string }
  | {
      readonly kind: "message"
      readonly thread: ThreadKind
      readonly from: string
      readonly text: string
      readonly attempt?: number
      readonly at: string
    }
  | { readonly kind: "decision"; readonly by: string; readonly text: string; readonly at: string }
  | { readonly kind: "link"; readonly rel: string; readonly target: string; readonly at: string }

/** One card event as committed: free text carries its hash, and the text itself only on a private repository. */
export type CardEvent =
  | Extract<CardEventInput, { kind: "status" | "link" }>
  | (Omit<Extract<CardEventInput, { kind: "message" | "decision" }>, "text"> & { readonly text?: string; readonly textHash: Hash })

export interface CardRead {
  readonly events: readonly CardEvent[]
  readonly rejected: number
}

/** One attempt line. `n` is the attempt number, so a line moved to another attempt's file is rejected. */
export interface AttemptEntry {
  readonly card: string
  readonly n: number
  readonly at: string
  readonly metering: AttemptMetering
}

export interface AttemptRead {
  readonly entry?: AttemptEntry
  readonly rejected: number
}

export function appendCardEvent(repoPath: string, card: string, input: CardEventInput, opts: { readonly redact: boolean }): void {
  // The kernel hash drops every `status` key (KERNEL-8), so a status move is stored under `state`: kept as `status`,
  // an edited status would still match its line's id.
  const event =
    input.kind === "status"
      ? { kind: input.kind, state: input.status, by: input.by, at: input.at }
      : input.kind === "message" || input.kind === "decision"
        ? redactText(input, opts.redact)
        : input
  append(cardLogPath(repoPath, card), card, { card, event })
}

/** Append attempt `n`'s metering. A later line for the same attempt supersedes by `(at, contentHash)`. */
export function appendAttempt(
  repoPath: string,
  card: string,
  n: number,
  metering: AttemptMetering,
  opts: { readonly redact: boolean; readonly at: string },
): void {
  const kept = opts.redact ? withoutSpend(metering) : metering
  append(attemptPath(repoPath, card, n), card, { card, n, at: opts.at, metering: kept })
}

/** Every event of `card`, in `(at, contentHash)` order. */
export function readCard(repoPath: string, card: string): CardRead {
  const read = createDurableLog(cardLogPath(repoPath, card)).read()
  const lines = [...read.log.values()].flatMap((ev) => {
    const payload = ev.payload as { card?: unknown; event?: unknown } | null
    if (payload === null || typeof payload !== "object" || payload.card !== card) return []
    const event = cardEvent(payload.event)
    return event === undefined ? [] : [{ event, hash: ev.contentHash }]
  })
  return {
    events: lines.sort((a, b) => order(a.event.at, a.hash, b.event.at, b.hash)).map((line) => line.event),
    rejected: read.rejected + read.log.size - lines.length,
  }
}

/** The latest line of attempt `n` at `card`, or no entry when the attempt was never recorded. */
export function readAttempt(repoPath: string, card: string, n: number): AttemptRead {
  const read = createDurableLog(attemptPath(repoPath, card, n)).read()
  const lines = [...read.log.values()].flatMap((ev) => {
    const entry = ev.payload
    return isAttempt(entry) && entry.card === card && entry.n === n ? [{ entry, hash: ev.contentHash }] : []
  })
  const latest = lines.sort((a, b) => order(b.entry.at, b.hash, a.entry.at, a.hash))[0]
  const rejected = read.rejected + read.log.size - lines.length
  return latest === undefined ? { rejected } : { entry: latest.entry, rejected }
}

/** The attempt numbers recorded for `card`, ascending. */
export function attemptNumbers(repoPath: string, card: string): readonly number[] {
  return fileNames(dirname(attemptPath(repoPath, card, 1)))
    .flatMap((name) => {
      const match = /^a([1-9][0-9]*)\.jsonl$/.exec(name)
      return match === null ? [] : [Number(match[1])]
    })
    .sort((a, b) => a - b)
}

function fileNames(dir: string): readonly string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function append(path: string, card: string, payload: object): void {
  const event: Omit<Event, "id"> = {
    seq: 0,
    nodeKey: card as NonNullable<Event["nodeKey"]>,
    contentHash: id(payload),
    fresh: true,
    supersedes: [],
    payload,
  }
  createDurableLog(path).append({ ...event, id: eventId(event) })
}

function redactText(input: Extract<CardEventInput, { kind: "message" | "decision" }>, redact: boolean): CardEvent {
  const textHash = id({ kind: "CardText", text: input.text })
  if (!redact) return { ...input, textHash }
  const { text: _text, ...rest } = input
  return { ...rest, textHash }
}

function withoutSpend(metering: AttemptMetering): AttemptMetering {
  const { costMicroUsd: _cost, ...rest } = metering
  return rest
}

const order = (atA: string, hashA: string, atB: string, hashB: string): number =>
  atA !== atB ? (atA < atB ? -1 : 1) : hashA < hashB ? -1 : hashA > hashB ? 1 : 0

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0

function cardEvent(v: unknown): CardEvent | undefined {
  if (v === null || typeof v !== "object") return undefined
  const o = v as Record<string, unknown>
  if (!isText(o.at)) return undefined
  if (o.kind === "status")
    return isText(o.state) && typeof o.by === "string" ? { kind: "status", status: o.state, by: o.by, at: o.at } : undefined
  if (o.kind === "link") return isText(o.rel) && isText(o.target) ? (o as CardEvent) : undefined
  if (o.kind === "message")
    return typeof o.thread === "string" && typeof o.from === "string" && isText(o.textHash) ? (o as CardEvent) : undefined
  if (o.kind === "decision") return typeof o.by === "string" && isText(o.textHash) ? (o as CardEvent) : undefined
  return undefined
}

function isAttempt(v: unknown): v is AttemptEntry {
  if (v === null || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  const m = o.metering as Record<string, unknown> | null | undefined
  if (typeof o.card !== "string" || typeof o.n !== "number" || !isText(o.at)) return false
  return m !== null && typeof m === "object" && typeof m.seat === "string" && typeof m.session === "string" && typeof m.model === "string"
}

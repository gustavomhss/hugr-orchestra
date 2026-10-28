// @atlas/adapter-io — src/context-log.ts  (a session's committed context-continuity archive)
//
// `.atlas/members/<seat>/context/<session>.jsonl` (repo-layout design §3, "Context continuity"). The continuity
// module archives a session's context as it compacts, in the user's data directory; the host exports that archive
// here in the bundle's record commit. Events:
//
//   open        the first event: the session and its seat
//   reference   one archived chunk (`id`, `title`, `first`, `last`, `bytes`); its markdown is the blob `id`
//   mask-add    a tool call masked behind a reference
//   mask-remove a mask lifted
//
// The current masks are the fold of the mask events in `(at, contentHash)` order. A chunk's `id` is the sha256 of its
// markdown, which continuity scrubs before it hashes (`scrubText`), so the blob holds the bytes the id names. A public
// repository keeps the events and never commits the chunks (design §6); the caller decides `commit` from the remote
// host (`repo-visibility.ts`).
//
// Every line is a kernel `Event` (`durable-log.ts`) keyed by `eventId`. A line that names another session is rejected.

import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { eventId, id } from "@atlas/kernel"
import type { Event } from "@atlas/kernel"
import { scrub } from "@atlas/persist"
import { createDurableLog } from "./durable-log.js"
import { blobPath, contextLogPath } from "./layout.js"

export interface ContextReference {
  readonly id: string
  readonly title: string
  readonly first: string
  readonly last: string
  readonly bytes: number
}

export type ContextEvent =
  | { readonly kind: "open"; readonly seat: string; readonly at: string }
  | { readonly kind: "reference"; readonly reference: ContextReference; readonly at: string }
  | { readonly kind: "mask-add"; readonly call: string; readonly reference: string; readonly at: string }
  | { readonly kind: "mask-remove"; readonly call: string; readonly at: string }

/** A local archive as the host offers it: each reference with its markdown, and the current masks. */
export interface ContextArchive {
  readonly references: readonly (ContextReference & { readonly markdown: string })[]
  readonly masks: readonly (readonly [call: string, reference: string])[]
}

export interface ContextRead {
  readonly seat?: string
  readonly references: readonly ContextReference[]
  readonly masks: readonly (readonly [call: string, reference: string])[]
  readonly rejected: number
}

/** Scrub credential shapes out of text before it is hashed, the same pass the transcript store applies. */
export function scrubText(text: string): string {
  return new TextDecoder().decode(scrub(new TextEncoder().encode(text)))
}

/**
 * Append what the local archive holds and the committed file lacks: the open event once, each new reference, and the
 * mask events that turn the committed masks into the current ones. With `commit`, each chunk is written to `blobs/`
 * once; a chunk whose markdown does not hash to its id is refused. Running it twice appends nothing.
 */
export function exportContext(
  repoPath: string,
  seat: string,
  session: string,
  archive: ContextArchive,
  opts: { readonly commit: boolean; readonly at: string },
): { readonly appended: number } {
  const bad = archive.references.find((ref) => sha256(ref.markdown) !== ref.id)
  if (bad !== undefined) throw new Error(`context chunk ${bad.id} does not match its hash`)
  const path = contextLogPath(repoPath, seat, session)
  const current = readContext(repoPath, seat, session)
  const known = new Set(current.references.map((ref) => ref.id))
  const masks = new Map(current.masks)
  const next = new Map(archive.masks)
  const events: ContextEvent[] = [
    ...(current.seat === undefined ? [{ kind: "open" as const, seat, at: opts.at }] : []),
    ...archive.references
      .filter((ref) => !known.has(ref.id))
      .map((ref) => ({
        kind: "reference" as const,
        reference: { id: ref.id, title: ref.title, first: ref.first, last: ref.last, bytes: ref.bytes },
        at: opts.at,
      })),
    ...[...next]
      .filter(([call, ref]) => masks.get(call) !== ref)
      .map(([call, reference]) => ({ kind: "mask-add" as const, call, reference, at: opts.at })),
    ...[...masks.keys()]
      .filter((call) => !next.has(call))
      .map((call) => ({ kind: "mask-remove" as const, call, at: opts.at })),
  ]
  const log = createDurableLog(path)
  events.forEach((event) => {
    const payload = { session, event }
    const line: Omit<Event, "id"> = {
      seq: 0,
      nodeKey: session as Event["nodeKey"],
      contentHash: id(payload),
      fresh: true,
      supersedes: [],
      payload,
    }
    log.append({ ...line, id: eventId(line) })
  })
  if (opts.commit)
    archive.references.forEach((ref) => {
      const blob = blobPath(repoPath, ref.id)
      if (existsSync(blob)) return
      mkdirSync(dirname(blob), { recursive: true })
      writeFileSync(blob, ref.markdown)
    })
  return { appended: events.length }
}

/** The committed archive of `session`: its seat, references and current masks. */
export function readContext(repoPath: string, seat: string, session: string): ContextRead {
  const read = createDurableLog(contextLogPath(repoPath, seat, session)).read()
  const lines = [...read.log.values()]
    .flatMap((ev) => {
      const payload = ev.payload as { session?: unknown; event?: unknown } | null
      return payload !== null && typeof payload === "object" && payload.session === session && isContextEvent(payload.event)
        ? [{ event: payload.event, hash: ev.contentHash }]
        : []
    })
    .sort((a, b) =>
      a.event.at !== b.event.at ? (a.event.at < b.event.at ? -1 : 1) : a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0,
    )
  const events = lines.map((line) => line.event)
  const opened = events.find((event) => event.kind === "open")
  const references = new Map(
    events.flatMap((event) => (event.kind === "reference" ? [[event.reference.id, event.reference] as const] : [])),
  )
  const masks = events.reduce((fold, event) => {
    if (event.kind === "mask-add") fold.set(event.call, event.reference)
    if (event.kind === "mask-remove") fold.delete(event.call)
    return fold
  }, new Map<string, string>())
  return {
    ...(opened?.kind === "open" ? { seat: opened.seat } : {}),
    references: [...references.values()],
    masks: [...masks],
    rejected: read.rejected + read.log.size - lines.length,
  }
}

/**
 * One committed chunk of `seat`'s archives, found by reference id in any of its sessions, with the session that
 * archived it. Undefined when no session names it, its blob is not committed, or the blob does not match.
 */
export function readContextChunk(
  repoPath: string,
  seat: string,
  reference: string,
): { readonly session: string; readonly reference: ContextReference; readonly markdown: string } | undefined {
  const dir = dirname(contextLogPath(repoPath, seat, "x"))
  const found = fileNames(dir)
    .flatMap((name) => (name.endsWith(".jsonl") ? [decodeURIComponent(name.slice(0, -".jsonl".length))] : []))
    .flatMap((session) => {
      const ref = readContext(repoPath, seat, session).references.find((item) => item.id === reference)
      return ref === undefined ? [] : [{ session, reference: ref }]
    })[0]
  if (found === undefined) return undefined
  const markdown = readBlob(blobPath(repoPath, reference))
  if (markdown === undefined || sha256(markdown) !== reference || Buffer.byteLength(markdown) !== found.reference.bytes)
    return undefined
  return { ...found, markdown }
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex")

function fileNames(dir: string): readonly string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function readBlob(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0

function isContextEvent(v: unknown): v is ContextEvent {
  if (v === null || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  if (!isText(o.at)) return false
  if (o.kind === "open") return isText(o.seat)
  if (o.kind === "mask-add") return isText(o.call) && isText(o.reference)
  if (o.kind === "mask-remove") return isText(o.call)
  if (o.kind !== "reference" || o.reference === null || typeof o.reference !== "object") return false
  const r = o.reference as Record<string, unknown>
  return isText(r.id) && isText(r.title) && isText(r.first) && isText(r.last) && Number.isSafeInteger(r.bytes)
}

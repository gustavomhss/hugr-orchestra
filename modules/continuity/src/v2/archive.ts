export * as ContinuityArchive from "./archive"

import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Option, Schema } from "effect"
import { KeyedMutex } from "@orchestra/core/effect/keyed-mutex"
import { Global } from "@orchestra/core/global"

// The on-disk format is V1's (apps/orchestra/src/continuity/archive-format.ts), unchanged, so V1 and V2 sessions
// share one archive: <data>/continuity/<sha256(sessionID)>/{index.json,memory.json,<sha256(markdown)>.md}.

export const PAYLOAD_LIMIT = 32 * 1024
// An absolute end assertion: JavaScript's `$` also accepts a final newline.
export const HASH = /^[0-9a-f]{64}(?![\s\S])/
const SOURCE = /^msg[A-Za-z0-9_-]+(?![\s\S])/
const SESSION = /^ses[A-Za-z0-9_-]+(?![\s\S])/

export class ArchiveError extends Schema.TaggedErrorClass<ArchiveError>()("ContinuityArchiveError", {
  reason: Schema.String,
}) {}

const positive = Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER))
const Reference = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(HASH)),
  title: Schema.NonEmptyString,
  first: Schema.String.check(Schema.isPattern(SOURCE)),
  last: Schema.String.check(Schema.isPattern(SOURCE)),
  bytes: positive,
})
export type Reference = typeof Reference.Type
export type Chunk = Reference & { readonly markdown: string }

const Manifest = Schema.Struct({
  version: Schema.Literal(1),
  sessionID: Schema.String.check(Schema.isPattern(SESSION)),
  references: Schema.Array(Reference),
})
// V2 owns only the masks; a V1 working-memory entry in the same file is kept as it is.
const Memory = Schema.Struct({
  version: Schema.Literal(1),
  sessionID: Schema.String,
  entry: Schema.Unknown,
  masks: Schema.Array(Schema.Tuple([Schema.NonEmptyString, Schema.String.check(Schema.isPattern(HASH))])),
})
const decodeManifest = Schema.decodeUnknownOption(Schema.fromJsonString(Manifest), { onExcessProperty: "error" })
const decodeMemory = Schema.decodeUnknownOption(Schema.fromJsonString(Memory), { onExcessProperty: "error" })

const locks = KeyedMutex.makeUnsafe<string>()

export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

export function fenced(text: string, language = "text") {
  const fence = "`".repeat(Array.from(text.matchAll(/`+/g)).reduce((size, match) => Math.max(size, match[0].length + 1), 3))
  // The extra LF is framing, not part of the captured payload (including CRLF).
  return `${fence}${language}\n${text}\n${fence}`
}

/** Splits text into UTF-8 payloads of at most PAYLOAD_LIMIT bytes without cutting a code point. */
export function split(text: string) {
  const bytes = Buffer.from(text.toWellFormed(), "utf8")
  const result: string[] = []
  for (let start = 0; start < bytes.length; ) {
    let end = Math.min(start + PAYLOAD_LIMIT, bytes.length)
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    result.push(bytes.subarray(start, end).toString("utf8"))
    start = end
  }
  return result
}

/** The archive chunks of one source message's rendered text, one per payload piece. */
export function chunks(sessionID: string, source: string, role: "user" | "assistant", text: string): Chunk[] {
  const pieces = split(text)
  return pieces.map((payload, index) => {
    const markdown = render(sessionID, source, role, index + 1, pieces.length, payload)
    return {
      id: hash(markdown),
      title: title(role, source, index + 1, pieces.length),
      first: source,
      last: source,
      bytes: Buffer.byteLength(markdown),
      markdown,
    }
  })
}

/** Publishes chunks under the Session's archive and indexes them; an existing chunk is verified, never rewritten. */
export const publish = Effect.fn("ContinuityArchive.publish")(function* (sessionID: string, values: readonly Chunk[]) {
  if (!SESSION.test(sessionID) || values.some((value) => !SOURCE.test(value.first)))
    return yield* new ArchiveError({ reason: "archive-invalid-identity" })
  const dir = directory(sessionID)
  return yield* locks.withLock(dir)(
    Effect.gen(function* () {
      yield* attempt(() => fs.mkdir(dir, { recursive: true, mode: 0o700 }))
      const retained = yield* index(sessionID)
      const refs = new Map(retained.map((ref) => [ref.id, ref]))
      for (const value of values) {
        const existing = refs.get(value.id)
        if (existing) yield* load(sessionID, existing)
        if (!existing) yield* atomic(dir, `${value.id}.md`, value.markdown)
        refs.set(value.id, { id: value.id, title: value.title, first: value.first, last: value.last, bytes: value.bytes })
      }
      if (refs.size === retained.length) return
      yield* atomic(
        dir,
        "index.json",
        JSON.stringify({ version: 1, sessionID, references: [...refs.values()] }, null, 2) + "\n",
      )
    }),
  )
})

/** The Session's indexed references; none when nothing was archived. */
export const list = Effect.fn("ContinuityArchive.list")(function* (sessionID: string) {
  return yield* index(sessionID)
})

/** One verified chunk; undefined for an unknown or malformed ID. */
export const read = Effect.fn("ContinuityArchive.read")(function* (sessionID: string, id: string) {
  if (!HASH.test(id)) return undefined
  const ref = (yield* index(sessionID)).find((item) => item.id === id)
  return ref ? yield* load(sessionID, ref) : undefined
})

/** Masked tool calls and the reference holding their full output. */
export const readMasks = Effect.fn("ContinuityArchive.readMasks")(function* (sessionID: string) {
  return (yield* memory(sessionID))?.masks.map(([call, reference]) => [call, reference] as const) ?? []
})

export const writeMasks = Effect.fn("ContinuityArchive.writeMasks")(function* (
  sessionID: string,
  masks: ReadonlyArray<readonly [string, string]>,
) {
  const dir = directory(sessionID)
  return yield* locks.withLock(dir)(
    Effect.gen(function* () {
      yield* attempt(() => fs.mkdir(dir, { recursive: true, mode: 0o700 }))
      const entry = (yield* memory(sessionID))?.entry ?? null
      yield* atomic(dir, "memory.json", JSON.stringify({ version: 1, sessionID, entry, masks }))
    }),
  )
})

function directory(sessionID: string) {
  return path.join(Global.Path.data, "continuity", hash(sessionID))
}

function title(role: string, source: string, piece: number, total: number) {
  return `${role} message ${source} (continuation ${piece}/${total})`
}

function render(sessionID: string, source: string, role: string, piece: number, total: number, payload: string) {
  return [
    `# ${title(role, source, piece, total)}`,
    "",
    `Session: ${sessionID}`,
    `First source: ${source}`,
    `Last source: ${source}`,
    `Role: ${role}`,
    `Continuation: ${piece}/${total}`,
    `Payload bytes: ${Buffer.byteLength(payload)}`,
    "",
    fenced(payload, "markdown"),
    "",
  ].join("\n")
}

const index = Effect.fnUntraced(function* (sessionID: string) {
  const text = yield* readText(path.join(directory(sessionID), "index.json"))
  if (text === undefined) return [] as Reference[]
  const manifest = decodeManifest(text)
  if (Option.isNone(manifest) || manifest.value.sessionID !== sessionID)
    return yield* new ArchiveError({ reason: "archive-corrupt-index" })
  return [...manifest.value.references]
})

const memory = Effect.fnUntraced(function* (sessionID: string) {
  const text = yield* readText(path.join(directory(sessionID), "memory.json"))
  if (text === undefined) return undefined
  const stored = decodeMemory(text)
  if (Option.isNone(stored) || stored.value.sessionID !== sessionID)
    return yield* new ArchiveError({ reason: "archive-corrupt-memory" })
  return stored.value
})

const load = Effect.fnUntraced(function* (sessionID: string, ref: Reference) {
  const markdown = yield* readText(path.join(directory(sessionID), `${ref.id}.md`))
  if (markdown === undefined) return yield* new ArchiveError({ reason: "archive-unavailable" })
  if (hash(markdown) !== ref.id || Buffer.byteLength(markdown) !== ref.bytes)
    return yield* new ArchiveError({ reason: "archive-corrupt-hash" })
  return { ...ref, markdown } satisfies Chunk
})

const readText = (file: string) =>
  attempt(() => fs.readFile(file, "utf8")).pipe(
    Effect.catch((error) => (error.reason === "archive-missing" ? Effect.succeed(undefined) : Effect.fail(error))),
  )

// Write a private temporary file, flush it, then rename it over the target: readers see the old or the new file.
const atomic = (dir: string, name: string, content: string) => {
  const temp = path.join(dir, `.archive-${randomUUID()}.tmp`)
  return attempt(async () => {
    const handle = await fs.open(temp, "wx", 0o600)
    await handle
      .writeFile(content, "utf8")
      .then(() => handle.sync())
      .finally(() => handle.close())
    await fs.rename(temp, path.join(dir, name))
  }).pipe(Effect.ensuring(Effect.promise(() => fs.rm(temp, { force: true }))))
}

function attempt<A>(body: () => Promise<A>) {
  return Effect.tryPromise({
    try: body,
    catch: (error) =>
      new ArchiveError({
        reason:
          error instanceof Error && "code" in error && error.code === "ENOENT" ? "archive-missing" : "archive-unavailable",
      }),
  })
}

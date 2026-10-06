import { createHash } from "node:crypto"
import { Option, Schema } from "effect"
import { MessageID, SessionID } from "@/session/schema"
import { SECTIONS, type ArchiveChunk, type ArchiveReference, type MemoryArtifact } from "./memory-types"
import { hasArtifact, type ContinuityContext } from "./model"

export const payloadLimit = 32 * 1024
// An absolute end assertion: JavaScript's `$` also accepts a final newline.
export const hashPattern = /^[0-9a-f]{64}(?![\s\S])/
const sourcePattern = /^msg[A-Za-z0-9_-]+(?![\s\S])/
const sessionPattern = /^ses[A-Za-z0-9_-]+(?![\s\S])/
const positive = Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER))
const reference = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(hashPattern)),
  title: Schema.NonEmptyString,
  first: MessageID.check(Schema.isPattern(sourcePattern)),
  last: MessageID.check(Schema.isPattern(sourcePattern)),
  bytes: positive,
})
const manifest = Schema.Struct({
  version: Schema.Literal(1),
  sessionID: Schema.String.check(Schema.isPattern(sessionPattern)),
  references: Schema.Array(reference),
})
const item = Schema.Struct({
  id: Schema.String,
  section: Schema.Literals(SECTIONS),
  fields: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  src: Schema.Array(Schema.String),
})
const memory = Schema.Struct({
  version: Schema.Literal(1),
  sessionID: Schema.String,
  entry: Schema.NullOr(Schema.Struct({
    boundary: MessageID,
    tailStart: MessageID,
    artifact: Schema.Struct({
      version: Schema.Literal(4), parentID: SessionID, producerID: SessionID, boundary: MessageID, coveredThrough: MessageID,
      tailStart: MessageID, items: Schema.Array(item), next: Schema.Int, text: Schema.String,
    }),
  })),
  masks: Schema.Array(Schema.Tuple([Schema.NonEmptyString, Schema.String.check(Schema.isPattern(hashPattern))])),
})
const parse = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const decode = Schema.decodeUnknownOption(manifest, { onExcessProperty: "error" })
const decodeStored = Schema.decodeUnknownOption(memory, { onExcessProperty: "error" })

/** A session's persisted working memory and tool-output masks (part ID, archive reference). */
export type StoredMemory = { context?: ContinuityContext & { artifact: MemoryArtifact }; masks: [string, string][] }

export function hash(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

export function identity(value: unknown, prefix: "ses" | "msg" | "prt") {
  if (typeof value !== "string" || !new RegExp(`^${prefix}[A-Za-z0-9_-]+(?![\\s\\S])`).test(value))
    throw new Error("archive-invalid-identity")
}

export function readManifest(text: string, sessionID: SessionID): ArchiveReference[] {
  const json = parse(text)
  const result = Option.isSome(json) ? decode(json.value) : Option.none()
  if (Option.isNone(result) || result.value.sessionID !== sessionID)
    throw new Error("archive-corrupt-index")
  const refs = result.value.references
  if (new Set(refs.map((ref) => ref.id)).size !== refs.length || refs.some((ref) => ref.first !== ref.last))
    throw new Error("archive-corrupt-index")
  return refs.map((ref) => ({ ...ref }))
}

export function readStored(text: string, sessionID: SessionID): StoredMemory {
  const json = parse(text)
  const result = Option.isSome(json) ? decodeStored(json.value) : Option.none()
  if (Option.isNone(result) || result.value.sessionID !== sessionID) throw new Error("archive-corrupt-memory")
  const entry = result.value.entry
  const context = entry ? { sessionID, boundary: entry.boundary, tailStart: entry.tailStart, text: entry.artifact.text,
    artifact: { ...entry.artifact, items: [...entry.artifact.items] } } : undefined
  if (context && !hasArtifact(context)) throw new Error("archive-corrupt-memory")
  return { context, masks: result.value.masks.map(([part, reference]) => [part, reference]) }
}

export function writeStored(sessionID: SessionID, value: StoredMemory) {
  const entry = value.context && { boundary: value.context.boundary, tailStart: value.context.tailStart, artifact: value.context.artifact }
  return JSON.stringify({ version: 1, sessionID, entry: entry ?? null, masks: value.masks })
}

export function fenced(text: string, language = "text") {
  const fence = delimiter(text)
  // The extra LF is framing, not part of the captured payload (including CRLF).
  return `${fence}${language}\n${text}\n${fence}`
}

function delimiter(text: string) {
  return "`".repeat(Array.from(text.matchAll(/`+/g)).reduce((size, match) => Math.max(size, match[0].length + 1), 3))
}

export function split(text: string): string[] {
  if (!text.isWellFormed()) throw new Error("archive-invalid-unicode")
  const bytes = Buffer.from(text, "utf8")
  const result: string[] = []
  for (let start = 0; start < bytes.length;) {
    let end = Math.min(start + payloadLimit, bytes.length)
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    result.push(bytes.subarray(start, end).toString("utf8"))
    start = end
  }
  return result
}

function title(role: string, source: string, piece: number, total: number) {
  return `${role} message ${source} (continuation ${piece}/${total})`
}

function markdown(sessionID: string, source: string, role: string, piece: number, total: number, payload: string) {
  return [
    `# ${title(role, source, piece, total)}`, "",
    `Session: ${sessionID}`, `First source: ${source}`, `Last source: ${source}`,
    `Role: ${role}`, `Continuation: ${piece}/${total}`, `Payload bytes: ${Buffer.byteLength(payload)}`, "",
    fenced(payload, "markdown"), "",
  ].join("\n")
}

export function chunk(sessionID: SessionID, source: MessageID, role: string, piece: number, total: number, payload: string): ArchiveChunk {
  const text = markdown(sessionID, source, role, piece, total, payload)
  return { id: hash(text), title: title(role, source, piece, total), first: source, last: source,
    bytes: Buffer.byteLength(text), markdown: text }
}

export function verify(text: string, sessionID: SessionID, ref: ArchiveReference): ArchiveChunk {
  if (hash(text) !== ref.id) throw new Error("archive-corrupt-hash")
  const lines = text.split("\n", 10)
  const role = lines[5]?.slice("Role: ".length)
  const continuation = /^Continuation: ([1-9][0-9]*)\/([1-9][0-9]*)$/.exec(lines[6] ?? "")
  const size = /^Payload bytes: ([1-9][0-9]*)$/.exec(lines[7] ?? "")
  const fence = /^(`{3,})markdown$/.exec(lines[9] ?? "")
  if (!continuation || !size || !fence || (role !== "user" && role !== "assistant"))
    throw new Error("archive-corrupt-content")
  const piece = Number(continuation[1])
  const total = Number(continuation[2])
  const length = Number(size[1])
  const start = lines.join("\n").length + 1
  const end = text.length - fence[1].length - 2
  const payload = text.slice(start, end)
  if (!Number.isSafeInteger(total) || piece > total || length > payloadLimit ||
    Buffer.byteLength(payload) !== length || ref.bytes !== Buffer.byteLength(text) || ref.first !== ref.last ||
    ref.title !== title(role, ref.first, piece, total) ||
    text !== markdown(sessionID, ref.first, role, piece, total, payload))
    throw new Error("archive-corrupt-content")
  return { ...ref, markdown: text }
}

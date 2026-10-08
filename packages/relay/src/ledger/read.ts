export * as LedgerRead from "./read"

import { constants } from "node:os"
import path from "node:path"
import { readFile, stat } from "node:fs/promises"
import { Effect, Result, Schema } from "effect"
import { RelayJson } from "../json"

// Ledger reading shared by verify and audit (WP1). Lines are split the way Python's text mode reads them (CR and CRLF
// end a line) and blank lines are skipped. Entries go through the strict decoder, never a lenient one.

export class ReadError extends Schema.TaggedErrorClass<ReadError>()("LedgerRead.ReadError", {
  ledger: Schema.String,
  line: Schema.optional(Schema.Int),
  reason: Schema.String,
}) {}

export class Missing extends Schema.TaggedErrorClass<Missing>()("LedgerRead.Missing", { ledger: Schema.String }) {}

// The nonblank lines, as written: verification hashes these bytes and never reserializes a decoded entry.
export const lines = (ledger: string): Effect.Effect<ReadonlyArray<string>, ReadError | Missing> =>
  source(ledger).pipe(Effect.map((text) => split(text).filter((line) => strip(line) !== "")))

// Every entry as a decoded object, without integrity or audit-schema checks (`load_entries`). A failure's reason is
// Python's `str(error)` and its line counts blank lines too.
export const entries = (
  ledger: string,
): Effect.Effect<ReadonlyArray<Readonly<Record<string, unknown>>>, ReadError | Missing> =>
  source(ledger).pipe(
    Effect.flatMap((text) =>
      Effect.forEach(
        split(text).flatMap((line, index) => {
          const stripped = strip(line)
          return stripped === "" ? [] : [{ line: index + 1, text: stripped }]
        }),
        (row) => {
          const decoded = RelayJson.read(row.text)
          if (Result.isFailure(decoded))
            return Effect.fail(new ReadError({ ledger, line: row.line, reason: decoded.failure.reason }))
          if (!(decoded.success instanceof RelayJson.Members))
            return Effect.fail(
              new ReadError({ ledger, line: row.line, reason: `line ${row.line}: entry must be a JSON object` }),
            )
          return Effect.succeed(
            Object.fromEntries(decoded.success.entries.map((entry) => [entry[0], RelayJson.plain(entry[1])])),
          )
        },
      ),
    ),
  )

// A ledger path, or a directory holding one: `<dir>/.relay-state/ledger.jsonl`, then `<dir>/ledger.jsonl`.
export const resolve = (target: string): Effect.Effect<string> =>
  Effect.promise(async () => {
    if (!(await stat(target).catch(() => undefined))?.isDirectory()) return target
    const candidates = [join(target, ".relay-state", "ledger.jsonl"), join(target, "ledger.jsonl")]
    const found = await Promise.all(
      candidates.map((candidate) =>
        stat(candidate).then(
          () => true,
          () => false,
        ),
      ),
    )
    // The run-dir layout is the one an error names when neither exists.
    return candidates[found.indexOf(true)] ?? candidates[0]!
  })

// Python's `str.strip()`: every character that `str.isspace()` accepts, not only JSON whitespace.
export const strip = (text: string): string => text.replace(SPACE_EDGES, "")

const SPACE = "\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000"
const SPACE_EDGES = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, "g")
// Python reads in 8192-byte chunks; a decode error's position is relative to the chunk being decoded.
const CHUNK = 8192

// The text as `open(path)` returns it: strict UTF-8 (a BOM stays a character), with Python's error messages.
function source(ledger: string) {
  return Effect.tryPromise({
    try: () => readFile(ledger),
    catch: (error) =>
      code(error) === "ENOENT" ? new Missing({ ledger }) : new ReadError({ ledger, reason: osError(error, ledger) }),
  }).pipe(
    Effect.flatMap((bytes) => {
      const decoded = utf8(bytes)
      return typeof decoded === "string"
        ? Effect.succeed(decoded)
        : Effect.fail(new ReadError({ ledger, reason: decoded.reason }))
    }),
  )
}

// Universal newlines: CRLF, CR and LF each end a line. The empty piece after a final terminator is not a line, and
// callers drop it as blank.
function split(text: string) {
  return text.split(/\r\n|\r|\n/)
}

function code(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined
}

// `str(OSError)`: `[Errno N] strerror: 'path'`.
function osError(error: unknown, ledger: string) {
  const name = code(error)
  const message = name === undefined ? undefined : STRERROR[name]
  if (name === undefined || message === undefined) return error instanceof Error ? error.message : String(error)
  return `[Errno ${ERRNO.get(name) ?? "?"}] ${message}: ${RelayJson.reprString(ledger)}`
}

const ERRNO = new Map(Object.entries(constants.errno))
const STRERROR: Record<string, string | undefined> = {
  EACCES: "Permission denied",
  EISDIR: "Is a directory",
  ELOOP: "Too many levels of symbolic links",
  ENAMETOOLONG: "File name too long",
  ENOTDIR: "Not a directory",
  EPERM: "Operation not permitted",
}

// The decoded text, or the UnicodeDecodeError Python raises while iterating the file.
function utf8(bytes: Uint8Array): string | { readonly reason: string } {
  const decoded = Result.try(() => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes))
  if (Result.isSuccess(decoded)) return decoded.success
  const failure = invalid(bytes)
  const start = origin(bytes, failure)
  const first = failure.start - start
  const range =
    failure.end - failure.start === 1
      ? `byte 0x${bytes[failure.start]!.toString(16).padStart(2, "0")} in position ${first}`
      : `bytes in position ${first}-${first + failure.end - failure.start - 1}`
  return { reason: `'utf-8' codec can't decode ${range}: ${failure.reason}` }
}

interface Invalid {
  readonly start: number
  readonly end: number
  // The byte whose reading raises the error.
  readonly trigger: number
  readonly reason: "invalid start byte" | "invalid continuation byte" | "unexpected end of data"
}

// The first sequence CPython's UTF-8 decoder rejects, with the byte range it reports.
function invalid(bytes: Uint8Array): Invalid {
  let at = 0
  while (at < bytes.length) {
    const lead = bytes[at]!
    const size = lead < 0x80 ? 0 : lead < 0xc2 ? -1 : lead < 0xe0 ? 1 : lead < 0xf0 ? 2 : lead < 0xf5 ? 3 : -1
    if (size === -1) return { start: at, end: at + 1, trigger: at, reason: "invalid start byte" }
    for (let offset = 1; offset <= size; offset++) {
      if (at + offset >= bytes.length)
        return { start: at, end: bytes.length, trigger: bytes.length, reason: "unexpected end of data" }
      if (!continues(lead, offset, bytes[at + offset]!))
        return { start: at, end: at + offset, trigger: at + offset, reason: "invalid continuation byte" }
    }
    at += size + 1
  }
  return { start: at, end: at, trigger: at, reason: "unexpected end of data" }
}

function continues(lead: number, offset: number, byte: number) {
  if (offset > 1) return byte >= 0x80 && byte <= 0xbf
  if (lead === 0xe0) return byte >= 0xa0 && byte <= 0xbf
  if (lead === 0xed) return byte >= 0x80 && byte <= 0x9f
  if (lead === 0xf0) return byte >= 0x90 && byte <= 0xbf
  if (lead === 0xf4) return byte >= 0x80 && byte <= 0x8f
  return byte >= 0x80 && byte <= 0xbf
}

// Where the decoder's input began when it raised: the chunk holding the trigger byte, preceded by the incomplete
// character the previous chunk carried over. Two cases defer the error to the decoder's next input, which then starts
// at the failing sequence: the end of the file, and an ED A0–BF pair ending a chunk (a possible surrogate prefix).
function origin(bytes: Uint8Array, failure: Invalid) {
  if (failure.reason === "unexpected end of data") return failure.start
  const second = bytes[failure.start + 1] ?? 0
  const deferred =
    bytes[failure.start] === 0xed &&
    second >= 0xa0 &&
    second <= 0xbf &&
    (failure.start + 2 === bytes.length || (failure.start + 2) % CHUNK === 0)
  if (deferred) return failure.start
  const boundary = failure.trigger - (failure.trigger % CHUNK)
  if (failure.start < boundary) return failure.start
  // Everything before the failing sequence is valid, so the character holding the byte before the boundary is whole.
  const lead = [1, 2, 3, 4].map((back) => boundary - back).find((at) => at < 0 || (bytes[at]! & 0xc0) !== 0x80) ?? -1
  if (lead < 0) return boundary
  const width = bytes[lead]! < 0x80 ? 1 : bytes[lead]! < 0xe0 ? 2 : bytes[lead]! < 0xf0 ? 3 : 4
  return lead + width > boundary ? lead : boundary
}

// `os.path.join` without normalization: the result is printed, so `./run` must stay `./run/...`.
function join(directory: string, ...names: string[]) {
  return names.reduce(
    (joined, name) => (joined === "" || SEPARATORS.includes(joined.at(-1)!) ? joined + name : joined + path.sep + name),
    directory,
  )
}

const SEPARATORS = process.platform === "win32" ? "\\/" : "/"

// Read admitted immutable artifacts only; this never acquires sources or writes corpus records.
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import path from "node:path"
import fs from "node:fs/promises"
import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"

export const read = Effect.fn("ResearchRetained.read")(function* (receipt: Research.SourceReceipt | Research.DocumentReceipt) {
  const artifacts = yield* ResearchArtifacts.Service
  const artifact = "origin" in receipt ? receipt.ref.artifact : receipt.artifact
  const representation = "origin" in receipt ? receipt.ref.representation : "markdown"
  const digest = "origin" in receipt ? receipt.ref.digest : receipt.digest
  const pages: string[] = []
  const cursors = new Set<string>()
  const pageLimit = Math.max(1, Math.ceil(receipt.bytes / (Research.Limits.pageBytes - 3)))
  const drain = (cursor?: string): Effect.Effect<void, Research.Error> => Effect.gen(function* () {
    if (pages.length >= pageLimit)
      return yield* new Research.Error({ code: "over_cap", message: "Evaluation artifact page request budget exhausted" })
    if (cursor !== undefined && cursors.has(cursor))
      return yield* new Research.Error({ code: "reference_invalid", message: "Evaluation artifact cursor did not advance" })
    if (cursor !== undefined) cursors.add(cursor)
    const page = yield* artifacts.read(receipt.binding, artifact, cursor, "task")
    const bytes = Buffer.byteLength(page.text)
    const total = pages.reduce((sum, text) => sum + Buffer.byteLength(text), bytes)
    if (!isDeepStrictEqual(page.receipt, receipt) || !isDeepStrictEqual(page.ref, artifact) || page.representation !== representation ||
      bytes > Research.Limits.pageBytes || (receipt.bytes > 0 && bytes === 0) || total > receipt.bytes ||
      page.complete !== (page.cursor === undefined && (!("origin" in receipt) || receipt.complete)) ||
      (page.cursor !== undefined && (!page.cursor.length || cursors.has(page.cursor) || total >= receipt.bytes)) ||
      (page.cursor === undefined && total !== receipt.bytes))
      return yield* new Research.Error({ code: "reference_invalid", message: "Evaluation artifact page differs from admitted representation or did not advance" })
    pages.push(page.text)
    if (page.cursor !== undefined) yield* drain(page.cursor)
  })
  yield* drain()
  const text = pages.join("")
  if (Buffer.byteLength(text) !== receipt.bytes || createHash("sha256").update(text).digest("hex") !== digest)
    return yield* new Research.Error({ code: "reference_invalid", message: "Evaluation artifact export differs from admitted bytes" })
  return { receipt, text, verified: true }
})

export type SourceIdentity = { readonly path: string; readonly sha256: string; readonly bytes: number }
export type Placement = { readonly source: string; readonly data: string; readonly sources: readonly SourceIdentity[] }

// Authenticate against bytes frozen before the child exists. Never reopen the mutable candidate file.
export const authenticate = Effect.fn("ResearchRetained.authenticate")(function* (receipt: Research.SourceReceipt, placement: Placement) {
  const identities = placement.sources.filter((file) => path.resolve(placement.source, file.path).startsWith(placement.source + path.sep) &&
    path.join(placement.source, file.path) === receipt.origin.uri)
  if (receipt.origin.kind !== "file" || receipt.binding.directory !== placement.source || identities.length !== 1)
    return yield* new Research.Error({ code: "reference_invalid", message: "Source is not an unambiguous frozen disclosed input" })
  const identity = identities[0]
  if (!identity) return yield* new Research.Error({ code: "source_unavailable", message: "Frozen source identity is unavailable" })
  const original = yield* Effect.tryPromise({ try: async () => {
    const archive = path.join(placement.data, "frozen-public", createHash("sha256").update(identity.path).digest("hex") + ".bytes")
    if (await fs.realpath(archive) !== archive || !(await fs.lstat(archive)).isFile()) throw new Error("Unsafe frozen archive")
    const bytes = new Uint8Array(await Bun.file(archive).arrayBuffer())
    if (bytes.byteLength !== identity.bytes || createHash("sha256").update(bytes).digest("hex") !== identity.sha256)
      throw new Error("Frozen archive identity mismatch")
    return bytes
  }, catch: () => new Research.Error({ code: "source_unavailable", message: "Original frozen source bytes are missing, unsafe or differ from identity.sources.sha256" }) })
  const artifacts = yield* ResearchArtifacts.Service
  if (receipt.ref.representation === "received" ? !!receipt.derivedFrom || !!receipt.transformation
    : receipt.ref.representation !== "text" || receipt.transformation !== "read-line-projection-v1" || !receipt.derivedFrom)
    return yield* new Research.Error({ code: "unsupported", message: "Frozen source authentication supports received bytes and read-line-projection-v1 only" })
  const parent = receipt.derivedFrom ? (yield* artifacts.read(receipt.binding, receipt.derivedFrom.artifact, undefined, "task")).receipt : receipt
  if (!("origin" in parent) || parent.ref.representation !== "received" || parent.derivedFrom || parent.transformation ||
    !isDeepStrictEqual(parent.binding, receipt.binding) || !isDeepStrictEqual(parent.origin, receipt.origin) ||
    (receipt.derivedFrom && !isDeepStrictEqual(parent.ref, receipt.derivedFrom)))
    return yield* new Research.Error({ code: "reference_invalid", message: "Source received-byte provenance differs from its retained parent" })
  const byteStart = parent.observed?.byteStart
  if (byteStart === undefined || byteStart + parent.bytes > original.byteLength ||
    (parent.complete && (byteStart !== 0 || parent.bytes !== original.byteLength)) ||
    createHash("sha256").update(original.subarray(byteStart, byteStart + parent.bytes)).digest("hex") !== parent.ref.digest)
    return yield* new Research.Error({ code: "reference_invalid", message: "Received bytes or extent differ from original frozen source" })
  // Public text API refuses a received prefix ending inside a UTF-8 scalar. Propagate unsupported; never substitute archive text.
  const received = yield* read(parent)
  if (receipt.ref.representation === "received") return { ...received, receipt, provenance: { identity, receivedRef: parent.ref, byteStart, byteEnd: byteStart + parent.bytes } }
  const view = yield* read(receipt)
  if (byteStart > 0 && original[byteStart - 1] !== 10)
    return yield* new Research.Error({ code: "reference_invalid", message: "Read projection byte extent does not begin at an original line boundary" })
  const lineBase = original.subarray(0, byteStart).reduce((sum, byte) => sum + (byte === 10 ? 1 : 0), 1)
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(received.text))
  const lines = decoded.length ? decoded.split("\n") : []
  if (decoded.endsWith("\n") || byteStart + parent.bytes < original.byteLength) lines.pop()
  const start = receipt.observed?.lineStart
  const end = receipt.observed?.lineEnd
  if (receipt.observed?.byteStart !== byteStart || start === undefined || start < lineBase ||
    (end === undefined ? decoded.length !== 0 || start !== 1 : end < start || end >= lineBase + lines.length))
    return yield* new Research.Error({ code: "reference_invalid", message: "Read projection line extent differs from frozen received bytes" })
  const projected = end === undefined ? [] : lines.slice(start - lineBase, end - lineBase + 1).map((line) => {
    const pending = Array.from(line).slice(0, 2001).join("")
    const chars = Array.from(pending.endsWith("\r") ? pending.slice(0, -1) : pending)
    return chars.length > 2000 ? chars.slice(0, 2000).join("") + "... (line truncated to 2000 chars)" : chars.join("")
  })
  const complete = parent.complete && start === 1 && (end ?? 0) === lines.length && !projected.some((line) => line.endsWith("... (line truncated to 2000 chars)"))
  if (receipt.complete !== complete || view.text !== projected.join("\n"))
    return yield* new Research.Error({ code: "reference_invalid", message: "Read projection bytes or completeness differ from its frozen source and declared extents" })
  return { ...view, receipt, provenance: { identity, received, byteStart, byteEnd: byteStart + parent.bytes, lineStart: start, lineEnd: end, transformation: receipt.transformation } }
})

export * as ResearchRetained from "./research-retained"

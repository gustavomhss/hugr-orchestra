import { Effect, Schema } from "effect"
import { Archive } from "@/continuity/archive"
import type { ArchiveReference } from "@/continuity/memory-types"
import type { SessionID } from "@/session/schema"

const Offset = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const Count = Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(20))
export const Lookup = Schema.Struct({
  reference: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/), Schema.isMaxLength(64)),
  offset: Schema.optional(Offset),
  limit: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(8000))),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export const Search = Schema.Struct({
  archive_query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  limit: Schema.optional(Count),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export const List = Schema.Struct({
  archive_list: Schema.Literal(true),
  offset: Schema.optional(Offset),
  limit: Schema.optional(Count),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

type Parameters = Schema.Schema.Type<typeof Lookup | typeof Search | typeof List>
type Entry = ReturnType<typeof descriptor> & {
  availability: string
  reason?: string
  field?: string
  snippet_offset?: number
  snippet?: string
}

// The caller asks context_recall permission before entering this boundary. Only
// Archive.Service resolves IDs and verifies session ownership and full-file hashes.
export function recall(
  archive: Archive.Interface,
  params: Parameters,
  sessionID: SessionID,
): Effect.Effect<Record<string, unknown>> {
  return Effect.gen(function* () {
    if ("reference" in params) {
      const source = { reference: params.reference }
      const chunk = yield* archive.read({ sessionID, id: params.reference })
      if (!chunk) return { status: "unavailable", source, reason: "missing" }
      const offset = params.offset ?? 0
      if (offset > chunk.markdown.length)
        return { status: "unavailable", source, reason: "offset_out_of_range", total_chars: chunk.markdown.length }
      const page = (length: number) => ({
        status: "found",
        source,
        extent: "archived_markdown",
        original_extent: "unknown",
        bytes: chunk.bytes,
        offset_unit: "utf16_code_units",
        offset,
        total_chars: chunk.markdown.length,
        complete: offset + length === chunk.markdown.length,
        ...(offset + length < chunk.markdown.length ? { next_offset: offset + length } : {}),
        content: chunk.markdown.slice(offset, offset + length),
      })
      let length = Math.min(params.limit ?? 6000, chunk.markdown.length - offset)
      while (size(page(length)) > 8000 && length > 0) length = Math.floor(length / 2)
      return size(page(length)) <= 8000 ? page(length) : { status: "unavailable", reason: "metadata_too_large" }
    }

    const retained = (yield* archive.list(sessionID)).toSorted((a, b) =>
      a.first < b.first ? -1 : a.first > b.first ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )
    const references: Entry[] = []
    const limit = params.limit ?? 10
    const offset = "archive_list" in params ? (params.offset ?? 0) : 0
    if (offset > retained.length)
      return { status: "unavailable", reason: "offset_out_of_range", total: retained.length }
    const query =
      "archive_query" in params
        ? new RegExp(params.archive_query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu")
        : undefined
    let total = query ? 0 : retained.length
    // Sequential reads keep content residency bounded to one chunk. Search must
    // inspect every retained reference to report an honest total, even after its cap.
    for (const ref of query ? retained : retained.slice(offset, offset + limit)) {
      const chunk = yield* archive.read({ sessionID, id: ref.id })
      if (!chunk) {
        if (query) return { status: "unavailable", reason: "missing" }
        references.push({ ...descriptor(ref), availability: "unavailable", reason: "missing" })
        continue
      }
      const content = query?.exec(chunk.markdown)
      const title = query?.exec(ref.title)
      if (query && !content && !title) continue
      if (query) total++
      if (references.length >= limit) continue
      const text = content || !query ? chunk.markdown : ref.title
      const start = Math.max(0, (content?.index ?? title?.index ?? 0) - 40)
      references.push({
        ...descriptor(ref),
        availability: "stored",
        field: content || !query ? "markdown" : "title",
        snippet_offset: start,
        snippet: text.slice(start, start + 300),
      })
    }
    const page = () => ({
      status: total ? "found" : "not_found",
      extent: "archive_descriptors",
      order: "first_message_ascending",
      offset_unit: "references",
      snippet_offset_unit: "utf16_code_units",
      offset,
      total,
      retained: retained.length,
      complete: offset + references.length === total,
      ...(offset + references.length < total
        ? query
          ? { continuation: { archive_list: true } }
          : { next_offset: offset + references.length }
        : {}),
      references,
    })
    while (size(page()) > 8000 && references.length > 0) references.pop()
    if (offset < total && references.length === 0) return { status: "unavailable", reason: "metadata_too_large" }
    return page()
  }).pipe(
    Effect.catchTag("ContinuityArchiveError", (error) =>
      Effect.succeed({
        status: "unavailable",
        ...("reference" in params ? { source: { reference: params.reference } } : {}),
        reason: publicReason(error.reason),
      }),
    ),
  )
}

function descriptor(ref: ArchiveReference) {
  return {
    id: ref.id,
    title: ref.title.slice(0, 256),
    ...(ref.title.length > 256 ? { title_truncated: true } : {}),
    first: ref.first,
    last: ref.last,
    bytes: ref.bytes,
  }
}

function size(value: Record<string, unknown>) {
  return Buffer.byteLength(JSON.stringify(value), "utf8")
}

function publicReason(reason: string) {
  // ArchiveError.reason is intentionally an open string. Never echo OS errors,
  // paths, or arbitrary diagnostics across the tool boundary.
  return [
    "corrupt",
    "missing",
    "unavailable",
    "invalid-id",
    "hash-mismatch",
    "archive-not-implemented",
    "archive-unavailable",
    "archive-corrupt-index",
    "archive-corrupt-content",
    "archive-corrupt-hash",
    "archive-unsafe-path",
    "archive-invalid-identity",
  ].includes(reason)
    ? reason
    : "archive-unavailable"
}

export * as ContextRecallArchive from "./context-recall-archive"

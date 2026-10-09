import { Effect, Schema } from "effect"
import { Archive } from "@/continuity/archive"
import { ArchiveSearch } from "@/continuity/archive-search"
import type { ArchiveReference } from "@/continuity/memory-types"
import { MessageID, type SessionID } from "@/session/schema"

const Offset = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const Count = Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(20))
const Source = MessageID.check(Schema.isPattern(/^msg[A-Za-z0-9_-]+(?![\s\S])/))
export const Lookup = Schema.Struct({
  reference: Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{64}|[uat][1-9][0-9]*)$/), Schema.isMaxLength(64)),
  offset: Schema.optional(Offset),
  limit: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(8000))),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export const Search = Schema.Struct({
  archive_query: Schema.String.check(Schema.isMaxLength(256)),
  limit: Schema.optional(Count),
  match: Schema.optional(Schema.Literals(["literal", "terms"])),
  offset: Schema.optional(Offset.check(Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER))),
  role: Schema.optional(Schema.Literals(["user", "assistant"])),
  from_message: Schema.optional(Source),
  through_message: Schema.optional(Source),
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

    if ("archive_query" in params) return yield* search(archive, params, sessionID)
    const retained = (yield* archive.list(sessionID)).toSorted((a, b) =>
      a.first < b.first ? -1 : a.first > b.first ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )
    const references: Entry[] = []
    const limit = params.limit ?? 10
    const offset = params.offset ?? 0
    if (offset > retained.length)
      return { status: "unavailable", reason: "offset_out_of_range", total: retained.length }
    const total = retained.length
    for (const ref of retained.slice(offset, offset + limit)) {
      const chunk = yield* archive.read({ sessionID, id: ref.id })
      if (!chunk) {
        references.push({ ...descriptor(ref), availability: "unavailable", reason: "missing" })
        continue
      }
      references.push({
        ...descriptor(ref),
        availability: "stored",
        field: "markdown",
        snippet_offset: 0,
        snippet: chunk.markdown.slice(0, 300),
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
      ...(offset + references.length < total ? { next_offset: offset + references.length } : {}),
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

function search(archive: Archive.Interface, params: Schema.Schema.Type<typeof Search>, sessionID: SessionID) {
  return Effect.gen(function* () {
    const terms = params.match === "terms" ? ArchiveSearch.query(params.archive_query) : undefined
    if (!params.archive_query.trim()) return { status: "unavailable", reason: "empty_query" }
    if (terms && !terms.terms.size) return { status: "unavailable", reason: "no_meaningful_terms" }
    if (params.from_message && params.through_message && params.from_message > params.through_message)
      return { status: "unavailable", reason: "invalid_message_range" }
    const retained = (yield* archive.list(sessionID)).toSorted((a, b) =>
      a.first < b.first ? -1 : a.first > b.first ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )
    const offset = params.offset ?? 0
    const limit = params.limit ?? 10
    const capacity = Math.min(retained.length, offset + limit)
    const literal = terms ? undefined : new RegExp(params.archive_query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu")
    const selected: (ArchiveReference & ArchiveSearch.Rank)[] = []
    let total = 0
    // Retain rank metadata only, bounded by actual refs. Read every eligible chunk,
    // including those beyond the requested page, before reporting any total.
    for (const ref of retained) {
      if (params.from_message && ref.last < params.from_message) continue
      if (params.through_message && ref.first > params.through_message) continue
      const chunk = yield* archive.read({ sessionID, id: ref.id })
      if (!chunk) return { status: "unavailable", reason: "missing" }
      // Archive.read verified the closed envelope, including this fixed header line.
      if (params.role && chunk.markdown.split("\n", 6)[5] !== `Role: ${params.role}`) continue
      const content = literal?.exec(chunk.markdown)
      const title = literal?.exec(chunk.title)
      const rank = terms
        ? ArchiveSearch.rank(chunk.title, chunk.markdown, terms)
        : content || title
          ? {
              score: 0,
              field: content ? ("markdown" as const) : ("title" as const),
              snippet_offset: Math.max(0, (content?.index ?? title?.index ?? 0) - 40),
            }
          : undefined
      if (!rank) continue
      total++
      const candidate = { ...ref, ...rank }
      if (!terms) {
        if (total > offset && selected.length < limit) selected.push(candidate)
        continue
      }
      // Binary insertion retains only the best offset+limit descriptors, never snippets.
      let low = 0
      let high = selected.length
      while (low < high) {
        const middle = Math.floor((low + high) / 2)
        if (ArchiveSearch.compare(candidate, selected[middle]) < 0) {
          high = middle
          continue
        }
        low = middle + 1
      }
      if (low >= capacity) continue
      selected.splice(low, 0, candidate)
      if (selected.length > capacity) selected.pop()
    }
    if (offset > total) return { status: "unavailable", reason: "offset_out_of_range", total }
    const references: (Entry & { score?: number })[] = []
    for (const ref of terms ? selected.slice(offset) : selected) {
      const chunk = yield* archive.read({ sessionID, id: ref.id })
      if (!chunk) return { status: "unavailable", reason: "missing" }
      references.push({
        ...descriptor(ref),
        availability: "stored",
        field: ref.field,
        snippet_offset: ref.snippet_offset,
        snippet: (ref.field === "markdown" ? chunk.markdown : chunk.title).slice(
          ref.snippet_offset,
          ref.snippet_offset + 300,
        ),
        ...(terms ? { score: ref.score } : {}),
      })
    }
    const legacy =
      params.match === undefined &&
      params.offset === undefined &&
      params.role === undefined &&
      params.from_message === undefined &&
      params.through_message === undefined
    const page = () => ({
      status: total ? "found" : "not_found",
      extent: "archive_descriptors",
      order: terms ? "score_descending_source_descending_id_ascending" : "first_message_ascending",
      offset_unit: terms ? "ranked_references" : "references",
      snippet_offset_unit: "utf16_code_units",
      offset,
      total,
      retained: retained.length,
      complete: offset + references.length === total,
      ...(offset + references.length < total
        ? legacy
          ? { continuation: { archive_list: true } }
          : {
              next_offset: offset + references.length,
              continuation: { ...params, offset: offset + references.length },
            }
        : {}),
      references,
    })
    while (size(page()) > 8000 && references.length) references.pop()
    if (size(page()) > 8000 || (offset < total && !references.length))
      return { status: "unavailable", reason: "metadata_too_large" }
    return page()
  })
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

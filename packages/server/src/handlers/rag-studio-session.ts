import { Database } from "@orchestra/core/database/database"
import { Location } from "@orchestra/core/location"
import {
  RagChunkTable,
  RagPipelineTable,
  RagQuestionTable,
  RagRevisionSourceTable,
  RagRevisionTable,
  RagSourceTable,
  RagTraceTable,
} from "@orchestra/core/rag-studio/sql"
import { extract } from "@orchestra/rag-studio/extract"
import { memoryStore, noteBytes, withStore } from "@orchestra/rag-studio"
import type { Store } from "@orchestra/rag-studio"
import { eq, inArray } from "drizzle-orm"
import { Effect } from "effect"

export function session<A>(db: Database.Interface["db"], run: (store: Store, locationId: string) => Promise<A>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    const locationId = location.directory
    const sources = yield* db.select().from(RagSourceTable).where(eq(RagSourceTable.location_id, locationId)).all().pipe(Effect.orDie)
    const chunks = yield* db.select().from(RagChunkTable).where(eq(RagChunkTable.location_id, locationId)).all().pipe(Effect.orDie)
    const pipeline = yield* db
      .select()
      .from(RagPipelineTable)
      .where(eq(RagPipelineTable.location_id, locationId))
      .get()
      .pipe(Effect.orDie)
    const revisions = yield* db
      .select()
      .from(RagRevisionTable)
      .where(eq(RagRevisionTable.location_id, locationId))
      .all()
      .pipe(Effect.orDie)
    const revisionIds = revisions.map((row) => row.id)
    const members = revisionIds.length
      ? yield* db
          .select()
          .from(RagRevisionSourceTable)
          .where(inArray(RagRevisionSourceTable.revision_id, revisionIds))
          .all()
          .pipe(Effect.orDie)
      : []
    const questions = revisionIds.length
      ? yield* db.select().from(RagQuestionTable).where(inArray(RagQuestionTable.revision_id, revisionIds)).all().pipe(Effect.orDie)
      : []
    const questionIds = questions.map((row) => row.id)
    const traces = questionIds.length
      ? yield* db.select().from(RagTraceTable).where(inArray(RagTraceTable.question_id, questionIds)).all().pipe(Effect.orDie)
      : []
    const files = yield* Effect.promise(async () => {
      const next: Record<string, string | { failed: "no_text_layer"; bytes: string }> = {}
      for (const row of sources) {
        const read = await extract(row.path)
        if ("text" in read) next[row.path] = read.text
        if ("failed" in read && read.failed === "no_text_layer") next[row.path] = read
      }
      return next
    })
    const store = memoryStore({
      projectRoot: location.project.directory,
      locationRoot: location.directory,
      files,
    })
    if (pipeline?.blocked) store.fail(locationId)
    if (pipeline) {
      store.setPipeline(locationId, {
        parser: pipeline.parser,
        boundary: pipeline.boundary,
        tokenizer: pipeline.tokenizer,
        lexical: true,
        embedding: false,
        k: pipeline.k,
      })
    }
    for (const row of sources) {
      const read = files[row.path]
      store.putSource({
        id: row.id,
        locationId: row.location_id,
        path: row.path,
        contentHash: row.content_hash,
        status: status(row.status),
        text: typeof read === "string" ? read : "",
        reparsedHash: row.reparsed_hash,
      })
    }
    for (const row of chunks) {
      store.putChunk({
        id: row.id,
        sourceId: row.source_id,
        start: row.start,
        end: row.end,
        text: row.text,
        sourceHash: row.source_hash,
      })
      store.setChunkCut(row.id, row.boundary)
    }
    for (const row of revisions) {
      store.putRevision({
        id: row.id,
        locationId: row.location_id,
        snapshot: row.snapshot,
        pipelineHash: row.pipeline_hash,
        fill: row.fill === "failed" ? "failed" : "complete",
        parser: row.parser,
        boundary: row.boundary,
        tokenizer: row.tokenizer,
        k: row.k,
        members: members
          .filter((member) => member.revision_id === row.id)
          .map((member) => ({ sourceId: member.source_id, contentHash: member.content_hash })),
      })
    }
    for (const row of questions) {
      store.putQuestion({
        id: row.id,
        revisionId: row.revision_id,
        text: row.text,
        span: { sourceId: row.span_source_id, start: row.span_start, end: row.span_end },
      })
    }
    for (const row of traces) {
      store.putTrace({
        questionId: row.question_id,
        hits: JSON.parse(row.hits) as string[],
        dropped: JSON.parse(row.dropped) as string[],
        k: row.k ?? undefined,
      })
    }
    yield* Effect.promise(() => withStore(store, () => Promise.all(sources.map((row) => noteBytes(row.id)))))
    const result = yield* Effect.promise(() => withStore(store, () => run(store, locationId)))
    yield* save(db, store, locationId, revisionIds, questionIds)
    return result
  })
}

function save(
  db: Database.Interface["db"],
  store: Store,
  locationId: string,
  previousRevisionIds: string[],
  previousQuestionIds: string[],
) {
  return Effect.gen(function* () {
    if (previousQuestionIds.length) {
      yield* db.delete(RagTraceTable).where(inArray(RagTraceTable.question_id, previousQuestionIds)).run().pipe(Effect.orDie)
    }
    if (previousRevisionIds.length) {
      yield* db.delete(RagQuestionTable).where(inArray(RagQuestionTable.revision_id, previousRevisionIds)).run().pipe(Effect.orDie)
      yield* db
        .delete(RagRevisionSourceTable)
        .where(inArray(RagRevisionSourceTable.revision_id, previousRevisionIds))
        .run()
        .pipe(Effect.orDie)
    }
    yield* db.delete(RagRevisionTable).where(eq(RagRevisionTable.location_id, locationId)).run().pipe(Effect.orDie)
    yield* db.delete(RagChunkTable).where(eq(RagChunkTable.location_id, locationId)).run().pipe(Effect.orDie)
    yield* db.delete(RagSourceTable).where(eq(RagSourceTable.location_id, locationId)).run().pipe(Effect.orDie)
    yield* db.delete(RagPipelineTable).where(eq(RagPipelineTable.location_id, locationId)).run().pipe(Effect.orDie)
    const sources = store.sources().filter((row) => row.locationId === locationId)
    if (sources.length) {
      yield* db
        .insert(RagSourceTable)
        .values(
          sources.map((row) => ({
            id: row.id,
            location_id: row.locationId,
            path: row.path,
            content_hash: row.contentHash,
            status: row.status,
            reparsed_hash: row.reparsedHash ?? null,
          })),
        )
        .run()
        .pipe(Effect.orDie)
    }
    const chunks = store.chunks()
    if (chunks.length) {
      yield* db
        .insert(RagChunkTable)
        .values(
          chunks.map((chunk) => ({
            id: chunk.id,
            source_id: chunk.sourceId,
            location_id: locationId,
            start: chunk.start,
            end: chunk.end,
            text: chunk.text,
            source_hash: chunk.sourceHash,
            boundary: store.chunkCut(chunk.id),
          })),
        )
        .run()
        .pipe(Effect.orDie)
    }
    const pipeline = store.pipeline(locationId)
    yield* db
      .insert(RagPipelineTable)
      .values({
        location_id: locationId,
        parser: pipeline.parser,
        boundary: pipeline.boundary,
        tokenizer: pipeline.tokenizer,
        k: pipeline.k,
        blocked: store.failed(locationId) ? 1 : 0,
      })
      .run()
      .pipe(Effect.orDie)
    const revisions = store.revisions().filter((row) => row.locationId === locationId)
    if (revisions.length) {
      yield* db
        .insert(RagRevisionTable)
        .values(
          revisions.map((row) => ({
            id: row.id,
            location_id: row.locationId,
            snapshot: row.snapshot,
            pipeline_hash: row.pipelineHash,
            fill: row.fill,
            parser: row.parser ?? pipeline.parser,
            boundary: row.boundary ?? pipeline.boundary,
            tokenizer: row.tokenizer ?? pipeline.tokenizer,
            k: row.k ?? pipeline.k,
          })),
        )
        .run()
        .pipe(Effect.orDie)
      const members = revisions.flatMap((row) =>
        row.members.map((member) => ({
          revision_id: row.id,
          source_id: member.sourceId,
          content_hash: member.contentHash,
        })),
      )
      if (members.length) yield* db.insert(RagRevisionSourceTable).values(members).run().pipe(Effect.orDie)
    }
    const revisionIds = new Set(revisions.map((row) => row.id))
    const questions = store.questions().filter((row) => revisionIds.has(row.revisionId))
    if (questions.length) {
      yield* db
        .insert(RagQuestionTable)
        .values(
          questions.map((row) => ({
            id: row.id,
            revision_id: row.revisionId,
            text: row.text,
            span_source_id: row.span.sourceId,
            span_start: row.span.start,
            span_end: row.span.end,
          })),
        )
        .run()
        .pipe(Effect.orDie)
    }
    const questionIds = new Set(questions.map((row) => row.id))
    const traces = [...questionIds].flatMap((id) => {
      const trace = store.trace(id)
      return trace ? [trace] : []
    })
    if (traces.length) {
      yield* db
        .insert(RagTraceTable)
        .values(
          traces.map((row) => ({
            question_id: row.questionId,
            hits: JSON.stringify(row.hits),
            dropped: JSON.stringify(row.dropped),
            k: row.k ?? null,
          })),
        )
        .run()
        .pipe(Effect.orDie)
    }
  })
}

function status(value: string) {
  if (value === "read" || value === "failed" || value === "not_yet_read") return value
  return "not_yet_read" as const
}

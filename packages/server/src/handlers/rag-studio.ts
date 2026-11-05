import {
  admit,
  ask,
  citationProof,
  compareRevisions,
  enableEmbedding,
  listSources,
  openRevision,
  parseSource,
  readPipeline,
  readRevision,
  removeSource,
  retrievalProof,
  runPass,
  runPasses,
  saveQuestion,
  searchWords,
  setPipeline,
} from "@orchestra/rag-studio"
import { Database } from "@orchestra/core/database/database"
import { extract } from "@orchestra/rag-studio/extract"
import type { Store } from "@orchestra/rag-studio"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"
import { session } from "./rag-studio-session"

const rejected = new InvalidRequestError({ message: "rejected" })

function call<A>(db: Database.Interface["db"], run: (store: Store, locationId: string) => Promise<A>) {
  return session(db, async (store, locationId) => {
    try {
      return await run(store, locationId)
    } catch (error) {
      if (error instanceof Error && error.message === "rejected") return { refused: "rejected" as const }
      throw error
    }
  }).pipe(
    Effect.flatMap((result) =>
      result && typeof result === "object" && "refused" in result && result.refused === "rejected"
        ? Effect.fail(rejected)
        : Effect.succeed(result as A),
    ),
  )
}

export const RagStudioHandler = HttpApiBuilder.group(Api, "server.ragStudio", (handlers) =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    return handlers
    .handle("ragStudio.sources", () => response(call(db, (_store, id) => listSources(id))))
    .handle("ragStudio.pipeline", () => response(call(db, (_store, id) => readPipeline(id))))
    .handle("ragStudio.admit", (ctx) =>
      response(
        call(db, async (store, id) => {
          const read = await extract(ctx.payload.path)
          if ("text" in read) store.writeFile(ctx.payload.path, read.text)
          if ("failed" in read && read.failed === "no_text_layer") store.writeFile(ctx.payload.path, read)
          return admit({ locationId: id, path: ctx.payload.path })
        }),
      ),
    )
    .handle("ragStudio.parse", (ctx) => response(call(db, () => parseSource(ctx.params.sourceId))))
    .handle("ragStudio.remove", (ctx) =>
      call(db, () => removeSource(ctx.params.sourceId)).pipe(Effect.as(HttpApiSchema.NoContent.make())),
    )
    .handle("ragStudio.pipelineUpdate", (ctx) =>
      response(call(db, (_store, id) => setPipeline(id, ctx.payload.field, ctx.payload.value))),
    )
    .handle("ragStudio.revision", () =>
      response(
        call(db, async (_store, id) => {
          const revision = await openRevision(id)
          return {
            id: revision.id,
            snapshot: revision.snapshot,
            pipelineHash: revision.pipelineHash,
            fill: revision.fill,
          }
        }),
      ),
    )
    .handle("ragStudio.revisionRead", (ctx) => response(call(db, () => readRevision(ctx.params.revisionId))))
    .handle("ragStudio.search", (ctx) => response(call(db, () => searchWords(ctx.payload.revisionId, ctx.payload.word))))
    .handle("ragStudio.ask", (ctx) => response(call(db, () => ask(ctx.payload.revisionId, ctx.payload.text))))
    .handle("ragStudio.question", (ctx) =>
      response(call(db, () => saveQuestion(ctx.payload.revisionId, ctx.payload.text, ctx.payload.span))),
    )
    .handle("ragStudio.retrieval", (ctx) =>
      response(call(db, async () => ({ ok: await retrievalProof(ctx.params.questionId, ctx.payload.revisionId) }))),
    )
    .handle("ragStudio.citation", (ctx) =>
      response(call(db, async () => ({ ok: await citationProof(ctx.params.questionId, ctx.payload.sentence) }))),
    )
    .handle("ragStudio.compare", (ctx) =>
      response(call(db, () => compareRevisions(ctx.payload.leftId, ctx.payload.rightId, ctx.payload.proofSetId))),
    )
    .handle("ragStudio.embedding", () => response(call(db, () => enableEmbedding())))
    .handle("ragStudio.pass", (ctx) => response(call(db, () => runPass(ctx.payload.pass, ctx.payload.sourceId))))
    .handle("ragStudio.passes", (ctx) => response(call(db, () => runPasses([...ctx.payload.passes]))))
    .handle("ragStudio.source", (ctx) =>
      response(
        call(db, async (store) => {
          const found = store.sources().find((row) => row.id === ctx.params.sourceId)
          if (!found) throw new Error("rejected")
          return {
            source: {
              id: found.id,
              locationId: found.locationId,
              path: found.path,
              contentHash: found.contentHash,
              status: found.status,
            },
            text: found.text,
            chunks: store.chunks().filter((chunk) => chunk.sourceId === found.id),
          }
        }),
      ),
    )
  }),
)

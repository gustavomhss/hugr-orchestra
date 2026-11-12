import { Integration } from "@orchestra/core/integration"
import {
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
  withEncoder,
  type Encoder,
} from "@orchestra/rag-studio"
import { Database } from "@orchestra/core/database/database"
import type { Store } from "@orchestra/rag-studio"
import { InvalidRequestError } from "@orchestra/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"
import { admitFile, session } from "./rag-studio-session"

const rejected = new InvalidRequestError({ message: "rejected" })

function call<A>(db: Database.Interface["db"], run: (store: Store, locationId: string) => Promise<A>, encoder?: Encoder) {
  return session(db, async (store, locationId) => {
    const work = () => run(store, locationId)
    try {
      return await (encoder ? withEncoder(encoder, work) : work())
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
    const bound = <A>(run: (store: Store, locationId: string) => Promise<A>) =>
      Effect.gen(function* () {
        const integrations = yield* Integration.Service
        const key = yield* openRouterKey(integrations)
        return yield* call(db, run, key ? openRouterEncoder(key) : undefined)
      })
    return handlers
    .handle("ragStudio.sources", () => response(bound( (_store, id) => listSources(id))))
    .handle("ragStudio.pipeline", () => response(bound( (_store, id) => readPipeline(id))))
    .handle("ragStudio.admit", (ctx) =>
      response(bound((store, id) => admitFile(store, id, ctx.payload.path))),
    )
    .handle("ragStudio.parse", (ctx) => response(bound( () => parseSource(ctx.params.sourceId))))
    .handle("ragStudio.remove", (ctx) =>
      bound( () => removeSource(ctx.params.sourceId)).pipe(Effect.as(HttpApiSchema.NoContent.make())),
    )
    .handle("ragStudio.pipelineUpdate", (ctx) =>
      response(bound( (_store, id) => setPipeline(id, ctx.payload.field, ctx.payload.value))),
    )
    .handle("ragStudio.revision", () =>
      response(
        bound( async (_store, id) => {
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
    .handle("ragStudio.revisionRead", (ctx) => response(bound( () => readRevision(ctx.params.revisionId))))
    .handle("ragStudio.search", (ctx) => response(bound( () => searchWords(ctx.payload.revisionId, ctx.payload.word))))
    .handle("ragStudio.ask", (ctx) => response(bound( () => ask(ctx.payload.revisionId, ctx.payload.text))))
    .handle("ragStudio.question", (ctx) =>
      response(bound( () => saveQuestion(ctx.payload.revisionId, ctx.payload.text, ctx.payload.span))),
    )
    .handle("ragStudio.retrieval", (ctx) =>
      response(bound( async () => ({ ok: await retrievalProof(ctx.params.questionId, ctx.payload.revisionId) }))),
    )
    .handle("ragStudio.citation", (ctx) =>
      response(bound( async () => ({ ok: await citationProof(ctx.params.questionId, ctx.payload.sentence) }))),
    )
    .handle("ragStudio.compare", (ctx) =>
      response(bound( () => compareRevisions(ctx.payload.leftId, ctx.payload.rightId, ctx.payload.proofSetId))),
    )
    .handle("ragStudio.embedding", () => response(bound( () => enableEmbedding())))
    .handle("ragStudio.pass", (ctx) => response(bound( () => runPass(ctx.payload.pass, ctx.payload.sourceId))))
    .handle("ragStudio.passes", (ctx) => response(bound( () => runPasses([...ctx.payload.passes]))))
    .handle("ragStudio.source", (ctx) =>
      response(
        bound( async (store) => {
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

function openRouterKey(integrations: Integration.Interface) {
  return Effect.gen(function* () {
    const connection = yield* integrations.connection
      .active(Integration.ID.make("openrouter"))
      .pipe(Effect.orElseSucceed(() => undefined))
    if (!connection) return undefined
    const resolved = yield* integrations.connection.resolve(connection).pipe(Effect.orElseSucceed(() => undefined))
    if (!resolved || resolved.type !== "key") return undefined
    return resolved.key
  })
}

function openRouterEncoder(key: string): Encoder {
  return async ({ model, texts }) => {
    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, input: texts }),
    })
    if (!response.ok) throw new Error("rejected")
    const body = (await response.json()) as { data?: Array<{ embedding?: number[]; index?: number }> }
    const rows = body.data ?? []
    return texts.map((_, index) => {
      const row = rows.find((item) => item.index === index) ?? rows[index]
      if (!row?.embedding) throw new Error("rejected")
      return row.embedding
    })
  }
}

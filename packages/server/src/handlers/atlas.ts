import { Atlas } from "@orchestra/core/atlas"
import { Catalog } from "@orchestra/core/catalog"
import { Integration } from "@orchestra/core/integration"
import { Location } from "@orchestra/core/location"
import { Npm } from "@orchestra/core/npm"
import { AppProcess } from "@orchestra/core/process"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { LLM, LLMClient, LLMEvent, SystemPart } from "@orchestra/llm"
import { ServiceUnavailableError } from "@orchestra/protocol/errors"
import { SessionID } from "@orchestra/schema/session-id"
import { Effect, Stream } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

// The Atlas screen over the requested Location's store, through the same surface the legacy instance routes open
// (@orchestra/core/atlas). The store root is the Location's project worktree, or its directory when the project has no
// worktree. Delegation and mining resolve the chosen model from the Location's catalog, outside any Session.
export const AtlasHandler = HttpApiBuilder.group(Api, "server.atlas", (handlers) =>
  Effect.gen(function* () {
    const dependencies = { npm: yield* Npm.Service, processes: yield* AppProcess.Service }
    const client = yield* LLMClient.Service
    const unavailable = (error: Atlas.Unavailable) =>
      new ServiceUnavailableError({ service: "atlas", message: error.message })
    const at = <A, R>(call: (atlas: Atlas.Interface) => Effect.Effect<A, Atlas.Unavailable, R>) =>
      response(
        Effect.gen(function* () {
          const location = yield* Location.Service
          return yield* call(
            Atlas.open(
              dependencies,
              Atlas.storeRoot(location.project.directory, location.directory),
              location.project.id,
            ),
          )
        }).pipe(Effect.mapError(unavailable)),
      )
    // One plain call to the chosen model; `system` keeps the model off its general coding prompt. The Location's catalog
    // and integrations are read per request, so the returned Effect needs nothing more.
    const model = Effect.fn(function* (providerID: string, modelID: string, system: string) {
      const catalog = yield* Catalog.Service
      const integrations = yield* Integration.Service
      return Effect.gen(function* () {
        const selected = (yield* catalog.model.available()).find(
          (item) => item.providerID === providerID && item.id === modelID,
        )
        if (!selected) return yield* Effect.fail(new Error(`Model unavailable: ${providerID}/${modelID}`))
        const resolved = yield* SessionRunnerModel.fromCatalogModel(
          selected,
          yield* SessionRunnerModel.credential(catalog, integrations, selected),
        )
        return (prompt: string) => {
          // Gateways such as OpenCode Go refuse a request without a session to route it by; each call is its own.
          const sessionID = SessionID.descending()
          return client
            .stream(
              LLM.request({
                model: resolved,
                http: { headers: { "x-session-affinity": sessionID, "X-Session-Id": sessionID } },
                system: [SystemPart.make(system)],
                prompt,
              }),
            )
            .pipe(
              Stream.filter(LLMEvent.is.textDelta),
              Stream.map((event) => event.text),
              Stream.mkString,
            )
        }
      })
    })
    return handlers
      .handle("atlas.snapshot", () => at((atlas) => atlas.snapshot()))
      .handle("atlas.reasoning", (ctx) => at((atlas) => atlas.reasoning(ctx.params.id)))
      .handle("atlas.own", (ctx) => at((atlas) => atlas.own(ctx.query.scope)))
      .handle("atlas.health", () => at((atlas) => atlas.health()))
      .handle("atlas.promote", (ctx) => at((atlas) => atlas.promote(ctx.payload)))
      .handle("atlas.draft", (ctx) => at((atlas) => atlas.draft(ctx.payload)))
      .handle("atlas.emit", (ctx) => at((atlas) => atlas.emit(ctx.payload)))
      .handle("atlas.link", (ctx) => at((atlas) => atlas.link(ctx.payload)))
      .handle("atlas.verify", (ctx) => at((atlas) => atlas.verify(ctx.payload)))
      .handle("atlas.review", () => at((atlas) => atlas.review()))
      .handle("atlas.hold", (ctx) => at((atlas) => atlas.hold(ctx.payload)))
      .handle("atlas.release", (ctx) => at((atlas) => atlas.release(ctx.payload)))
      .handle("atlas.propose", (ctx) => at((atlas) => atlas.propose(ctx.payload)))
      .handle("atlas.decide", (ctx) => at((atlas) => atlas.decide(ctx.payload)))
      .handle("atlas.answer", (ctx) => at((atlas) => atlas.answer(ctx.payload)))
      .handle("atlas.memoryDecide", (ctx) => at((atlas) => atlas.memoryDecide(ctx.payload)))
      .handle("atlas.territory", (ctx) => at((atlas) => atlas.territory(ctx.payload)))
      .handle("atlas.install", () => at((atlas) => atlas.install()))
      .handle("atlas.index", () => at((atlas) => atlas.index()))
      .handle("atlas.delegate", (ctx) =>
        Effect.gen(function* () {
          const ask = yield* model(ctx.payload.providerID, ctx.payload.modelID, Atlas.DELEGATE_SYSTEM)
          return yield* at((atlas) =>
            Atlas.delegate(
              {
                atlas,
                draft: (prompt) =>
                  ask.pipe(
                    Effect.flatMap((call) => call(prompt)),
                    Effect.map(Atlas.decodeReply),
                  ),
              },
              ctx.payload,
            ),
          )
        }),
      )
      .handle("atlas.mine", (ctx) =>
        Effect.gen(function* () {
          const ask = yield* model(ctx.payload.providerID, ctx.payload.modelID, Atlas.MINE_SYSTEM)
          return yield* at((atlas) => Atlas.mine({ atlas, model: ask }, ctx.payload))
        }),
      )
  }),
)

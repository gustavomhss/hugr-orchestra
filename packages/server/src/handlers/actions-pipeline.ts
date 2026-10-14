import { Actions } from "@orchestra/core/actions"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { bindingRef, result } from "./actions-common"

export const ActionsPipelineHandler = HttpApiBuilder.group(Api, "server.actionsPipeline", (handlers) => Effect.succeed(
  handlers
    .handle("actions.pipeline.mergeRequest", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "pipeline.mergeRequest", ctx.payload, { resourceID: ctx.params.mergeRequestID })
    })))
    .handle("actions.pipeline.trigger", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "pipeline.trigger", ctx.payload, { ref: ctx.payload.input.ref })
    }))),
))

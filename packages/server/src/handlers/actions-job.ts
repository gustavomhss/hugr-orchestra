import { Actions } from "@orchestra/core/actions"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { bindingRef, result } from "./actions-common"

export const ActionsJobHandler = HttpApiBuilder.group(Api, "server.actionsJob", (handlers) => Effect.succeed(
  handlers
    .handle("actions.job.retry", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "job.retry", ctx.payload, { jobID: ctx.params.jobID })
    })))
    .handle("actions.job.play", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "job.play", ctx.payload, { jobID: ctx.params.jobID })
    })))
    .handle("actions.job.cancel", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "job.cancel", ctx.payload, { jobID: ctx.params.jobID })
    })))
    .handle("actions.job.erase", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "job.erase", ctx.payload, { jobID: ctx.params.jobID })
    }))),
))

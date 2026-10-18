import { Actions } from "@orchestra/core/actions"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { bindingRef, result } from "./actions-common"

export const ActionsOperationHandler = HttpApiBuilder.group(Api, "server.actionsOperation", (handlers) => Effect.succeed(
  handlers
    .handle("actions.operation.prepare", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.prepare(bindingRef(ctx), ctx.payload)
    })))
    .handle("actions.operation.get", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.operation(bindingRef(ctx), ctx.params.operationID)
    })))
    .handle("actions.operation.reconcile", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.reconcile(bindingRef(ctx), ctx.params.operationID)
    }))),
))

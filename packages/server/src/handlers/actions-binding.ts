import { Actions } from "@orchestra/core/actions"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { bindingRef, result } from "./actions-common"

export const ActionsBindingHandler = HttpApiBuilder.group(Api, "server.actionsBinding", (handlers) => Effect.succeed(
  handlers
    .handle("actions.binding.list", () => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.bindings.list()
    })))
    .handle("actions.binding.create", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.bindings.create(ctx.payload)
    })))
    .handle("actions.binding.get", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.bindings.get(bindingRef(ctx))
    })))
    .handle("actions.binding.update", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      if (ctx.payload.expectedRevision !== undefined && ctx.payload.expectedRevision !== ctx.query.revision)
        return yield* new Actions.ActionsError({ kind: "binding_stale", message: "Binding update revision differs from the selected revision" })
      return yield* actions.bindings.update(ctx.params.bindingID, { ...ctx.payload, expectedRevision: ctx.query.revision })
    })))
    .handle("actions.binding.remove", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.bindings.remove(bindingRef(ctx))
    })))
    .handle("actions.binding.capabilities", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.capabilities(bindingRef(ctx))
    })))
    .handle("actions.binding.policy", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.bindings.policy(bindingRef(ctx))
    })))
    .handle("actions.binding.updatePolicy", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.bindings.updatePolicy(bindingRef(ctx), ctx.payload)
    }))),
))

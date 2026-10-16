import { Actions } from "@orchestra/core/actions"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { bindingRef, result } from "./actions-common"

export const ActionsSourceHandler = HttpApiBuilder.group(Api, "server.actionsSource", (handlers) => Effect.succeed(
  handlers
    .handle("actions.source.base", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.sourceBase(bindingRef(ctx), ctx.query.ref)
    })))
    .handle("actions.source.validateDraft", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.validateDraft(bindingRef(ctx), ctx.payload.base, ctx.payload.path, ctx.payload.draft)
    })))
    .handle("actions.source.validate", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.validateSource(bindingRef(ctx), ctx.payload.source, ctx.payload.draft)
    })))
    .handle("actions.source.command", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      const kind = ctx.params.action === "branch" ? "source.branch" : ctx.params.action === "review" ? "source.review" : "source.write"
      return yield* actions.execute(bindingRef(ctx), kind, ctx.payload, {})
    }))),
))

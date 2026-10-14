import { Actions } from "@orchestra/core/actions"
import type { OperationKind } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { bindingRef, result } from "./actions-common"

export const ActionsResourceHandler = HttpApiBuilder.group(Api, "server.actionsResource", (handlers) => Effect.succeed(
  handlers
    .handle("actions.resource.list", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.resources(bindingRef(ctx), {
        kind: ctx.query.kind, runID: ctx.query.runID, resourceID: ctx.query.resourceID, scope: ctx.query.scope,
        ref: ctx.query.ref, query: ctx.query.query, cursor: ctx.query.cursor, limit: ctx.query.limit,
      })
    })))
    .handle("actions.resource.command", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      const resourceKind = ctx.params.resourceKind
      const action = ctx.params.action
      const kind: OperationKind = action === "clear" ? "cache.clear"
        : action === "keep" ? "artifact.keep"
        : action === "play" ? resourceKind === "environments" ? "deployment.review" : "schedule.play"
        : action === "create" ? resourceKind === "runners" ? "runner.register" : "resource.create"
        : action === "delete" ? resourceKind === "runners" ? "runner.remove" : "resource.delete" : "resource.update"
      return yield* actions.execute(bindingRef(ctx), kind, ctx.payload, { resourceKind })
    }))),
))

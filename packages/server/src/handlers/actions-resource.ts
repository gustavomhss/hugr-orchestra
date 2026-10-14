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
        kind: ctx.query.kind,
        ...(ctx.query.runID === undefined ? {} : { runID: ctx.query.runID }),
        ...(ctx.query.resourceID === undefined ? {} : { resourceID: ctx.query.resourceID }),
        ...(ctx.query.scope === undefined ? {} : { scope: ctx.query.scope }),
        ...(ctx.query.ref === undefined ? {} : { ref: ctx.query.ref }),
        ...(ctx.query.query === undefined ? {} : { query: ctx.query.query }),
        ...(ctx.query.cursor === undefined ? {} : { cursor: ctx.query.cursor }),
        ...(ctx.query.limit === undefined ? {} : { limit: ctx.query.limit }),
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

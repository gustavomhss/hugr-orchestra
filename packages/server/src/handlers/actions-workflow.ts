import { Actions } from "@orchestra/core/actions"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { bindingRef, result } from "./actions-common"

export const ActionsWorkflowHandler = HttpApiBuilder.group(Api, "server.actionsWorkflow", (handlers) => Effect.succeed(
  handlers
    .handle("actions.workflow.list", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.workflows(bindingRef(ctx), {
        cursor: ctx.query.cursor, limit: ctx.query.limit, query: ctx.query.query, state: ctx.query.state,
      })
    })))
    .handle("actions.workflow.source", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.source(bindingRef(ctx), { path: ctx.query.path, ref: ctx.query.ref })
    })))
    .handle("actions.workflow.graph", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.graph(bindingRef(ctx), { path: ctx.query.path, ref: ctx.query.ref })
    })))
    .handle("actions.workflow.dispatch", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "workflow.dispatch", ctx.payload, { workflowID: ctx.params.workflowID })
    })))
    .handle("actions.workflow.state", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), ctx.payload.input.enabled ? "workflow.enable" : "workflow.disable", ctx.payload,
        { workflowID: ctx.params.workflowID })
    }))),
))

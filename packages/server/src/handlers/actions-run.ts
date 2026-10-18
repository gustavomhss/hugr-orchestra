import { Actions } from "@orchestra/core/actions"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { bindingRef, result } from "./actions-common"

export const ActionsRunHandler = HttpApiBuilder.group(Api, "server.actionsRun", (handlers) => Effect.succeed(
  handlers
    .handle("actions.run.list", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.runs(bindingRef(ctx), {
        workflowID: ctx.query.workflowID, cursor: ctx.query.cursor, limit: ctx.query.limit,
        ref: ctx.query.ref, event: ctx.query.event, status: ctx.query.status, commit: ctx.query.commit,
        actor: ctx.query.actor, created: ctx.query.created, createdAfter: ctx.query.createdAfter,
        createdBefore: ctx.query.createdBefore, updatedAfter: ctx.query.updatedAfter, updatedBefore: ctx.query.updatedBefore,
      })
    })))
    .handle("actions.run.get", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.run(bindingRef(ctx), ctx.params.runID)
    })))
    .handle("actions.run.jobs", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.jobs(bindingRef(ctx), { runID: ctx.params.runID, attempt: ctx.query.attempt, cursor: ctx.query.cursor })
    })))
    .handle("actions.run.retry", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), ctx.payload.input.provider === "github" && ctx.payload.input.mode === "failed" ? "run.retryFailed" : "run.retry",
        ctx.payload, { runID: ctx.params.runID })
    })))
    .handle("actions.run.cancel", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "run.cancel", ctx.payload, { runID: ctx.params.runID })
    })))
    .handle("actions.run.forceCancel", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "run.forceCancel", ctx.payload, { runID: ctx.params.runID })
    })))
    .handle("actions.run.remove", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "run.delete", ctx.payload, { runID: ctx.params.runID })
    })))
    .handle("actions.run.approveFork", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "run.approveFork", ctx.payload, { runID: ctx.params.runID })
    })))
    .handle("actions.run.rename", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.execute(bindingRef(ctx), "run.rename", ctx.payload, { runID: ctx.params.runID })
    }))),
))

import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { check, stable } from "./assertions"
import { readOperation, rejected, seedCommand } from "./actions-checks"
import { actionPath, actionsRequest, decodeLocation, nativeCalls, seedBinding } from "./actions-fixture"
import { runID, workflowPath } from "./actions-native-data"
import { http } from "./dsl"
import type { Scenario } from "./types"

export const dispatchTarget = { workflowID: "42", path: workflowPath, ref: "main" }
const operationPath = "/api/actions/operation/{bindingID}/{operationID}"

export const actionsOperationScenarios: Scenario[] = [
  http.protected.post("/api/actions/operation/{bindingID}", "actions.operation.prepare").mutating()
    .seeded((ctx) => Effect.gen(function* () {
      const native = yield* seedBinding(ctx)
      return { ...native, intent: Actions.OperationIntent.make({ clientID: crypto.randomUUID(), binding: native.ref,
        kind: "workflow.dispatch", target: dispatchTarget, expected: { commit: native.commit, sourceVersion: native.blob } }) }
    }))
    .at((ctx) => ({ path: actionPath("/api/actions/operation/{bindingID}", ctx.state.ref), headers: ctx.headers(), body: ctx.state.intent }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const operation = decodeLocation(Actions.Operation, body, ctx.state)
      check(operation.state === "prepared" && operation.bindingID === ctx.state.binding.id && operation.kind === "workflow.dispatch", "HTTP prepare must durably admit native intent")
      check(stable(operation.target) === stable(dispatchTarget) && operation.clientID === ctx.state.intent.clientID, "admission must preserve client/target identity")
      const stored = yield* actionsRequest(ctx, "GET", actionPath(operationPath, ctx.state.ref, { operationID: operation.id }))
      check(stored.status === 200 && stable(decodeLocation(Actions.Operation, stored.body, ctx.state)) === stable(operation), "admitted receipt must be durable before execution")
      const retry = yield* actionsRequest(ctx, "POST", actionPath("/api/actions/operation/{bindingID}", ctx.state.ref), ctx.state.intent)
      check(retry.status === 200 && stable(decodeLocation(Actions.Operation, retry.body, ctx.state)) === stable(operation), "exact HTTP retry must return same durable ID")
      rejected(yield* actionsRequest(ctx, "POST", actionPath("/api/actions/operation/{bindingID}", ctx.state.ref),
        { ...ctx.state.intent, target: { ...dispatchTarget, workflowID: "43" } }), "intent_conflict")
      check((yield* nativeCalls(ctx.state)).length === 2, "admission, readback and conflicting retry must not contact provider")
    }), "status"),
  http.protected.get(operationPath, "actions.operation.get")
    .seeded((ctx) => seedCommand(ctx, "workflow.dispatch", dispatchTarget))
    .at((ctx) => ({ path: actionPath(operationPath, ctx.state.ref, { operationID: ctx.state.operation.id }), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      check(stable(decodeLocation(Actions.Operation, body, ctx.state)) === stable(ctx.state.operation), "operation GET must return exact admitted receipt")
      check((yield* nativeCalls(ctx.state)).length === 2, "durable operation GET must not execute native command")
    }), "status"),
  http.protected.post(operationPath + "/reconcile", "actions.operation.reconcile").mutating()
    .seeded((ctx) => Effect.gen(function* () {
      const native = yield* seedCommand(ctx, "workflow.dispatch", dispatchTarget)
      const result = yield* actionsRequest(ctx, "POST", actionPath("/api/actions/workflow/{bindingID}/{workflowID}/dispatch", native.ref,
        { workflowID: "42" }), { id: native.operation.id, input: { provider: "github", ref: "main" } })
      check(result.status === 200, `ActionsFixtureError:dispatch-for-reconcile:${result.text}`)
      check(decodeLocation(Actions.CommandExecution, result.body, native).operation.state === "accepted", "reconcile seed must execute actual native adapter")
      return native
    }))
    .at((ctx) => ({ path: actionPath(operationPath + "/reconcile", ctx.state.ref, { operationID: ctx.state.operation.id }), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const operation = decodeLocation(Actions.Operation, body, ctx.state)
      check(operation.id === ctx.state.operation.id && operation.state === "confirmed" && operation.result?.runID === runID, "native observation must confirm same durable operation/run")
      check(stable(yield* readOperation(ctx, ctx.state)) === stable(operation), "confirmation must persist before HTTP reply")
      check((yield* nativeCalls(ctx.state)).filter((call) => call.method !== "GET").length === 1, "reconcile must not resend accepted command")
    }), "status"),
]

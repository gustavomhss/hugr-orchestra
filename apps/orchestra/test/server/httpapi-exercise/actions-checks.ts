import { ActionsApiError } from "@orchestra/protocol/groups/actions-common"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { check, stable } from "./assertions"
import { actionPath, actionsRequest, decodeLocation, nativeCalls, prepareActions, seedBinding } from "./actions-fixture"
import type { CallResult, ScenarioContext } from "./types"

export function seedCommand(ctx: ScenarioContext, kind: Actions.OperationKind, target: Actions.OperationTarget, state = "completed") {
  return Effect.gen(function* () {
    const native = yield* seedBinding(ctx, state)
    const expected = target.resourceKind ? undefined : kind.startsWith("workflow.") || kind.startsWith("source.")
      ? { commit: native.commit, sourceVersion: native.blob } : { commit: native.commit, attempt: 4 }
    return yield* prepareActions(ctx, native, kind, target, expected)
  })
}

export function actionsError(body: unknown, kind: Actions.ErrorKind, message?: string) {
  const error = Schema.decodeUnknownSync(ActionsApiError, { onExcessProperty: "error" })(body)
  check(error.kind === kind, `expected Actions error ${kind}, got ${error.kind}`)
  if (message !== undefined) check(error.message === message, "Actions failure must retain its declared domain boundary")
  check(stable(Schema.encodeSync(ActionsApiError)(error)) === stable(body), "Actions errors must be flat protocol errors")
  return error
}

export function rejected(result: CallResult, kind: Actions.ErrorKind, message?: string) {
  check(result.status === 400, `expected Actions 400, got ${result.status}: ${result.text}`)
  return actionsError(result.body, kind, message)
}

export function readOperation(ctx: ScenarioContext, native: Effect.Success<ReturnType<typeof prepareActions>>) {
  return Effect.gen(function* () {
    const result = yield* actionsRequest(ctx, "GET", actionPath("/api/actions/operation/{bindingID}/{operationID}", native.ref,
      { operationID: native.operation.id }))
    check(result.status === 200, `durable operation read failed: ${result.text}`)
    return decodeLocation(Actions.Operation, result.body, native)
  })
}

export function commandReceipt(body: unknown, ctx: ScenarioContext, native: Effect.Success<ReturnType<typeof prepareActions>>,
  write: { method: string; endpoint: string }, acknowledgement: Actions.OperationAcknowledgement) {
  return Effect.gen(function* () {
    const result = decodeLocation(Actions.CommandExecution, body, native)
    check(result.operation.id === native.operation.id && result.operation.state === "accepted", "native command must retain admitted ID and persist accepted receipt")
    check(result.operation.bindingID === native.binding.id && result.operation.kind === native.intent.kind &&
      result.operation.clientID === native.intent.clientID && stable(result.operation.target) === stable(native.intent.target), "command receipt must retain frozen binding/client/kind/target")
    check(stable(result.operation.result) === stable(acknowledgement), "native acknowledgement must retain exact immutable IDs")
    check(result.output === undefined, "command fixture must not invent one-time output")
    check(stable(yield* readOperation(ctx, native)) === stable(result.operation), "HTTP receipt must equal durable readback")
    const calls = yield* nativeCalls(native)
    const writes = calls.filter((call) => call.method !== "GET")
    check(writes.length === 1 && writes[0].method === write.method && writes[0].endpoint === write.endpoint, "production adapter must send exactly admitted native command")
  })
}

export function commandFailure(body: unknown, ctx: ScenarioContext, native: Effect.Success<ReturnType<typeof prepareActions>>,
  kind: Actions.ErrorKind, message: string) {
  return Effect.gen(function* () {
    const error = actionsError(body, kind, message)
    check(error.disposition === "definitely_unsent", "preflight failure must prove no native send")
    const stored = yield* readOperation(ctx, native)
    check(stored.state === "rejected" && stored.id === native.operation.id, "definitive command refusal must durably reject admitted ID")
    check(stored.bindingID === native.binding.id && stable(stored.target) === stable(native.intent.target), "rejected receipt must retain admitted binding/target")
    check(stored.reason === "Provider command was definitely not sent", "durable rejection must retain unsent disposition without mutation payload")
    check((yield* nativeCalls(native)).every((call) => call.method === "GET"), "typed command failure must not send native writes")
  })
}

import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { eq } from "drizzle-orm"
import { Cause, Effect, Exit, Option, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ActionsError } from "../../src/actions/error"
import { ActionsOperationTable } from "../../src/actions/operations/sql"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { testEffect } from "../lib/effect"
import { fault, fixture, intent, open } from "./operations-fixture"

const it = testEffect(LayerNode.compile(AppProcess.node))

it.live("safe native acknowledgement survives SQLite, service rebuild and duplicate execute without input persistence", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const command = intent(service.binding)
  const lease = yield* service.operations.prepare(service.binding, command)
  const processService = yield* AppProcess.Service
  const calls: number[] = []
  const accepted = yield* service.operations.execute(service.binding, { id: lease.id, input: { source: "secret-source-body" } }, (admitted, payload) => Effect.gen(function* () {
    calls.push(1)
    expect(admitted).toEqual(command)
    expect(payload).toEqual({ source: "secret-source-body" })
    const native = yield* processService.run(ChildProcess.make(process.execPath, [
      "-e", 'process.stdout.write(JSON.stringify({ runID: "native-returned-run", attempt: 4, unattributed: false }))',
    ]), { timeout: "10 seconds", maxOutputBytes: 4096, maxErrorBytes: 4096 }).pipe(Effect.orDie)
    expect(native.exitCode).toBe(0)
    return Schema.decodeUnknownSync(Schema.fromJsonString(Actions.OperationAcknowledgement))(native.stdout.toString())
  }))
  expect(accepted).toMatchObject({ state: "accepted", result: { runID: "native-returned-run", attempt: 4, unattributed: false } })
  const rebuilt = yield* open(f.database, f.directory)
  expect(yield* rebuilt.operations.get(rebuilt.binding, lease.id)).toEqual(accepted)
  expect(yield* rebuilt.operations.execute(rebuilt.binding, { id: lease.id, input: { edited: true } }, () => Effect.sync(() => {
    calls.push(1)
    return { runID: "must-not-send" }
  }))).toEqual(accepted)
  expect(calls).toHaveLength(1)
  const stored = yield* f.database.db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, lease.id)).get()
  expect(stored?.result).toEqual(accepted.result)
  expect(JSON.stringify(stored)).not.toContain("secret-source-body")
}))

it.live("callback secret extras and invalid acknowledgement fields reject strict decoding and cannot enter durable receipt", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const calls: number[] = []
  yield* Effect.forEach([
    { runID: "native-run", secret: "provider-secret-extra", source: "provider-source-extra" },
    { runID: "native-run", attempt: 0 },
    { runID: "", attempt: 1 },
  ], (acknowledgement) => Effect.gen(function* () {
    const lease = yield* service.operations.prepare(service.binding, intent(service.binding))
    yield* fault(service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.sync(() => {
      calls.push(1)
      return acknowledgement
    })), "outcome_unknown")
    const receipt = yield* service.operations.get(service.binding, lease.id)
    expect(receipt.state).toBe("outcome_unknown")
    expect(receipt.result).toBeUndefined()
    expect((yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.die("must not retry invalid acknowledgement"))).state).toBe("outcome_unknown")
  }))
  expect(calls).toHaveLength(3)
  const stored = yield* f.database.db.select().from(ActionsOperationTable).all()
  expect(stored.every((row) => row.result === null)).toBe(true)
  expect(JSON.stringify(stored)).not.toContain("provider-secret-extra")
  expect(JSON.stringify(stored)).not.toContain("provider-source-extra")
}))

it.live("only explicit definitive send dispositions reject; original safe error fields survive and unknown never retries", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  yield* Effect.forEach([
    "definitely_unsent", "definitely_rejected", "unknown", undefined,
  ] as const, (disposition) => Effect.gen(function* () {
    const lease = yield* service.operations.prepare(service.binding, intent(service.binding))
    const failure = new ActionsError({
      kind: "permission_denied", message: "Safe provider permission failure", bindingID: service.binding.id,
      provider: "github", resourceID: "native-resource", retryAfter: 17, operationID: lease.id, disposition,
    })
    const exit = yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.fail(failure)).pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) return yield* Effect.die("Expected send failure")
    const returned = Cause.findErrorOption(exit.cause)
    expect(Option.isSome(returned)).toBe(true)
    if (Option.isNone(returned)) return yield* Effect.die("Expected typed send failure")
    const definite = disposition === "definitely_unsent" || disposition === "definitely_rejected"
    if (definite) expect(returned.value).toBe(failure)
    if (!definite) expect(returned.value).toMatchObject({ kind: "outcome_unknown" })
    const receipt = yield* service.operations.get(service.binding, lease.id)
    expect(receipt.state).toBe(definite ? "rejected" : "outcome_unknown")
    expect(receipt.reason).not.toContain(failure.message)
    expect((yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.die("must not replay failed operation"))).state).toBe(receipt.state)
  }))
}))

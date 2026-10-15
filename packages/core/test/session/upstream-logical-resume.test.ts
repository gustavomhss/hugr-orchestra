import { expect } from "bun:test"
import { Effect } from "effect"
import { SessionMessageUpdater } from "../../src/session/message-updater"
// Share the production-projector fixture; Bun registers its original receipt/attestation suite once.
import { called, dbIt, fixture, input, it, metadata, observationFixture, progress, receipt, success, tool, workResult } from "../upstream-settlement-preservation.test"

dbIt.live("logical resume host observation retains captured Task identity and is idempotent", () => Effect.gen(function* () {
  const f = yield* observationFixture("logical-resume", false, "logical")
  const before = yield* f.read()
  expect(f.selectedInput.task_id).toBe(f.result.taskId)
  expect(f.selectedInput.task_id).not.toBe(f.childID)
  yield* f.offer({ ...f.retainedMetadata, workResult: f.result })
  const observed = yield* f.read()
  expect(observed).toEqual({ ...before, state: { ...before.state,
    structured: { ...before.state.structured, metadata: { ...f.retainedMetadata, workResult: f.result } } } })
  expect(observed.state.structured.metadata).not.toHaveProperty("upstreamSettlement")
  yield* f.offer({ ...f.retainedMetadata, workResult: f.result })
  expect(yield* f.read()).toEqual(observed)
  yield* f.offer({ ...f.retainedMetadata, workResult: { ...f.result, taskId: "tsk_unrelated" } })
  expect(yield* f.read()).toEqual(observed)
}))

dbIt.live("wrong logical resume cannot authorize completed Task host observation", () => Effect.gen(function* () {
  const f = yield* observationFixture("wrong-logical-resume", false, "wrong-logical")
  const before = yield* f.read()
  expect(f.selectedInput.task_id).not.toBe(f.result.taskId)
  expect(f.selectedInput.task_id).not.toBe(f.childID)
  yield* f.offer({ ...f.retainedMetadata, workResult: f.result })
  expect(yield* f.read()).toEqual(before)
}))

it.effect("logical resume receipt survives exact retries and stale completion without rebinding child", () => Effect.gen(function* () {
  const selectedInput = { ...input, task_id: workResult.taskId }
  const current = fixture(selectedInput)
  yield* SessionMessageUpdater.update(current.adapter, progress({ metadata }))
  yield* SessionMessageUpdater.update(current.adapter, success({}))
  const settled = structuredClone(tool(current.state))
  expect(settled.state.status).toBe("completed")
  expect(settled.state.input).toEqual(selectedInput)
  expect(settled.state.structured.metadata).toMatchObject({ upstreamSettlement: receipt, workResult,
    parentSessionId: metadata.parentSessionId, sessionId: workResult.author.executionSessionID })
  for (const event of [progress({ metadata }), called(), success({ metadata: {
    ...metadata, sessionId: "ses_other", workResult: { ...workResult, taskId: "tsk_unrelated" },
  } })]) {
    yield* SessionMessageUpdater.update(current.adapter, event)
    expect(tool(current.state)).toEqual(settled)
  }
}))

import { expect, test } from "bun:test"
import { Cause, DateTime, Deferred, Effect, Exit, Fiber, Option, Result } from "effect"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { WorkflowRecordsV2 } from "../src/v2/workflow/records"
import { gate, open } from "./fixture/workflow-transfer"

function refused<A, E>(effect: Effect.Effect<A, E>) {
  return effect.pipe(Effect.result, Effect.map((result) => {
    expect(Result.isFailure(result)).toBe(true)
    if (!Result.isFailure(result)) throw new Error("Expected workflow admission to refuse")
    expect(result.failure).toBeInstanceOf(RelayWorkflowBinding.Held)
    return result.failure
  }))
}

function incompatible<A, E>(effect: Effect.Effect<A, E>) {
  return effect.pipe(Effect.exit, Effect.map((exit) => {
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) throw new Error("Expected stale holder's CurrentStep to refuse")
    expect(Cause.pretty(exit.cause)).toContain("WORKFLOW_ARM_BINDING_MISMATCH")
  }))
}

test("unused holder transfers once and exact admission replay preserves SQL and arm bytes", async () => {
  expectSpawn(import.meta.path)
  await Effect.runPromise(open({}, (f) => Effect.gen(function* () {
    expect((yield* f.workflow.current(f.bound(f.old.id))).view.wp).toBe("work")
    yield* f.workflow.admit(f.bound(f.next.id), false)
    expect(yield* f.held()).toBe(f.next.id)
    expect((yield* f.recorded()).holder).toBe(f.next.id)
    expect(yield* f.moves()).toHaveLength(1)
    const bytes = yield* f.bytes()
    const rows = yield* f.moves()
    yield* f.workflow.admit(f.bound(f.next.id), false)
    expect(yield* f.moves()).toEqual(rows)
    expect(yield* f.bytes()).toEqual(bytes)
    expect(f.calls.rebind).toBe(1)
    expect(f.calls.provider).toEqual([])
    expect(f.calls.tools).toEqual([])
  })))
}, 30_000)

test("idle transfer owns old holder while resume joins and wake waits, then a new resume refuses CurrentStep", async () => {
  expectSpawn(import.meta.path)
  const parked = gate()
  await Effect.runPromise(open({ beforeRebind: parked.hold }, (f) => Effect.gen(function* () {
    yield* f.prompt(f.old.id)
    const moving = yield* f.workflow.admit(f.bound(f.next.id), false).pipe(Effect.exit, Effect.forkChild)
    yield* parked.entered
    const resumed = yield* f.execution.resume(f.old.id).pipe(Effect.exit, Effect.forkChild)
    yield* f.execution.wake(f.old.id)
    const during = yield* Fiber.await(resumed).pipe(Effect.timeoutOption("100 millis"))
    expect(Option.isNone(during)).toBe(true)
    expect(f.calls.provider).toEqual([])
    expect(f.calls.tools).toEqual([])
    expect(yield* f.held()).toBe(f.old.id)
    yield* parked.release
    expect(Exit.isSuccess(yield* Fiber.join(moving).pipe(Effect.timeout("5 seconds")))).toBe(true)
    yield* Fiber.await(resumed).pipe(Effect.timeout("5 seconds"))
    // Wait through any retained advisory wake; a joining waiter need not have drained at all.
    yield* f.execution.exclusive(f.old.id, Effect.void, { wait: true }).pipe(Effect.timeout("5 seconds"))
    yield* incompatible(f.execution.resume(f.old.id))
    expect(yield* f.held()).toBe(f.next.id)
    expect(yield* f.moves()).toHaveLength(1)
    expect(f.calls.provider).toEqual([])
    expect(f.calls.tools).toEqual([])
  }).pipe(Effect.ensuring(parked.release))))
}, 30_000)

test("an entered provider keeps its holder and completes its turn without interruption after move refusal", async () => {
  expectSpawn(import.meta.path)
  const provider = gate()
  await Effect.runPromise(open({ provider: provider.hold }, (f) => Effect.gen(function* () {
    yield* f.prompt(f.old.id)
    const running = yield* f.execution.resume(f.old.id).pipe(Effect.exit, Effect.forkChild)
    yield* provider.entered
    expect(f.calls.provider).toEqual([f.old.id])
    yield* refused(f.workflow.admit(f.bound(f.next.id), false)).pipe(Effect.timeout("5 seconds"))
    expect(f.calls.interrupted).toEqual([])
    expect((yield* f.execution.active).has(f.old.id)).toBe(true)
    expect(yield* f.held()).toBe(f.old.id)
    expect(yield* f.moves()).toEqual([])
    expect(f.calls.rebind).toBe(0)
    yield* provider.release
    const settled = yield* Fiber.join(running).pipe(Effect.timeout("5 seconds"))
    // The provider finishes normally; the fixture's zero retry budget then parks its unreviewed workflow.
    expect(Exit.isFailure(settled)).toBe(true)
    if (Exit.isFailure(settled)) expect(Cause.pretty(settled.cause)).toContain("WORKFLOW_TRANSITION_ESCALATE")
    const replies = (yield* f.sessions.messages({ sessionID: f.old.id })).filter((message) => message.type === "assistant")
    expect(replies.some((message) => message.finish === "stop")).toBe(true)
    expect(f.calls.completed).toEqual([f.old.id])
    expect(f.calls.tools).toEqual([f.old.id])
    expect(f.calls.interrupted).toEqual([])
  }).pipe(Effect.ensuring(provider.release))))
}, 30_000)

for (const evidence of ["content", "finish"] as const) {
  test(`durable assistant ${evidence} prevents moving an idle holder`, async () => {
    expectSpawn(import.meta.path)
    await Effect.runPromise(open({}, (f) => Effect.gen(function* () {
      const common = { sessionID: f.old.id, assistantMessageID: SessionMessage.ID.make("msg_historical_transfer"), timestamp: yield* DateTime.now }
      yield* f.events.publish(SessionEvent.Step.Started, {
        ...common, agent: "backend", model: { id: ModelV2.ID.make("fixture"), providerID: ProviderV2.ID.make("fixture") },
      })
      if (evidence === "content") {
        yield* f.events.publish(SessionEvent.Text.Started, { ...common, textID: "answer" })
        yield* f.events.publish(SessionEvent.Text.Ended, { ...common, textID: "answer", text: "Existing provider content." })
      }
      if (evidence === "finish") yield* f.events.publish(SessionEvent.Step.Ended, {
        ...common, finish: "stop", cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      })
      const history = yield* f.store.entries(f.old.id)
      expect(history.some((entry) => entry.message.type === "assistant" && (evidence === "content" ? entry.message.content.length > 0 : entry.message.finish === "stop"))).toBe(true)
      const bytes = yield* f.bytes()
      yield* refused(f.workflow.admit(f.bound(f.next.id), false))
      expect(yield* f.bytes()).toEqual(bytes)
      expect(yield* f.moves()).toEqual([])
      expect(f.calls.rebind).toBe(0)
      expect(f.calls.provider).toEqual([])
    })))
  }, 30_000)
}

test("a durable review hold prevents moving an idle holder without provider history", async () => {
  expectSpawn(import.meta.path)
  await Effect.runPromise(open({}, (f) => Effect.gen(function* () {
    const view = (yield* f.workflow.current(f.bound(f.old.id))).view
    yield* WorkflowRecordsV2.recordReviewHeld({ db: f.database.db, events: f.events }, {
      executionSessionID: f.old.id, token: f.token,
      settlement: { assistantMessageID: SessionMessage.ID.make("msg_review_transfer"), expected: { position: view.position, attempt: view.attempt, ledgerSeq: view.ledgerSeq } },
    })
    expect(yield* WorkflowRecordsV2.reviewHolds(f.database.db, f.old.id)).toHaveLength(1)
    const bytes = yield* f.bytes()
    yield* refused(f.workflow.admit(f.bound(f.next.id), false))
    expect(yield* f.bytes()).toEqual(bytes)
    expect(yield* f.moves()).toEqual([])
    expect(f.calls.rebind).toBe(0)
    expect(f.calls.provider).toEqual([])
  })))
}, 30_000)

test("a move listener awaiting the old holder's resume cannot deadlock the transfer or run stale effects", async () => {
  expectSpawn(import.meta.path)
  await Effect.runPromise(open({}, (f) => Effect.gen(function* () {
    yield* f.prompt(f.old.id)
    const observed = Deferred.makeUnsafe<void>()
    const unsubscribe = yield* f.events.listen((event) => event.type !== MaestroEvent.Task.WorkflowRebound.type ? Effect.void : Effect.gen(function* () {
      expect((yield* f.recorded()).holder).toBe(f.next.id)
      // Like any waiter arriving during exclusive ownership, this resume may join without draining.
      yield* f.execution.resume(f.old.id).pipe(Effect.exit)
      yield* Deferred.succeed(observed, undefined)
    }))
    yield* f.workflow.admit(f.bound(f.next.id), false).pipe(
      Effect.andThen(Deferred.await(observed)), Effect.timeout("5 seconds"), Effect.ensuring(unsubscribe),
    )
    expect(yield* f.held()).toBe(f.next.id)
    expect(yield* f.moves()).toHaveLength(1)
    yield* incompatible(f.execution.resume(f.old.id))
    expect(f.calls.provider).toEqual([])
    expect(f.calls.tools).toEqual([])
  })))
}, 30_000)

test("cancelling the transfer caller detaches only that waiter while the old holder lease stays owned", async () => {
  expectSpawn(import.meta.path)
  const parked = gate()
  await Effect.runPromise(open({ beforeRebind: parked.hold }, (f) => Effect.gen(function* () {
    const moving = yield* f.workflow.admit(f.bound(f.next.id), false).pipe(Effect.forkChild)
    yield* parked.entered
    yield* Fiber.interrupt(moving)
    expect((yield* f.execution.active).has(f.old.id)).toBe(true)
    expect(Option.isNone(yield* f.execution.exclusive(f.old.id, Effect.void))).toBe(true)
    yield* f.prompt(f.old.id)
    const resumed = yield* f.execution.resume(f.old.id).pipe(Effect.exit, Effect.forkChild)
    expect(Option.isNone(yield* Fiber.await(resumed).pipe(Effect.timeoutOption("100 millis")))).toBe(true)
    expect(f.calls.provider).toEqual([])
    expect(yield* f.moves()).toEqual([])
    yield* parked.release
    yield* Fiber.await(resumed).pipe(Effect.timeout("5 seconds"))
    expect(yield* f.held()).toBe(f.next.id)
    expect(yield* f.moves()).toHaveLength(1)
    yield* incompatible(f.execution.resume(f.old.id))
    expect(f.calls.provider).toEqual([])
    expect(f.calls.tools).toEqual([])
  }).pipe(Effect.ensuring(parked.release))))
}, 30_000)

test("explicit interruption after real rebind preserves exact SQL recovery and an older intent cannot steal a newer holder", async () => {
  expectSpawn(import.meta.path)
  const parked = gate()
  await Effect.runPromise(open({ afterRebind: parked.hold }, (f) => Effect.gen(function* () {
    const moving = yield* f.workflow.admit(f.bound(f.next.id), false).pipe(Effect.exit, Effect.forkChild)
    yield* parked.entered
    expect(yield* f.held()).toBe(f.next.id)
    expect((yield* f.recorded()).holder).toBe(f.old.id)
    expect(yield* f.moves()).toEqual([])
    yield* f.execution.interrupt(f.old.id).pipe(Effect.timeout("5 seconds"))
    const interrupted = yield* Fiber.join(moving).pipe(Effect.timeout("1 second"))
    expect(Exit.isFailure(interrupted) && Cause.hasInterrupts(interrupted.cause)).toBe(true)
    expect(yield* f.moves()).toEqual([])
    yield* parked.release
    yield* f.workflow.admit(f.bound(f.next.id), false)
    const recovered = yield* f.moves()
    expect(recovered).toHaveLength(1)
    expect(recovered[0].data).toMatchObject({ from: f.old.id, executionSessionID: f.next.id, recoveredBy: { authorityCallID: f.bound(f.next.id).authorityCallID } })
    expect((yield* f.recorded()).holder).toBe(f.next.id)
    const bytes = yield* f.bytes()
    yield* f.workflow.admit(f.bound(f.next.id), false)
    expect(yield* f.moves()).toEqual(recovered)
    expect(yield* f.bytes()).toEqual(bytes)
    yield* f.workflow.admit(f.bound(f.last.id), false)
    const latest = yield* f.bytes()
    const records = yield* f.moves()
    yield* refused(f.workflow.admit(f.bound(f.next.id), false))
    yield* refused(f.workflow.admit(f.bound(f.old.id), false))
    expect(yield* f.held()).toBe(f.last.id)
    expect((yield* f.recorded()).holder).toBe(f.last.id)
    expect(yield* f.moves()).toEqual(records)
    expect(yield* f.bytes()).toEqual(latest)
    expect(f.calls.provider).toEqual([])
    expect(f.calls.tools).toEqual([])
  }).pipe(Effect.ensuring(parked.release))))
}, 30_000)

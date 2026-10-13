import { expect } from "bun:test"
import { Effect, Fiber } from "effect"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ClaudeHost } from "@/claude-code/host/session"
import { ClaudeEngineFixture } from "../engine-fixture"

// These run the real Session frame pump and Mirror with a scripted SDK transport. They require the lead's
// session.ts wiring: notification: live.join.notification, and join-validated routing while no turn is active.
for (const idle of [false, true]) ClaudeEngineFixture.it.instance(`Session notification routing preserves B and settles A once (${idle ? "idle" : "active"})`, () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  const host = yield* ClaudeHost.Service
  const ready = Promise.withResolvers<void>()
  const emitCrossed = Promise.withResolvers<void>()
  const crossed = Promise.withResolvers<void>()
  const emitCorrect = Promise.withResolvers<void>()
  const correct = Promise.withResolvers<void>()
  const emitDuplicate = Promise.withResolvers<void>()
  const duplicate = Promise.withResolvers<void>()
  const finish = Promise.withResolvers<void>()
  yield* Effect.addFinalizer(() => Effect.sync(() => {
    emitCrossed.resolve()
    emitCorrect.resolve()
    emitDuplicate.resolve()
    finish.resolve()
  }))
  ClaudeEngineFixture.state.scripts.push(async function* (input) {
    const next = await input[Symbol.asyncIterator]().next()
    if (next.done) return
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...ClaudeEngineFixture.frame }
    yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: "dispatch", message: { id: "dispatch", usage: {},
      content: ["a", "b"].map((id) => ({ type: "tool_use", id, name: "Agent",
        input: { subagent_type: "general-purpose", description: id, prompt: `Work ${id}`, run_in_background: true } })) } }
    for (const id of ["a", "b"]) {
      yield { type: "system", subtype: "task_started", ...ClaudeEngineFixture.frame, tool_use_id: id, task_id: `task-${id}`,
        description: id, task_type: "local_agent" }
      yield { type: "user", ...ClaudeEngineFixture.frame, message: { role: "user",
        content: [{ type: "tool_result", tool_use_id: id, content: "launched" }] }, tool_use_result: { status: "async_launched", agentId: `task-${id}` } }
      yield { type: "assistant", ...ClaudeEngineFixture.frame, parent_tool_use_id: id, uuid: `final-${id}`,
        message: { id: `final-${id}`, content: [{ type: "text", text: `${id} café\r\n  exact evidence\n` }], usage: {}, stop_reason: "end_turn" } }
    }
    if (idle) yield { type: "result", subtype: "success", ...ClaudeEngineFixture.frame, is_error: false, total_cost_usd: 0 }
    ready.resolve()
    await emitCrossed.promise
    yield { type: "system", subtype: "task_notification", ...ClaudeEngineFixture.frame, task_id: "task-a", tool_use_id: "b",
      status: "completed", summary: "CROSSED", output_file: "/tmp/a" }
    crossed.resolve()
    await emitCorrect.promise
    yield { type: "system", subtype: "task_notification", ...ClaudeEngineFixture.frame, task_id: "task-a",
      status: "completed", summary: "A completed", output_file: "/tmp/a" }
    correct.resolve()
    await emitDuplicate.promise
    yield { type: "system", subtype: "task_notification", ...ClaudeEngineFixture.frame, task_id: "task-a", tool_use_id: "a",
      status: "completed", summary: "duplicate", output_file: "/tmp/a" }
    duplicate.resolve()
    await finish.promise
    if (!idle) yield { type: "result", subtype: "success", ...ClaudeEngineFixture.frame, is_error: false, total_cost_usd: 0 }
    for await (const _ of input) {}
  })
  const running = yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("delegate") }).pipe(Effect.forkChild)
  yield* Effect.promise(() => ready.promise)
  const cards = () => setup.sessions.messages({ sessionID: setup.chat.id }).pipe(Effect.map((history) => history.flatMap((item) => item.parts)
    .filter((part): part is SessionV1.ToolPart => part.type === "tool" && ["a", "b"].includes(part.callID))))
  const beforeCards = yield* cards()
  expect(beforeCards).toHaveLength(2)
  expect(beforeCards.every((part) => part.state.status === "completed")).toBe(true)
  const childA = beforeCards.find((part) => part.callID === "a")?.metadata?.sessionId
  const childB = beforeCards.find((part) => part.callID === "b")?.metadata?.sessionId
  if (typeof childA !== "string" || typeof childB !== "string") throw new Error("Expected actual mirrored children")
  const children = yield* setup.sessions.children(setup.chat.id)
  const a = children.find((child) => child.id === childA)
  const b = children.find((child) => child.id === childB)
  if (!a || !b || a.id === b.id) throw new Error("Expected distinct persisted mirrored children")
  const beforeA = yield* setup.sessions.messages({ sessionID: a.id })
  const beforeB = yield* setup.sessions.messages({ sessionID: b.id })
  emitCrossed.resolve()
  yield* Effect.promise(() => crossed.promise)
  expect(yield* cards()).toEqual(beforeCards)
  expect(yield* setup.sessions.messages({ sessionID: a.id })).toEqual(beforeA)
  expect(yield* setup.sessions.messages({ sessionID: b.id })).toEqual(beforeB)
  emitCorrect.resolve()
  yield* Effect.promise(() => correct.promise)
  const acceptedCards = yield* cards()
  const acceptedA = yield* setup.sessions.messages({ sessionID: a.id })
  expect(acceptedCards.find((part) => part.callID === "a")?.metadata?.claudeCodeTask).toMatchObject({ taskID: "task-a", summary: "A completed", status: "completed" })
  expect(acceptedA.flatMap((item) => item.parts).filter((part) => part.type === "step-finish")).toHaveLength(1)
  expect(yield* setup.sessions.messages({ sessionID: b.id })).toEqual(beforeB)
  expect(acceptedCards.find((part) => part.callID === "b")).toEqual(beforeCards.find((part) => part.callID === "b"))
  emitDuplicate.resolve()
  yield* Effect.promise(() => duplicate.promise)
  expect(yield* cards()).toEqual(acceptedCards)
  expect(yield* setup.sessions.messages({ sessionID: a.id })).toEqual(acceptedA)
  finish.resolve()
  yield* Fiber.join(running)
  yield* host.release(setup.chat.id)
  expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
}), 30_000)

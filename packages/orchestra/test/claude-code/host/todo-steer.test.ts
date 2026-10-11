import { expect } from "bun:test"
import { Effect, Fiber, Scope } from "effect"
import { ClaudeCode } from "@/claude-code/engine"
import { Todo } from "@/session/todo"
import { ClaudeEngineFixture } from "../engine-fixture"

ClaudeEngineFixture.it.instance("native todo results and concurrent steering preserve both durable states", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  const scope = yield* Scope.Scope
  const engine = yield* ClaudeCode.Service
  const todo = yield* Todo.Service
  const ready = Promise.withResolvers<void>()
  const result = Promise.withResolvers<void>()
  ClaudeEngineFixture.state.scripts.push(async function* (input) {
    const reader = input[Symbol.asyncIterator]()
    const first = await reader.next()
    if (first.done) return
    yield { ...ClaudeEngineFixture.frame, type: "system", subtype: "init", model: "claude-haiku-4-5-20251001" }
    yield { ...ClaudeEngineFixture.frame, type: "assistant", user_message_uuid: first.value.uuid,
      message: { id: "task-create", model: "claude-haiku-4-5-20251001", usage: {},
        content: [{ type: "tool_use", id: "create", name: "TaskCreate", input: { subject: "Inspect", description: "Read" } }] } }
    ready.resolve()
    await result.promise
    yield { ...ClaudeEngineFixture.frame, type: "user", tool_use_result: { task: { id: "1", subject: "Inspect" } },
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "create", content: "created" }] } }
    const second = await reader.next()
    if (second.done) return
    yield { ...ClaudeEngineFixture.frame, type: "assistant", user_message_uuid: second.value.uuid,
      message: { id: "steered", model: "claude-haiku-4-5-20251001", usage: {}, stop_reason: "end_turn",
        content: [{ type: "text", text: "Received steer" }] } }
    yield { ...ClaudeEngineFixture.frame, type: "result", subtype: "success", is_error: false, total_cost_usd: 0,
      user_message_uuid: second.value.uuid }
    for await (const _ of input) {}
  })
  const running = yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("start") }).pipe(Effect.forkIn(scope))
  yield* Effect.promise(() => ready.promise)
  const steer = yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("steer"), noReply: true })
  // Releasing the native tool result races the real host's delivery write, rather than a copied merge algorithm.
  yield* Effect.all([engine.admitted(steer), Effect.sync(() => result.resolve())], { concurrency: "unbounded" })
  yield* Fiber.join(running)
  const host = (yield* setup.sessions.get(setup.chat.id)).metadata?.claudeCode
  expect(host?.delivered).toContain(steer.info.id)
  expect(host?.todoTasks).toMatchObject({ "1": { content: "Inspect", status: "pending" } })
  expect(yield* todo.get(setup.chat.id)).toEqual([{ content: "Inspect", status: "pending", priority: "medium" }])
}), 30_000)

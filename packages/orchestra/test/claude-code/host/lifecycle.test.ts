import { expect } from "bun:test"
import path from "node:path"
import { Effect, Exit, Fiber, Scope } from "effect"
import { ClaudeHost } from "@/claude-code/host/session"
import { ClaudeCode } from "@/claude-code/engine"
import { InstanceStore } from "@/project/instance-store"
import { MessageID } from "@/session/schema"
import { pollWithTimeout } from "../../lib/effect"
import { TestInstance } from "../../fixture/fixture"
import { ClaudeEngineFixture } from "../engine-fixture"

const frame = ClaudeEngineFixture.frame

ClaudeEngineFixture.it.instance("UI forks exclude the selected user and use the preceding native chain entry", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.replies("first answer", "later answer"), ClaudeEngineFixture.replies("fork answer"))
  yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("first request") })
  yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("excluded request") })
  const history = yield* setup.sessions.messages({ sessionID: setup.chat.id })
  const users = history.filter((item) => item.info.role === "user")
  const fork = yield* setup.sessions.fork({ sessionID: setup.chat.id, messageID: users[1].info.id })
  expect((yield* setup.sessions.messages({ sessionID: fork.id })).map((item) => item.info.role)).toEqual(["user", "assistant"])
  yield* setup.prompt.prompt({ sessionID: fork.id, ...ClaudeEngineFixture.say("branch request") })
  expect(ClaudeEngineFixture.state.queries[1].options).toMatchObject({ resume: "sdk-1", forkSession: true, resumeSessionAt: "msg_0" })
  expect(ClaudeEngineFixture.state.inputs).toEqual(["first request", "excluded request", "branch request"])
}), 30_000)

ClaudeEngineFixture.it.instance("unresolved fork boundaries fail before publishing a fork", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.replies("answer"))
  yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("first") })
  const before = yield* setup.sessions.list({})
  const result = yield* setup.sessions.fork({ sessionID: setup.chat.id, messageID: MessageID.ascending() }).pipe(Effect.exit)
  expect(Exit.isFailure(result)).toBe(true)
  expect((yield* setup.sessions.list({})).length).toBe(before.length)
}), 30_000)

ClaudeEngineFixture.it.instance("forking before the first user starts a fresh native session", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.replies("answer"), ClaudeEngineFixture.replies("branch"))
  yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("first") })
  const history = yield* setup.sessions.messages({ sessionID: setup.chat.id })
  const fork = yield* setup.sessions.fork({ sessionID: setup.chat.id, messageID: history[0].info.id })
  yield* setup.prompt.prompt({ sessionID: fork.id, ...ClaudeEngineFixture.say("fresh") })
  expect(ClaudeEngineFixture.state.queries[1].options?.resume).toBeUndefined()
  expect(ClaudeEngineFixture.state.queries[1].options?.forkSession).toBeUndefined()
}), 30_000)

ClaudeEngineFixture.it.instance("prompt admission reconciles revert before removing its visible history", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.replies("keep", "discard"), ClaudeEngineFixture.replies("replacement"))
  yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("kept request") })
  yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("reverted request") })
  const users = (yield* setup.sessions.messages({ sessionID: setup.chat.id })).filter((item) => item.info.role === "user")
  yield* setup.sessions.setRevert({ sessionID: setup.chat.id, revert: { messageID: users[1].info.id } })
  yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("replacement request") })
  expect(ClaudeEngineFixture.state.closed).toHaveLength(1)
  expect(ClaudeEngineFixture.state.queries[1].options).toMatchObject({ resume: "sdk-1", resumeSessionAt: "msg_0" })
  const history = yield* setup.sessions.messages({ sessionID: setup.chat.id })
  expect(history.some((item) => item.info.id === users[1].info.id)).toBe(false)
  expect((yield* setup.sessions.get(setup.chat.id)).revert).toBeUndefined()
  expect(ClaudeEngineFixture.state.inputs).toEqual(["kept request", "reverted request", "replacement request"])
}), 30_000)

ClaudeEngineFixture.it.instance("Stop retains ownership until the pump exits and cancels a queued steer", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  const host = yield* ClaudeHost.Service
  const engine = yield* ClaudeCode.Service
  const scope = yield* Scope.Scope
  const entered = Promise.withResolvers<void>()
  const queued = Promise.withResolvers<void>()
  const drain = Promise.withResolvers<void>()
  ClaudeEngineFixture.state.scripts.push(async function* (input, params) {
    const reader = input[Symbol.asyncIterator]()
    await reader.next()
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
    yield { type: "assistant", ...frame, uuid: "active", message: { id: "msg_active", content: [{ type: "text", text: "working" }], usage: {} } }
    entered.resolve()
    const steer = await reader.next()
    ClaudeEngineFixture.state.receipt = { still_queued: steer.done || !steer.value.uuid ? [] : [steer.value.uuid] }
    queued.resolve()
    await drain.promise
    if (params.options?.abortController?.signal.aborted) return
    throw new Error("A queued steer survived Stop")
  }, ClaudeEngineFixture.replies("new reply"))
  const first = yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("start") }).pipe(Effect.forkIn(scope))
  yield* Effect.promise(() => entered.promise)
  const followup = yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("steer") }).pipe(Effect.forkIn(scope))
  yield* Effect.promise(() => queued.promise)
  const stopped = yield* setup.prompt.cancel(setup.chat.id).pipe(Effect.forkIn(scope))
  // The query closes synchronously, but the pending iterator still belongs to the old owner.
  yield* Effect.yieldNow
  yield* engine.setModel({ sessionID: setup.chat.id, model: "unused-after-stop" })
  const admitted = yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("new request"), noReply: true })
  if (admitted.info.role !== "user") throw new Error("missing admitted user")
  const next = yield* host.turn({ sessionID: setup.chat.id, user: admitted.info }).pipe(Effect.forkIn(scope))
  yield* Effect.yieldNow
  expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
  drain.resolve()
  yield* Fiber.join(stopped)
  yield* Fiber.await(first)
  yield* Fiber.await(followup)
  yield* Fiber.join(next)
  expect(ClaudeEngineFixture.state.inputs).toEqual(["start", "steer", "new request"])
  expect(ClaudeEngineFixture.state.messages[1].priority).toBe("next")
  expect(ClaudeEngineFixture.state.closed).toHaveLength(1)
  expect(ClaudeEngineFixture.state.models).not.toContain("unused-after-stop")
  expect((yield* setup.sessions.get(setup.chat.id)).metadata?.claudeCode).toMatchObject({ stoppedQueued: [ClaudeEngineFixture.state.messages[1].uuid] })
  yield* host.release(setup.chat.id)
}), 30_000)

ClaudeEngineFixture.it.instance("Tasks-panel child interruption targets the joined native task without stopping its parent", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  const entered = Promise.withResolvers<void>()
  const scope = yield* Scope.Scope
  ClaudeEngineFixture.state.scripts.push(async function* (input) {
    await input[Symbol.asyncIterator]().next()
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
    yield { type: "assistant", ...frame, uuid: "dispatch", message: { id: "msg_dispatch", content: [{ type: "tool_use", id: "toolu_child", name: "Agent",
      input: { subagent_type: "general-purpose", prompt: "work", description: "child" } }], usage: {} } }
    yield { type: "system", subtype: "task_started", task_id: "native-child", tool_use_id: "toolu_child", ...frame }
    yield { type: "assistant", ...frame, parent_tool_use_id: "toolu_child", uuid: "child", message: { id: "msg_child", content: [{ type: "text", text: "child work" }], usage: {} } }
    entered.resolve()
    for await (const _ of input) {}
  })
  const running = yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("delegate") }).pipe(Effect.forkIn(scope))
  yield* Effect.promise(() => entered.promise)
  const children = yield* setup.sessions.children(setup.chat.id)
  yield* setup.prompt.cancel(children[0].id)
  expect(ClaudeEngineFixture.state.stoppedTasks).toEqual(["native-child"])
  expect(ClaudeEngineFixture.state.interrupts).toBe(0)
  expect(ClaudeEngineFixture.state.closed).toHaveLength(0)
  yield* setup.prompt.cancel(setup.chat.id)
  yield* Fiber.await(running)
}), 30_000)

for (const operation of ["delete", "dispose"] as const) ClaudeEngineFixture.it.instance(`${operation} closes and joins the owned query exactly once`, () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.replies("answered"))
  yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("hello") })
  if (operation === "delete") yield* setup.sessions.remove(setup.chat.id)
  if (operation === "dispose") {
    const instance = yield* TestInstance
    const store = yield* InstanceStore.Service
    yield* store.disposeDirectory(instance.directory)
  }
  const host = yield* ClaudeHost.Service
  yield* host.release(setup.chat.id)
  expect(ClaudeEngineFixture.state.closed).toHaveLength(1)
}), 30_000)

for (const assistantError of [false, true]) ClaudeEngineFixture.it.instance(`API error text is retained verbatim (${assistantError ? "assistant frame" : "success result"})`, () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  const detail = "Your third-party app request requires extra usage. Enable billing to continue."
  ClaudeEngineFixture.state.scripts.push(async function* (input) {
    await input[Symbol.asyncIterator]().next()
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
    yield { type: "assistant", ...frame, uuid: "error", ...(assistantError ? { error: "billing_error" } : {}),
      message: { id: "msg_error", content: [{ type: "text", text: detail }], usage: {} } }
    yield { type: "result", subtype: "success", is_error: !assistantError, result: assistantError ? "" : detail, total_cost_usd: 0, ...frame }
    for await (const _ of input) {}
  })
  const reply = yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("hello") })
  expect(reply.info.role).toBe("assistant")
  if (reply.info.role !== "assistant") throw new Error("missing assistant error")
  expect(reply.info.error?.data).toMatchObject({ message: detail })
  expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
}), 30_000)

ClaudeEngineFixture.it.instance("answered user boundaries receive the real snapshot diff summary", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const instance = yield* TestInstance
  yield* Effect.promise(() => Bun.write(path.join(instance.directory, "answer.txt"), "before\n"))
  const setup = yield* ClaudeEngineFixture.setup()
  ClaudeEngineFixture.state.scripts.push(async function* (input) {
    await input[Symbol.asyncIterator]().next()
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
    yield { type: "assistant", ...frame, uuid: "edit", message: { id: "msg_edit", content: [{ type: "tool_use", id: "toolu_write", name: "Write",
      input: { file_path: path.join(instance.directory, "answer.txt"), content: "after\n" } }], usage: {} } }
    await Bun.write(path.join(instance.directory, "answer.txt"), "after\n")
    yield { type: "user", ...frame, uuid: "write-result", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_write", content: "written" }] } }
    yield { type: "assistant", ...frame, uuid: "answer", message: { id: "msg_answer", content: [{ type: "text", text: "edited" }], usage: {} } }
    yield { type: "result", subtype: "success", is_error: false, total_cost_usd: 0, ...frame }
    for await (const _ of input) {}
  })
  yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("edit answer.txt") })
  const history = yield* setup.sessions.messages({ sessionID: setup.chat.id })
  const user = history.find((item) => item.info.role === "user")
  if (user?.info.role !== "user") throw new Error("missing user")
  expect(user.info.summary?.diffs).toEqual(expect.arrayContaining([expect.objectContaining({ file: "answer.txt", additions: 1, deletions: 1 })]))
}), { git: true }, 30_000)

ClaudeEngineFixture.it.instance("admit-only input waits for the next turn, while a steer gets its own diff boundary", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const instance = yield* TestInstance
  const setup = yield* ClaudeEngineFixture.setup()
  const scope = yield* Scope.Scope
  const ready = Promise.withResolvers<void>()
  const continued = Promise.withResolvers<void>()
  const steered = Promise.withResolvers<void>()
  ClaudeEngineFixture.state.scripts.push(async function* (input) {
    const reader = input[Symbol.asyncIterator]()
    const first = await reader.next()
    if (first.done) return
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
    yield { type: "assistant", ...frame, uuid: "first-step", user_message_uuid: first.value.uuid,
      message: { id: "msg_first_step", content: [{ type: "text", text: "first step" }], usage: {} } }
    await Bun.write(path.join(instance.directory, "first.txt"), "first\n")
    ready.resolve()
    await continued.promise
    const second = await reader.next()
    if (second.done) return
    yield { type: "assistant", ...frame, uuid: "steer-step", user_message_uuid: second.value.uuid,
      user_message_uuids: [first.value.uuid, second.value.uuid],
      message: { id: "msg_steer_step", content: [{ type: "text", text: "steered step" }], usage: {} } }
    await Bun.write(path.join(instance.directory, "steer.txt"), "steer\n")
    yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: 0, ...frame,
      user_message_uuid: second.value.uuid, user_message_uuids: [first.value.uuid, second.value.uuid] }
    steered.resolve()
    const third = await reader.next()
    if (third.done) return
    yield { type: "assistant", ...frame, uuid: "queue-step", user_message_uuid: third.value.uuid,
      message: { id: "msg_queue_step", content: [{ type: "text", text: "queued answer" }], stop_reason: "end_turn", usage: {} } }
    yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: 0, ...frame }
    for await (const _ of input) {}
  })
  const initial = yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("initial") }).pipe(Effect.forkIn(scope))
  yield* Effect.promise(() => ready.promise)
  const steer = yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("steer") }).pipe(Effect.forkIn(scope))
  // Admission returns through the same runner, so its message is persisted before it joins that runner.
  const sessions = setup.sessions
  yield* pollWithTimeout(sessions.messages({ sessionID: setup.chat.id }).pipe(Effect.map((history) =>
    history.filter((item) => item.info.role === "user").length === 2 ? true : undefined)), "steer was not admitted")
  yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("queued"), noReply: true })
  expect(ClaudeEngineFixture.state.inputs).toEqual(["initial"])
  continued.resolve()
  yield* Effect.promise(() => steered.promise)
  yield* Fiber.join(initial)
  yield* Fiber.join(steer)
  const history = yield* setup.sessions.messages({ sessionID: setup.chat.id })
  const users = history.filter((item) => item.info.role === "user")
  expect(ClaudeEngineFixture.state.inputs).toEqual(["initial", "steer", "queued"])
  expect(ClaudeEngineFixture.state.messages[1].priority).toBe("next")
  expect(ClaudeEngineFixture.state.messages[2].priority).toBeUndefined()
  if (users[0].info.role !== "user" || users[1].info.role !== "user") throw new Error("missing user summaries")
  expect(users[0].info.summary?.diffs).toEqual(expect.arrayContaining([expect.objectContaining({ file: "first.txt", additions: 1 })]))
  expect(users[1].info.summary?.diffs).toEqual(expect.arrayContaining([expect.objectContaining({ file: "steer.txt", additions: 1 })]))
}), { git: true }, 30_000)

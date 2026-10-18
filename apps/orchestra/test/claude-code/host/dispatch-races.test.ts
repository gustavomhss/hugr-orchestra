import { afterEach, describe, expect } from "bun:test"
import type { PostToolUseHookInput, PreToolUseHookInput, SDKTaskNotificationMessage } from "@anthropic-ai/claude-agent-sdk"
import type { AgentOutput } from "@anthropic-ai/claude-agent-sdk/sdk-tools"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Database } from "@orchestra/core/database/database"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Deferred, Effect, Exit, Fiber, FileSystem } from "effect"
import { Agent } from "@/agent/agent"
import { ClaudeHostDelegation } from "@/claude-code/host/delegation"
import { ClaudeHostJoin } from "@orchestra/engine-claude-code/host/join"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { LogicalTask } from "@/maestro/logical-task"
import { WriteRoots } from "@/maestro/write-roots"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { disposeAllInstances } from "../../fixture/fixture"
import { awaitWithTimeout, testEffect } from "../../lib/effect"

// These are scripted SDK inputs into the actual join/delegation, filesystem, Session and LogicalTask services.
// Decorators delay or fail at a boundary; successful work still invokes the real filesystem and durable save.
afterEach(async () => { await disposeAllInstances() })
const it = testEffect(TestAppNodeBuilder.build(
  LayerNode.group([filesystem, CrossSpawnSpawner.node, Agent.node, Session.node, SessionProjector.node, SessionSubagentModels.node, EventV2Bridge.node, Database.node, Config.node]),
  [[RuntimeFlags.node, RuntimeFlags.layer({})]],
))
const model = { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-test") }
const base = { session_id: "cc-session", transcript_path: "/tmp/transcript.jsonl", cwd: "/tmp" }
const args = (grantID: string) => ({ description: "write the proposal", subagent_type: "orchestra:archie", run_in_background: false, prompt: `Write it.\ngrantID: ${grantID}` })
const background = { description: "review the plan", subagent_type: "orchestra:patty", run_in_background: true, prompt: "Review it." }
const pre = (tool_use_id: string, tool_input: unknown): PreToolUseHookInput => ({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id, tool_input })
const launch = (tool_use_id: string, agentId: string): PostToolUseHookInput => ({ ...base, hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id, tool_input: background,
  tool_response: { status: "async_launched", agentId, description: background.description,
    prompt: background.prompt, outputFile: "/tmp/output" } satisfies AgentOutput })
const notice = (task_id: string, tool_use_id?: string): SDKTaskNotificationMessage => ({ type: "system", subtype: "task_notification", task_id, tool_use_id,
  status: "completed", summary: "Reviewed.", output_file: "/tmp/output", uuid: "00000000-0000-4000-8000-000000000001", session_id: "cc-session" })

const host = Effect.fn("DispatchRaceTest.host")(function* (beforeSave: (part: SessionV1.ToolPart) => Effect.Effect<void> = () => Effect.void) {
  const sessions = yield* Session.Service
  const registry = yield* Agent.Service
  const config = yield* Config.Service
  // Warm configuration before the test installs a barrier specifically on WriteRoots.bind's realPath boundary.
  yield* registry.get("archie")
  yield* config.get()
  const parent = yield* sessions.create({ agent: "maestro" })
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "user", sessionID: parent.id, agent: "maestro", model, time: { created: Date.now() } } satisfies SessionV1.User)
  const message = yield* sessions.updateMessage({ id: MessageID.ascending(), role: "assistant", sessionID: parent.id, parentID: user.id, agent: "maestro", mode: "maestro",
    modelID: model.modelID, providerID: model.providerID, path: { cwd: parent.directory, root: parent.directory }, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } } satisfies SessionV1.Assistant)
  const mirrored = new Map<string, SessionV1.ToolPart>()
  const authors = new Map<string, MessageID>()
  const join = ClaudeHostJoin.make()
  const delegation = ClaudeHostDelegation.make({ sessionID: parent.id, agent: "maestro", path: { cwd: parent.directory, root: parent.directory }, join,
    parts: { tool: (id) => mirrored.get(id), author: (id) => authors.get(id), complete: (part) => beforeSave(part).pipe(Effect.andThen(sessions.updatePart(part)),
      Effect.tap(() => Effect.sync(() => { mirrored.set(part.callID, part) })), Effect.asVoid) } })
  const call = (id: string, input: Record<string, unknown>) => Effect.gen(function* () {
    const part = yield* sessions.updatePart({ id: PartID.ascending(), sessionID: parent.id, messageID: message.id, type: "tool", callID: id, tool: "Agent",
      state: { status: "running", input, time: { start: Date.now() } }, metadata: { providerExecuted: true, claudeCodeTool: "Agent" } })
    mirrored.set(id, part)
    return pre(id, input)
  })
  const grant = (id: string) => Effect.gen(function* () {
    const permission = yield* WriteRoots.bind("archie", ["docs"], [])
    ClaudeHostMcp.grants(parent.id).set(id, { grantID: id, sessionID: parent.id, seat: "archie", writePaths: ["docs"], writeRoots: WriteRoots.read(permission) ?? [], purpose: "proposal", time: Date.now() })
    return id
  })
  yield* Effect.addFinalizer(() => Effect.sync(() => ClaudeHostMcp.release(parent.id)))
  const part = (id: string) => sessions.messages({ sessionID: parent.id }).pipe(Effect.map((history) => history.flatMap((message) => message.parts)
    .find((part): part is SessionV1.ToolPart => part.type === "tool" && part.callID === id)))
  return { sessions, parent, message, authors, join, delegation, grant, call, part, actor: { sessionID: parent.id, seat: "maestro" } }
})

const barrier = Effect.fn("DispatchRaceTest.barrier")(function* () {
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  return { wait: awaitWithTimeout(Deferred.await(entered), "boundary was never reached"), open: Deferred.succeed(release, undefined),
    pause: Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))) }
})

describe("dispatch admission races", () => {
  it.instance("reserves a shared grant before WriteRoots yields and admits only one child", () => Effect.gen(function* () {
    const fixture = yield* host()
    const grantID = yield* fixture.grant("grt_shared")
    const first = yield* fixture.call("call-a", args(grantID))
    const second = yield* fixture.call("call-b", args(grantID))
    const gate = yield* barrier()
    const fs = yield* FileSystem.FileSystem
    const fiber = yield* fixture.delegation.dispatch(first, fixture.actor).pipe(Effect.provideService(FileSystem.FileSystem,
      { ...fs, realPath: (path) => gate.pause.pipe(Effect.andThen(fs.realPath(path))) }), Effect.forkChild)
    yield* gate.wait
    expect(ClaudeHostMcp.grants(fixture.parent.id).has(grantID)).toBe(false)
    expect(Exit.isFailure(yield* Effect.exit(fixture.delegation.dispatch(second, fixture.actor)))).toBe(true)
    expect(yield* fixture.sessions.children(fixture.parent.id)).toHaveLength(0)
    yield* gate.open
    yield* Fiber.join(fiber)
    expect(yield* fixture.sessions.children(fixture.parent.id)).toHaveLength(1)
    const child = fixture.join.child("call-a")!
    expect(yield* LogicalTask.read(child)).toMatchObject({ memberID: "archie", executionSessionID: child })
    expect(fixture.join.child("call-b")).toBeUndefined()
  }))

  it.instance("distinct grants admit both calls while the first binding is paused", () => Effect.gen(function* () {
    const fixture = yield* host()
    const first = yield* fixture.call("call-a", args(yield* fixture.grant("grt_a")))
    const second = yield* fixture.call("call-b", args(yield* fixture.grant("grt_b")))
    const gate = yield* barrier()
    const fs = yield* FileSystem.FileSystem
    const fiber = yield* fixture.delegation.dispatch(first, fixture.actor).pipe(Effect.provideService(FileSystem.FileSystem,
      { ...fs, realPath: (path) => gate.pause.pipe(Effect.andThen(fs.realPath(path))) }), Effect.forkChild)
    yield* gate.wait
    yield* fixture.delegation.dispatch(second, fixture.actor)
    expect(yield* fixture.sessions.children(fixture.parent.id)).toHaveLength(1)
    yield* gate.open
    yield* Fiber.join(fiber)
    expect(yield* fixture.sessions.children(fixture.parent.id)).toHaveLength(2)
    expect(fixture.join.child("call-a")).not.toBe(fixture.join.child("call-b"))
  }))

  it.instance("concurrent exact replay reconciles one admission and conflicting call reuse refuses", () => Effect.gen(function* () {
    const fixture = yield* host()
    const call = yield* fixture.call("call-a", args(yield* fixture.grant("grt_a")))
    const gate = yield* barrier()
    const fs = yield* FileSystem.FileSystem
    const first = yield* fixture.delegation.dispatch(call, fixture.actor).pipe(Effect.provideService(FileSystem.FileSystem,
      { ...fs, realPath: (path) => gate.pause.pipe(Effect.andThen(fs.realPath(path))) }), Effect.forkChild)
    yield* gate.wait
    const replay = yield* fixture.delegation.dispatch(call, fixture.actor).pipe(Effect.forkChild({ startImmediately: true }))
    yield* gate.open
    yield* Fiber.join(first)
    yield* Fiber.join(replay)
    expect(yield* fixture.sessions.children(fixture.parent.id)).toHaveLength(1)
    expect(Exit.isFailure(yield* Effect.exit(fixture.delegation.dispatch({ ...call, tool_input: { ...args("grt_a"), prompt: "different" } }, fixture.actor)))).toBe(true)
    expect(yield* fixture.sessions.children(fixture.parent.id)).toHaveLength(1)
  }))

  it.instance("failed binding restores only the unconsumed reservation; retry can admit", () => Effect.gen(function* () {
    const fixture = yield* host()
    const grantID = yield* fixture.grant("grt_invalid")
    const grants = ClaudeHostMcp.grants(fixture.parent.id)
    const original = grants.get(grantID)!
    grants.set(grantID, { ...original, writePaths: ["../escape"] })
    const call = yield* fixture.call("call-a", args(grantID))
    expect(Exit.isFailure(yield* Effect.exit(fixture.delegation.dispatch(call, fixture.actor)))).toBe(true)
    expect(grants.has(grantID)).toBe(true)
    expect(yield* fixture.sessions.children(fixture.parent.id)).toHaveLength(0)
    grants.set(grantID, original)
    expect(Exit.isFailure(yield* Effect.exit(fixture.delegation.dispatch({ ...call, tool_input: { ...args(grantID), prompt: "changed retry" } }, fixture.actor)))).toBe(true)
    yield* fixture.delegation.dispatch(call, fixture.actor)
    expect(grants.has(grantID)).toBe(false)
    expect(yield* fixture.sessions.children(fixture.parent.id)).toHaveLength(1)
  }))

  it.instance("an interrupted child creation cannot spend the same grant on a second child", () => Effect.gen(function* () {
    const fixture = yield* host()
    const grantID = yield* fixture.grant("grt_a")
    const call = yield* fixture.call("call-a", args(grantID))
    const gate = yield* barrier()
    const admission = yield* fixture.delegation.dispatch(call, fixture.actor).pipe(Effect.provideService(Session.Service,
      { ...fixture.sessions, create: (input) => fixture.sessions.create(input).pipe(Effect.tap(() => gate.pause)) }), Effect.forkChild)
    yield* gate.wait
    expect(yield* fixture.sessions.children(fixture.parent.id)).toHaveLength(1)
    yield* Fiber.interrupt(admission)
    expect(ClaudeHostMcp.grants(fixture.parent.id).has(grantID)).toBe(false)
    expect(Exit.isFailure(yield* Effect.exit(fixture.delegation.dispatch(call, fixture.actor)))).toBe(true)
    expect(yield* fixture.sessions.children(fixture.parent.id)).toHaveLength(1)
    // No child frames are admitted without the logical binding and complete admission record.
    expect(fixture.join.child("call-a")).toBeUndefined()
  }))

  it.instance("rollback cannot resurrect a reservation after the host grant store was released", () => Effect.gen(function* () {
    const fixture = yield* host()
    const grantID = yield* fixture.grant("grt_a")
    const call = yield* fixture.call("call-a", args(grantID))
    const gate = yield* barrier()
    const fs = yield* FileSystem.FileSystem
    const admission = yield* fixture.delegation.dispatch(call, fixture.actor).pipe(Effect.provideService(FileSystem.FileSystem,
      { ...fs, realPath: (path) => gate.pause.pipe(Effect.andThen(fs.realPath(path))) }), Effect.forkChild)
    yield* gate.wait
    ClaudeHostMcp.release(fixture.parent.id)
    yield* Fiber.interrupt(admission)
    expect(ClaudeHostMcp.grants(fixture.parent.id).has(grantID)).toBe(false)
    expect(yield* fixture.sessions.children(fixture.parent.id)).toHaveLength(0)
  }))

  it.instance("interrupted binding rolls back, but interruption after child persistence never restores a spent grant", () => Effect.gen(function* () {
    const running = yield* barrier()
    const fixture = yield* host((part) => part.state.status === "running" ? running.pause : Effect.void)
    const grantID = yield* fixture.grant("grt_a")
    const call = yield* fixture.call("call-a", args(grantID))
    const binding = yield* barrier()
    const fs = yield* FileSystem.FileSystem
    const admission = yield* fixture.delegation.dispatch(call, fixture.actor).pipe(Effect.provideService(FileSystem.FileSystem,
      { ...fs, realPath: (path) => binding.pause.pipe(Effect.andThen(fs.realPath(path))) }), Effect.forkChild)
    yield* binding.wait
    yield* Fiber.interrupt(admission)
    expect(ClaudeHostMcp.grants(fixture.parent.id).has(grantID)).toBe(true)
    const admitted = yield* fixture.delegation.dispatch(call, fixture.actor).pipe(Effect.forkChild)
    yield* running.wait
    yield* Fiber.interrupt(admitted)
    expect(ClaudeHostMcp.grants(fixture.parent.id).has(grantID)).toBe(false)
    expect(yield* fixture.sessions.children(fixture.parent.id)).toHaveLength(1)
    yield* running.open
    yield* fixture.delegation.dispatch(call, fixture.actor)
    expect(yield* fixture.sessions.children(fixture.parent.id)).toHaveLength(1)
  }))
})

describe("background dispatch retention", () => {
  for (const boundary of ["first-write", "second-write", "foreign-hold"] as const)
    it.instance(`interrupted rejected-author cleanup at ${boundary} retains exact owned parts and refuses foreign joins`, () => Effect.gen(function* () {
      const deliveryGate = yield* barrier()
      const cleanupGate = yield* barrier()
      const fixture = yield* host((part) => part.callID === "a" && part.state.status === "completed" && part.state.metadata.delivery
        ? deliveryGate.pause : Effect.void)
      for (const id of ["a", "b"]) {
        yield* fixture.delegation.dispatch(yield* fixture.call(id, background), fixture.actor)
        fixture.join.taskStarted({ toolUseID: id, taskID: `task-${id}` })
        yield* fixture.delegation.settle(launch(id, `task-${id}`))
      }
      fixture.delegation.stop("task-b", "Sibling evidence stays exact.\r\n")
      yield* fixture.delegation.notify(notice("task-b", "b"))
      const sibling = yield* fixture.part("b")
      const siblingHistory = yield* fixture.sessions.messages({ sessionID: fixture.join.child("b")! })
      const child = fixture.join.child("a")!
      const prompt = (yield* fixture.sessions.messages({ sessionID: child }))[0].info
      const blocks = ["Repeated evidence café\r\n  exact", "Rejected final sentinel"]
      const earlier = yield* fixture.sessions.updateMessage({ ...fixture.message, id: MessageID.ascending(), sessionID: child,
        parentID: prompt.id, agent: "patty", mode: "patty", finish: "stop", time: { created: 1, completed: 2 } })
      yield* Effect.forEach(blocks, (text) => fixture.sessions.updatePart({ id: PartID.ascending(), sessionID: child,
        messageID: earlier.id, type: "text", text }))
      const author = yield* fixture.sessions.updateMessage({ ...earlier, id: MessageID.ascending(), time: { created: 3, completed: 4 } })
      const parts = yield* Effect.forEach(blocks, (text) => fixture.sessions.updatePart({ id: PartID.ascending(), sessionID: child,
        messageID: author.id, type: "text", text }))
      fixture.authors.set("a", author.id)
      const before = yield* fixture.sessions.messages({ sessionID: child })
      const hook = { ...launch("a", "task-a"), tool_response: { status: "completed", agentId: "task-a",
        content: blocks.map((text) => ({ type: "text", text })) } }
      const hold = "HOLD: Agent output refused by ToolSafety inspection"
      const writes = { seen: 0 }
      const delivery = yield* fixture.delegation.notify(notice("task-a", "a")).pipe(Effect.forkChild)
      yield* deliveryGate.wait
      const refusal = yield* fixture.delegation.settle(hook, "refused").pipe(Effect.provideService(Session.Service, {
        ...fixture.sessions, updatePart: <T extends SessionV1.Part>(part: T) => Effect.suspend(() => {
          const pause = part.type === "text" && part.messageID === author.id && part.text === hold &&
            writes.seen++ === (boundary === "second-write" ? 1 : 0)
          return (pause ? cleanupGate.pause : Effect.void).pipe(Effect.andThen(fixture.sessions.updatePart(part)))
        }),
      }), Effect.forkChild({ startImmediately: true }))
      yield* deliveryGate.open
      yield* Fiber.join(delivery)
      yield* cleanupGate.wait
      expect(fixture.join.get("a")?.hold).toBe(hold)
      yield* Fiber.interrupt(refusal)
      const interrupted = yield* fixture.sessions.messages({ sessionID: child })
      const pending = yield* fixture.part("a")
      expect(pending?.state.status === "completed" && pending.state.metadata.delivery).toMatchObject({ taskID: "task-a" })
      expect(pending?.state.status === "completed" && pending.state.metadata.hold).toBeUndefined()
      expect(fixture.delegation.summaries().find((entry) => entry.toolUseID === "a")?.settled).toBe(false)
      expect(interrupted.find((message) => message.info.id === earlier.id)).toEqual(before.find((message) => message.info.id === earlier.id))
      expect(interrupted.find((message) => message.info.id === author.id)?.parts.filter((part) => part.type === "text").map((part) => part.text))
        .toEqual(boundary === "second-write" ? [hold, blocks[1]] : blocks)
      yield* fixture.delegation.fail({ ...base, hook_event_name: "PostToolUseFailure", tool_name: "Agent", tool_use_id: "a",
        tool_input: background, error: "Native interruption after admitted refusal", is_interrupt: true })
      expect(yield* fixture.part("a")).toEqual(pending)
      expect(yield* fixture.sessions.messages({ sessionID: child })).toEqual(interrupted)
      if (boundary === "foreign-hold") {
        fixture.join.hold("a", "HOLD: conflicting native identity")
        expect(Exit.isFailure(yield* Effect.exit(fixture.delegation.settle(hook, "refused")))).toBe(true)
        expect(fixture.join.get("a")?.hold).toBe("HOLD: conflicting native identity")
        expect(yield* fixture.part("a")).toEqual(pending)
        expect(yield* fixture.sessions.messages({ sessionID: child })).toEqual(interrupted)
        expect(fixture.delegation.summaries().find((entry) => entry.toolUseID === "a")?.settled).toBe(false)
        expect(yield* fixture.part("b")).toEqual(sibling)
        expect(yield* fixture.sessions.messages({ sessionID: fixture.join.child("b")! })).toEqual(siblingHistory)
        return
      }
      expect(yield* fixture.delegation.settle(hook, "refused")).toContain("HOLD")
      const held = yield* fixture.part("a")
      if (held?.state.status !== "completed") throw new Error("Expected completed cleanup HOLD")
      expect(held.state.output).toBe(hold)
      expect(held.state.metadata.hold).toBe(hold)
      expect(held.state.metadata.claudeCodeDispatch).toBeUndefined()
      expect(held.state.metadata.delivery).toBeUndefined()
      expect(held.state.metadata.workResult).toBeUndefined()
      expect(fixture.delegation.summaries().find((entry) => entry.toolUseID === "a")?.settled).toBe(true)
      const history = yield* fixture.sessions.messages({ sessionID: child })
      expect(history.find((message) => message.info.id === earlier.id)).toEqual(before.find((message) => message.info.id === earlier.id))
      expect(history.find((message) => message.info.id === author.id)?.parts).toEqual(parts.map((part) => ({ ...part, text: hold })))
      expect(yield* fixture.part("b")).toEqual(sibling)
      expect(yield* fixture.sessions.messages({ sessionID: fixture.join.child("b")! })).toEqual(siblingHistory)
      yield* fixture.delegation.settle(hook, "refused")
      yield* fixture.delegation.notify(notice("task-a", "a"))
      expect(yield* fixture.part("a")).toEqual(held)
      expect(yield* fixture.sessions.messages({ sessionID: child })).toEqual(history)
    }))

  it.instance("refusal queued behind delivery sanitizes its recorded author and durably replaces the parent with HOLD", () => Effect.gen(function* () {
    const gate = yield* barrier()
    const fixture = yield* host((part) => part.state.status === "completed" && part.state.metadata.delivery ? gate.pause : Effect.void)
    yield* fixture.delegation.dispatch(yield* fixture.call("a", background), fixture.actor)
    fixture.join.taskStarted({ toolUseID: "a", taskID: "task-a" })
    yield* fixture.delegation.settle(launch("a", "task-a"))
    const child = fixture.join.child("a")!
    const prompt = (yield* fixture.sessions.messages({ sessionID: child }))[0].info
    const benign = "Earlier review café\r\n  exact evidence\n"
    const earlier = yield* fixture.sessions.updateMessage({ id: MessageID.ascending(), sessionID: child, parentID: prompt.id, role: "assistant",
      agent: "patty", mode: "patty", modelID: model.modelID, providerID: model.providerID,
      path: { cwd: fixture.parent.directory, root: fixture.parent.directory }, cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, finish: "stop", time: { created: 1, completed: 2 } })
    yield* fixture.sessions.updatePart({ id: PartID.ascending(), sessionID: child, messageID: earlier.id, type: "text", text: benign })
    yield* fixture.sessions.updatePart({ id: PartID.ascending(), sessionID: child, messageID: earlier.id, type: "text", text: benign })
    const before = (yield* fixture.sessions.messages({ sessionID: child })).find((item) => item.info.id === earlier.id)!
    const rejected = `${benign}Rejected final sentinel`
    fixture.delegation.stop("task-a", rejected)
    const delivery = yield* fixture.delegation.notify(notice("task-a", "a")).pipe(Effect.forkChild)
    yield* gate.wait
    const refusal = yield* fixture.delegation.settle({ ...launch("a", "task-a"),
      tool_response: { status: "completed", agentId: "task-a", content: [{ type: "text", text: rejected }] } }, "refused")
      .pipe(Effect.forkChild({ startImmediately: true }))
    yield* gate.open
    yield* Fiber.join(delivery)
    expect(yield* Fiber.join(refusal)).toContain("HOLD")
    const part = yield* fixture.part("a")
    if (part?.state.status !== "completed") throw new Error("Expected retained HOLD")
    expect(part.state.output).toBe("HOLD: Agent output refused by ToolSafety inspection")
    expect(part.state.metadata.hold).toBe(part.state.output)
    expect(part.state.metadata.claudeCodeDispatch).toBeUndefined()
    expect(part.state.metadata.delivery).toBeUndefined()
    expect(part.state.metadata.workResult).toBeUndefined()
    const history = yield* fixture.sessions.messages({ sessionID: child })
    expect(history.find((item) => item.info.id === earlier.id)).toEqual(before)
    expect(history.filter((item) => item.info.role === "assistant")).toHaveLength(2)
    expect(history.at(-1)?.parts.filter((part) => part.type === "text").map((part) => part.text)).toEqual([part.state.output])
    yield* fixture.delegation.notify(notice("task-a", "a"))
    expect(yield* fixture.part("a")).toEqual(part)
    yield* fixture.delegation.dispatch(pre("a", background), fixture.actor)
    yield* fixture.delegation.settle(launch("a", "task-a"))
    yield* fixture.delegation.settle({ ...launch("a", "task-a"), tool_response: { status: "completed", agentId: "task-a",
      content: [{ type: "text", text: "different late refusal" }] } }, "refused")
    expect(yield* fixture.part("a")).toEqual(part)
    expect(yield* fixture.sessions.messages({ sessionID: child })).toEqual(history)
  }))

  it.instance("a refused replay admitted after delivery never rewrites settled history", () => Effect.gen(function* () {
    const fixture = yield* host()
    const call = yield* fixture.call("a", background)
    yield* fixture.delegation.dispatch(call, fixture.actor)
    fixture.join.taskStarted({ toolUseID: "a", taskID: "task-a" })
    fixture.delegation.stop("task-a", "Accepted review.")
    yield* fixture.delegation.settle(launch("a", "task-a"))
    yield* fixture.delegation.notify(notice("task-a", "a"))
    const parent = yield* fixture.part("a")
    const child = yield* fixture.sessions.messages({ sessionID: fixture.join.child("a")! })
    yield* fixture.delegation.dispatch(call, fixture.actor)
    expect(yield* fixture.delegation.settle({ ...launch("a", "task-a"), tool_response: { status: "completed", agentId: "task-a",
      content: [{ type: "text", text: "Rejected replay." }] } }, "refused")).toBeUndefined()
    expect(yield* fixture.part("a")).toEqual(parent)
    expect(yield* fixture.sessions.messages({ sessionID: fixture.join.child("a")! })).toEqual(child)
    expect(fixture.join.get("a")?.hold).toBeUndefined()
  }))

  it.instance("interrupted queued refusal keeps its admission through delivery and exact retry retains HOLD", () => Effect.gen(function* () {
    const gate = yield* barrier()
    const fixture = yield* host((part) => part.state.status === "completed" && part.state.metadata.delivery ? gate.pause : Effect.void)
    yield* fixture.delegation.dispatch(yield* fixture.call("a", background), fixture.actor)
    fixture.join.taskStarted({ toolUseID: "a", taskID: "task-a" })
    yield* fixture.delegation.settle(launch("a", "task-a"))
    fixture.delegation.stop("task-a", "Rejected final.")
    const delivery = yield* fixture.delegation.notify(notice("task-a", "a")).pipe(Effect.forkChild)
    yield* gate.wait
    const hook = { ...launch("a", "task-a"), tool_response: { status: "completed", agentId: "task-a",
      content: [{ type: "text", text: "Rejected final." }] } }
    // Immediate start admits the refusal and reaches the occupied semaphore before interruption.
    const refusal = yield* fixture.delegation.settle(hook, "refused").pipe(Effect.forkChild({ startImmediately: true }))
    yield* Fiber.interrupt(refusal)
    yield* gate.open
    yield* Fiber.join(delivery)
    const delivered = yield* fixture.part("a")
    expect(delivered?.state.status === "completed" && delivered.state.metadata.delivery).toMatchObject({ taskID: "task-a" })
    expect(yield* fixture.delegation.settle(hook, "refused")).toContain("HOLD")
    const held = yield* fixture.part("a")
    if (held?.state.status !== "completed") throw new Error("Expected retried refusal HOLD")
    expect(held.state.output).toBe("HOLD: Agent output refused by ToolSafety inspection")
    expect(held.state.metadata.hold).toBe(held.state.output)
    expect(held.state.metadata.claudeCodeDispatch).toBeUndefined()
    expect(held.state.metadata.delivery).toBeUndefined()
    expect(held.state.metadata.workResult).toBeUndefined()
    const history = yield* fixture.sessions.messages({ sessionID: fixture.join.child("a")! })
    expect(history.filter((message) => message.info.role === "assistant")).toHaveLength(1)
    expect(history.at(-1)?.parts.filter((part) => part.type === "text").map((part) => part.text)).toEqual([held.state.output])
    yield* fixture.delegation.settle(hook, "refused")
    yield* fixture.delegation.notify(notice("task-a", "a"))
    expect(yield* fixture.part("a")).toEqual(held)
    expect(yield* fixture.sessions.messages({ sessionID: fixture.join.child("a")! })).toEqual(history)
  }))

  it.instance("queued refusal retries a failed HOLD save after delivery without restoring attribution", () => Effect.gen(function* () {
    const gate = yield* barrier()
    const failures = { remaining: 1 }
    const fixture = yield* host((part) => {
      if (part.state.status !== "completed") return Effect.void
      if (part.state.metadata.delivery) return gate.pause
      return Effect.sync(() => {
        if (part.state.status === "completed" && part.state.metadata.hold && failures.remaining-- > 0)
          throw new Error("HOLD persistence boundary failed")
      })
    })
    yield* fixture.delegation.dispatch(yield* fixture.call("a", background), fixture.actor)
    fixture.join.taskStarted({ toolUseID: "a", taskID: "task-a" })
    fixture.delegation.stop("task-a", "Rejected final.")
    yield* fixture.delegation.settle(launch("a", "task-a"))
    const delivery = yield* fixture.delegation.notify(notice("task-a", "a")).pipe(Effect.forkChild)
    yield* gate.wait
    const hook = { ...launch("a", "task-a"), tool_response: { status: "completed", agentId: "task-a",
      content: [{ type: "text", text: "Rejected final." }] } }
    const refusal = yield* fixture.delegation.settle(hook, "refused").pipe(Effect.exit, Effect.forkChild({ startImmediately: true }))
    yield* gate.open
    yield* Fiber.join(delivery)
    expect(Exit.isFailure(yield* Fiber.join(refusal))).toBe(true)
    expect(fixture.delegation.summaries()[0].settled).toBe(false)
    expect(yield* fixture.delegation.settle(hook, "refused")).toContain("HOLD")
    const part = yield* fixture.part("a")
    if (part?.state.status !== "completed") throw new Error("Expected retained HOLD retry")
    expect(part.state.metadata.hold).toBe(part.state.output)
    expect(part.state.metadata.claudeCodeDispatch).toBeUndefined()
    expect(part.state.metadata.delivery).toBeUndefined()
    expect(fixture.delegation.summaries()[0].settled).toBe(true)
    const history = yield* fixture.sessions.messages({ sessionID: fixture.join.child("a")! })
    expect(history.filter((message) => message.info.role === "assistant")).toHaveLength(1)
    expect(history.at(-1)?.parts.filter((part) => part.type === "text").map((part) => part.text)).toEqual([part.state.output])
  }))

  it.instance("a crossed pair cannot settle B or swallow A; task-only notices deliver once", () => Effect.gen(function* () {
    const fixture = yield* host()
    for (const id of ["a", "b"]) {
      yield* fixture.delegation.dispatch(yield* fixture.call(id, background), fixture.actor)
      fixture.join.taskStarted({ toolUseID: id, taskID: `task-${id}` })
      yield* fixture.delegation.settle(launch(id, `task-${id}`))
    }
    const received: SDKTaskNotificationMessage[] = []
    const unsubscribe = fixture.join.subscribe((frame) => { received.push(frame) })
    fixture.join.taskNotification(notice("task-a", "b"))
    yield* fixture.delegation.notify(notice("task-a", "b"))
    expect(received).toHaveLength(0)
    expect(fixture.delegation.summaries().every((item) => !item.settled)).toBe(true)
    const valid = notice("task-a")
    fixture.join.taskNotification(valid)
    expect(received).toEqual([valid])
    yield* fixture.delegation.notify(valid)
    fixture.join.taskNotification({ ...valid, summary: "duplicate" })
    yield* fixture.delegation.notify({ ...valid, summary: "duplicate" })
    expect(received).toHaveLength(1)
    const a = yield* fixture.part("a")
    const b = yield* fixture.part("b")
    expect(a?.state.status === "completed" && a.state.metadata.delivery).toMatchObject({ taskID: "task-a", summary: "Reviewed." })
    expect(b?.state.status === "completed" && b.state.metadata.delivery).toBeUndefined()
    yield* fixture.delegation.notify(notice("task-b", "b"))
    expect(fixture.delegation.summaries().every((item) => item.settled)).toBe(true)
    unsubscribe()
  }))

  it.instance("an established join HOLD refuses notifications without attribution or delivery", () => Effect.gen(function* () {
    const fixture = yield* host()
    yield* fixture.delegation.dispatch(yield* fixture.call("a", background), fixture.actor)
    fixture.join.taskStarted({ toolUseID: "a", taskID: "task-a" })
    yield* fixture.delegation.settle(launch("a", "task-a"))
    fixture.join.hold("a", "HOLD: conflicting native identity")
    fixture.delegation.stop("task-a", "Unaccepted final.")
    yield* fixture.delegation.notify(notice("task-a", "a"))
    expect(fixture.delegation.summaries()[0].settled).toBeFalsy()
    const part = yield* fixture.part("a")
    expect(part?.state.status === "completed" && part.state.metadata.delivery).toBeUndefined()
    expect((yield* fixture.sessions.messages({ sessionID: fixture.join.child("a")! })).filter((item) => item.info.role === "assistant")).toHaveLength(0)
  }))

  it.instance("notification during launch save waits for durable launch retention", () => Effect.gen(function* () {
    const gate = yield* barrier()
    const fixture = yield* host((part) => part.state.status === "completed" && !part.state.metadata.delivery ? gate.pause : Effect.void)
    yield* fixture.delegation.dispatch(yield* fixture.call("a", background), fixture.actor)
    fixture.join.taskStarted({ toolUseID: "a", taskID: "task-a" })
    const launching = yield* fixture.delegation.settle(launch("a", "task-a")).pipe(Effect.forkChild)
    yield* gate.wait
    // Start immediately so notify attempts the occupied semaphore before launch persistence is released.
    const notifying = yield* fixture.delegation.notify(notice("task-a")).pipe(Effect.forkChild({ startImmediately: true }))
    expect((yield* fixture.part("a"))?.state.status).toBe("running")
    expect(fixture.delegation.summaries()[0].settled).toBeFalsy()
    yield* gate.open
    yield* Fiber.join(launching)
    yield* Fiber.join(notifying)
    const part = yield* fixture.part("a")
    expect(part?.state.status === "completed" && part.state.metadata.delivery).toMatchObject({ taskID: "task-a" })
    expect(fixture.delegation.summaries()[0].settled).toBe(true)
    // A notification alone carries delivery, never an invented author from SubagentStop.
    expect((yield* fixture.sessions.messages({ sessionID: fixture.join.child("a")! })).filter((item) => item.info.role === "assistant")).toHaveLength(0)
  }))

  it.instance("pending notification survives a failed launch save and exact settlement retry", () => Effect.gen(function* () {
    const failures = { remaining: 1 }
    const fixture = yield* host((part) => Effect.sync(() => {
      if (part.state.status === "completed" && !part.state.metadata.delivery && failures.remaining-- > 0) throw new Error("launch persistence boundary failed")
    }))
    yield* fixture.delegation.dispatch(yield* fixture.call("a", background), fixture.actor)
    fixture.join.taskStarted({ toolUseID: "a", taskID: "task-a" })
    yield* fixture.delegation.notify(notice("task-a"))
    expect(Exit.isFailure(yield* Effect.exit(fixture.delegation.settle(launch("a", "task-a"))))).toBe(true)
    expect(fixture.delegation.summaries()[0].settled).toBeFalsy()
    expect((yield* fixture.part("a"))?.state.status).toBe("running")
    yield* fixture.delegation.settle(launch("a", "task-a"))
    const part = yield* fixture.part("a")
    expect(part?.state.status === "completed" && part.state.metadata.delivery).toMatchObject({ taskID: "task-a" })
  }))

  it.instance("failed delivery save stays retryable and dedup starts only after durable persistence", () => Effect.gen(function* () {
    const failures = { remaining: 1 }
    const fixture = yield* host((part) => Effect.sync(() => {
      if (part.state.status === "completed" && part.state.metadata.delivery && failures.remaining-- > 0) throw new Error("delivery persistence boundary failed")
    }))
    yield* fixture.delegation.dispatch(yield* fixture.call("a", background), fixture.actor)
    fixture.join.taskStarted({ toolUseID: "a", taskID: "task-a" })
    fixture.delegation.stop("task-a", "Reviewed.")
    yield* fixture.delegation.settle(launch("a", "task-a"))
    const received: SDKTaskNotificationMessage[] = []
    const unsubscribe = fixture.join.subscribe((frame) => { received.push(frame) })
    const frame = notice("task-a", "a")
    fixture.join.taskNotification(frame)
    expect(Exit.isFailure(yield* Effect.exit(fixture.delegation.notify(frame)))).toBe(true)
    expect(fixture.delegation.summaries()[0].settled).toBeFalsy()
    fixture.join.taskNotification(frame)
    expect(received).toHaveLength(2)
    yield* fixture.delegation.notify(frame)
    fixture.join.taskNotification(frame)
    expect(received).toHaveLength(2)
    const part = yield* fixture.part("a")
    expect(part?.state.status === "completed" && part.state.metadata.delivery).toMatchObject({ taskID: "task-a" })
    // Retrying a failed delivery must reconcile the already-retained author too.
    expect((yield* fixture.sessions.messages({ sessionID: fixture.join.child("a")! })).filter((item) => item.info.role === "assistant")).toHaveLength(1)
    unsubscribe()
  }))
})

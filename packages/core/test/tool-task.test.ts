import { describe, expect } from "bun:test"
import { LLMClient, LLMError, LLMEvent, TransportReason, type LLMRequest } from "@orchestra/llm"
import { AgentV2 } from "@orchestra/core/agent"
import { Catalog } from "@orchestra/core/catalog"
import { Config } from "@orchestra/core/config"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Integration } from "@orchestra/core/integration"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import type { LocationServices } from "@orchestra/core/location-services"
import { ModelV2 } from "@orchestra/core/model"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { ProjectV2 } from "@orchestra/core/project"
import { ProviderV2 } from "@orchestra/core/provider"
import { ReferenceGuidance } from "@orchestra/core/reference/guidance"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionRunCoordinator } from "@orchestra/core/session/run-coordinator"
import { SessionRunner } from "@orchestra/core/session/runner"
import { node } from "@orchestra/core/session/runner/llm"
import { SessionInputTable, SessionTable } from "@orchestra/core/session/sql"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { Snapshot } from "@orchestra/core/snapshot"
import { SystemContext } from "@orchestra/core/system-context"
import { TaskTool } from "@orchestra/core/tool/task"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Context, DateTime, Deferred, Effect, Fiber, Layer, LayerMap, Schema, Stream } from "effect"
import { eq } from "drizzle-orm"
import { testEffect } from "./lib/effect"
import { settleTool } from "./lib/tool"

const directory = AbsolutePath.make("/task-fixture")
const caller = AgentV2.ID.make("caller")
const worker = AgentV2.ID.make("worker")
const providerID = ProviderV2.ID.make("task-provider")
const cheap = ModelV2.Ref.make({ providerID, id: ModelV2.ID.make("cheap") })
const expensive = ModelV2.Ref.make({ providerID, id: ModelV2.ID.make("expensive") })

class Harness extends Context.Service<Harness, {
  readonly runner: Deferred.Deferred<SessionRunner.Interface>
  readonly requests: LLMRequest[]
  readonly resumes: SessionV2.ID[]
  readonly gates: Map<string, { started: Deferred.Deferred<void>; release: Deferred.Deferred<void> }>
}>()("test/TaskHarness") {}

const harnessLayer = Layer.effect(Harness, Effect.gen(function* () {
  return { runner: yield* Deferred.make<SessionRunner.Interface>(), requests: [], resumes: [], gates: new Map() }
}))

const client = Layer.effect(LLMClient.Service, Effect.gen(function* () {
  const harness = yield* Harness
  return LLMClient.Service.of({
    prepare: () => Effect.die("Unexpected prepare"),
    generate: () => Effect.die("Unexpected generate"),
    stream: (request) => Stream.unwrap(Effect.gen(function* () {
      harness.requests.push(request)
      const prompt = request.messages.filter((message) => message.role === "user").at(-1)?.content
        .flatMap((part) => part.type === "text" ? [part.text] : []).join("\n") ?? ""
      const gate = harness.gates.get(prompt)
      if (gate) {
        yield* Deferred.succeed(gate.started, undefined)
        yield* Deferred.await(gate.release)
      }
      if (prompt === "fail") return Stream.fail(new LLMError({
        module: "test", method: "stream", reason: new TransportReason({ message: "child provider failed" }),
      }))
      return Stream.fromIterable([
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.textStart({ id: "answer" }),
        LLMEvent.textDelta({ id: "answer", text: `answer:${prompt}` }),
        LLMEvent.textEnd({ id: "answer" }),
        LLMEvent.stepFinish({ index: 0, reason: "stop" }),
        LLMEvent.finish({ reason: "stop" }),
      ])
    })),
  })
})).pipe(Layer.provide(harnessLayer))

// The production serialized coordinator owns the drain; binding waits until the real runner graph is built.
const execution = Layer.effect(SessionExecution.Service, Effect.gen(function* () {
  const harness = yield* Harness
  const coordinator = yield* SessionRunCoordinator.make<SessionV2.ID, SessionRunner.RunError>({
    drain: (sessionID, force) => Deferred.await(harness.runner).pipe(
      Effect.flatMap((runner) => runner.run({ sessionID, force })),
    ),
  })
  return SessionExecution.Service.of({
    active: coordinator.active,
    resume: (sessionID, options) => Effect.sync(() => harness.resumes.push(sessionID)).pipe(
      Effect.andThen(coordinator.run(sessionID, options)),
    ),
    wake: coordinator.wake,
    interrupt: coordinator.interrupt,
    exclusive: coordinator.exclusive,
    withRunner: (_, use) => Deferred.await(harness.runner).pipe(Effect.flatMap(use)),
  })
})).pipe(Layer.provide(harnessLayer))

const it = testEffect(AppNodeBuilder.build(LayerNode.group([
  Database.node, EventV2.node, AgentV2.node, Catalog.node, Integration.node, PermissionV2.node, PermissionSaved.node,
  SessionSubagentModels.node, SessionExecution.node, SessionV2.node, Credential.node,
  ToolRegistry.node, ToolRegistry.toolsNode, TaskTool.node, node,
]), [
  [Location.node, Layer.succeed(Location.Service, {
    directory, project: { id: ProjectV2.ID.global, directory },
  })],
  [ProjectV2.node, Layer.succeed(ProjectV2.Service, ProjectV2.Service.of({
    resolve: (directory) => Effect.succeed({ id: ProjectV2.ID.global, directory }),
    list: () => Effect.succeed([]),
    directories: () => Effect.die("Unexpected directories"),
    commit: () => Effect.die("Unexpected project commit"),
  }))],
  [LocationServiceMap.node, Layer.effect(LocationServiceMap.Service,
    LayerMap.make((_ref: Location.Ref) =>
      Layer.effectContext<LocationServices, never, never>(Effect.die("Unexpected hook Location acquisition"))))],
  [SessionExecution.node, execution],
  [LayerNodePlatform.llmClient, client],
  [Snapshot.node, Snapshot.noopLayer],
  [Config.node, Layer.succeed(Config.Service, { entries: () => Effect.succeed([]) })],
  [SkillGuidance.node, Layer.succeed(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
  [ReferenceGuidance.node, Layer.succeed(ReferenceGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
]).pipe(Layer.provideMerge(harnessLayer)))

const setup = Effect.gen(function* () {
  const harness = yield* Harness
  const runner = yield* SessionRunner.Service
  yield* Deferred.succeed(harness.runner, runner)
  const agents = yield* AgentV2.Service
  yield* agents.transform((draft) => {
    draft.update(caller, (agent) => { agent.permissions = [{ action: "task", resource: "*", effect: "allow" }] })
    draft.update(worker, (agent) => { agent.mode = "subagent"; agent.permissions = [{ action: "task", resource: "*", effect: "allow" }] })
    draft.update(AgentV2.defaultID, (agent) => { agent.mode = "primary" })
    draft.update(AgentV2.ID.make("other"), (agent) => { agent.permissions = [{ action: "task", resource: "*", effect: "deny" }] })
  })
  const catalog = yield* Catalog.Service
  yield* catalog.transform((draft) => {
    [cheap.id, expensive.id, ModelV2.ID.make("org/nested/model")].forEach((id) => draft.model.update(providerID, id, (model) => {
      model.enabled = true
      model.status = "active"
      model.api = { type: "aisdk", package: "@ai-sdk/openai", id: ModelV2.ID.make(`deployment-${id}`) }
      model.limit = { context: 100_000, output: 1_000 }
    }))
    draft.model.default.set(providerID, cheap.id)
  })
  const sessions = yield* SessionV2.Service
  const parent = yield* sessions.create({ location: { directory }, agent: caller, model: cheap })
  return {
    harness, agents, catalog, sessions, parent,
    registry: yield* ToolRegistry.Service,
    policy: yield* SessionSubagentModels.Service,
    permission: yield* PermissionV2.Service,
  }
})

const record = Effect.fn("TaskTest.record")(function* (
  sessionID: SessionV2.ID,
  id: string,
  params: Partial<typeof TaskTool.Input.Type> = {},
  assistantMessageID = SessionMessage.ID.create(),
) {
  const events = yield* EventV2.Service
  const timestamp = yield* DateTime.now
  const input = { description: "Focused task", prompt: id, subagent_type: worker, ...params }
  yield* events.publish(SessionEvent.Step.Started, { sessionID, assistantMessageID, timestamp, agent: caller, model: cheap })
  yield* events.publish(SessionEvent.Tool.Input.Started, { sessionID, assistantMessageID, timestamp, callID: id, name: "task" })
  yield* events.publish(SessionEvent.Tool.Input.Ended, { sessionID, assistantMessageID, timestamp, callID: id, text: JSON.stringify(input) })
  yield* events.publish(SessionEvent.Tool.Called, {
    sessionID, assistantMessageID, timestamp, callID: id, tool: "task", input, provider: { executed: false },
  })
  return {
    sessionID, agent: caller, assistantMessageID, model: cheap,
    call: { type: "tool-call" as const, id, name: "task", input },
  }
})

const result = (settlement: ToolRegistry.Settlement) => {
  if (settlement.result.type === "error") throw new Error(String(settlement.result.value))
  return Schema.decodeUnknownSync(TaskTool.Output)(settlement.output?.structured)
}

const gate = Effect.gen(function* () {
  return { started: yield* Deferred.make<void>(), release: yield* Deferred.make<void>() }
})

const inputRows = Effect.fn("TaskTest.inputRows")(function* (sessionID: SessionV2.ID) {
  const database = yield* Database.Service
  return yield* database.db.select().from(SessionInputTable)
    .where(eq(SessionInputTable.session_id, sessionID)).all().pipe(Effect.orDie)
})

describe("TaskTool canonical delegation", () => {
  it.effect("uses captured caller permissions, publishes child identity, returns real transcript, and reconciles exact retry", () => Effect.gen(function* () {
    const f = yield* setup
    yield* f.agents.transform((draft) => draft.update(caller, (agent) => { agent.permissions = [{ action: "task", resource: "*", effect: "ask" }] }))
    const call = yield* record(f.parent.id, "real")
    yield* f.sessions.switchAgent({ sessionID: f.parent.id, agent: "other" })
    const task = yield* settleTool(f.registry, call).pipe(Effect.forkChild)
    const asked = yield* Effect.repeat(f.permission.forSession(f.parent.id), { until: (requests) => requests.length === 1 })
    expect(asked[0]).toMatchObject({
      action: "task", resources: [worker, `${providerID}/cheap`],
      source: { type: "tool", messageID: call.assistantMessageID, callID: call.call.id },
    })
    expect((yield* f.sessions.list()).filter((session) => session.parentID === f.parent.id)).toHaveLength(0)
    yield* f.permission.reply({ requestID: asked[0].id, reply: "once" })
    const first = result(yield* Fiber.join(task))
    expect(first).toMatchObject({ agent: worker, text: "answer:real", sessionId: first.sessionID, parentSessionId: f.parent.id, agentId: worker })
    expect(first.sessionID).toMatch(/^ses_[0-9a-f]{64}$/)
    expect(yield* f.sessions.get(first.sessionID)).toMatchObject({ parentID: f.parent.id, agent: worker, model: cheap })
    expect(f.harness.requests).toHaveLength(1)
    expect(String(f.harness.requests[0].model.id)).toBe("deployment-cheap")
    expect(f.harness.requests[0].http?.headers).toMatchObject({ "x-parent-session-id": f.parent.id })
    const history = yield* f.sessions.history({ sessionID: f.parent.id, limit: 100 })
    expect(history.events).toEqual(expect.arrayContaining([expect.objectContaining({
      data: expect.objectContaining({ structured: expect.objectContaining({ sessionId: first.sessionID }) }),
    })]))
    yield* f.agents.transform((draft) => draft.update(caller, (agent) => { agent.permissions = [{ action: "task", resource: "*", effect: "allow" }] }))
    expect(result(yield* settleTool(f.registry, call))).toEqual(first)
    expect((yield* settleTool(f.registry, { ...call, call: { ...call.call, input: { ...call.call.input, prompt: "conflicting retry" } } })).result.type).toBe("error")
    expect(f.harness.requests).toHaveLength(1)
    const database = yield* Database.Service
    expect(yield* database.db.select().from(SessionInputTable).where(eq(SessionInputTable.session_id, first.sessionID)).all().pipe(Effect.orDie)).toHaveLength(1)
    expect((yield* f.sessions.messages({ sessionID: first.sessionID, order: "asc" })).filter((message) => message.type === "user")).toHaveLength(1)
  }))

  it.effect("rejects forbidden explicit and configured models before creating a child", () => Effect.gen(function* () {
    const f = yield* setup
    yield* f.policy.set(f.parent.id, { mode: "allowlist", models: [cheap] })
    const explicit = yield* record(f.parent.id, "explicit", { model: `${providerID}/expensive` })
    expect((yield* settleTool(f.registry, explicit)).result).toMatchObject({ type: "error", value: expect.stringContaining("Subagent model denied") })
    yield* f.agents.transform((draft) => draft.update(worker, (agent) => { agent.model = expensive }))
    expect((yield* settleTool(f.registry, yield* record(f.parent.id, "configured"))).result).toMatchObject({ type: "error", value: expect.stringContaining("Subagent model denied") })
    expect((yield* f.sessions.list()).filter((session) => session.parentID === f.parent.id)).toHaveLength(0)
    expect(f.harness.requests).toHaveLength(0)
  }))

  it.effect("captured caller deny wins even when the Session switches to an allowed agent", () => Effect.gen(function* () {
    const f = yield* setup
    const call = yield* record(f.parent.id, "caller-denied")
    yield* f.agents.transform((draft) => draft.update(caller, (agent) => { agent.permissions = [{ action: "task", resource: "*", effect: "deny" }] }))
    yield* f.sessions.switchAgent({ sessionID: f.parent.id, agent: worker })
    expect((yield* settleTool(f.registry, call)).result.type).toBe("error")
    expect((yield* f.sessions.list()).filter((session) => session.parentID === f.parent.id)).toHaveLength(0)
    expect(f.harness.requests).toHaveLength(0)
  }))

  it.effect("explicit model overrides configured model; configured model overrides inherited model", () => Effect.gen(function* () {
    const f = yield* setup
    yield* f.agents.transform((draft) => draft.update(worker, (agent) => { agent.mode = "all"; agent.model = expensive }))
    const configured = result(yield* settleTool(f.registry, yield* record(f.parent.id, "config-precedence")))
    expect(configured.model).toMatchObject(expensive)
    const explicit = result(yield* settleTool(f.registry, yield* record(f.parent.id, "explicit-precedence", { model: `${providerID}/cheap` })))
    expect(explicit.model).toMatchObject(cheap)
    expect(f.harness.requests.map((request) => String(request.model.id))).toEqual(["deployment-expensive", "deployment-cheap"])
  }))

  it.effect("automatic selection falls back from forbidden inherited identity to allowed supported candidate", () => Effect.gen(function* () {
    const f = yield* setup
    yield* f.policy.set(f.parent.id, { mode: "allowlist", models: [expensive] })
    const output = result(yield* settleTool(f.registry, yield* record(f.parent.id, "fallback")))
    expect(output.model).toMatchObject(expensive)
    expect(f.harness.requests).toHaveLength(1)
    expect(String(f.harness.requests[0].model.id)).toBe("deployment-expensive")
  }))

  it.effect("automatic selection skips unsupported default; explicit unsupported model fails before creation", () => Effect.gen(function* () {
    const f = yield* setup
    yield* f.catalog.transform((draft) => draft.model.update(providerID, cheap.id, (model) => {
      model.api = { type: "native", id: cheap.id, settings: {} }
    }))
    const output = result(yield* settleTool(f.registry, yield* record(f.parent.id, "supported")))
    expect(output.model?.id === cheap.id).toBe(false)
    expect(f.harness.requests).toHaveLength(1)
    const call = yield* record(f.parent.id, "unsupported", { model: `${providerID}/cheap` })
    expect((yield* settleTool(f.registry, call)).result).toMatchObject({ type: "error", value: expect.stringContaining("model unavailable") })
    expect((yield* f.sessions.list()).filter((session) => session.parentID === f.parent.id)).toHaveLength(1)
  }))

  it.effect("deny-all ceiling cannot be bypassed by saved task grants", () => Effect.gen(function* () {
    const f = yield* setup
    const saved = yield* PermissionSaved.Service
    yield* saved.add({ projectID: f.parent.projectID, action: "task", resources: ["*"] })
    yield* f.policy.set(f.parent.id, { mode: "allowlist", models: [] })
    expect((yield* settleTool(f.registry, yield* record(f.parent.id, "deny-all"))).result).toMatchObject({ type: "error", value: expect.stringContaining("No supported task model") })
    expect((yield* f.sessions.list()).filter((session) => session.parentID === f.parent.id)).toHaveLength(0)
    expect(f.harness.requests).toHaveLength(0)
  }))

  it.effect("approval cannot widen a hard ceiling changed while permission waits", () => Effect.gen(function* () {
    const f = yield* setup
    yield* f.agents.transform((draft) => draft.update(caller, (agent) => { agent.permissions = [{ action: "task", resource: "*", effect: "ask" }] }))
    const task = yield* settleTool(f.registry, yield* record(f.parent.id, "approval")).pipe(Effect.forkChild)
    const asked = yield* Effect.repeat(f.permission.forSession(f.parent.id), { until: (requests) => requests.length === 1 })
    yield* f.policy.set(f.parent.id, { mode: "allowlist", models: [] })
    yield* f.permission.reply({ requestID: asked[0].id, reply: "always" })
    expect((yield* Fiber.join(task)).result).toMatchObject({ type: "error", value: expect.stringContaining("Subagent model denied") })
    expect((yield* f.sessions.list()).filter((session) => session.parentID === f.parent.id)).toHaveLength(0)
  }))

  it.effect("a child's wider outgoing policy never overrides an ancestor ceiling", () => Effect.gen(function* () {
    const f = yield* setup
    yield* f.policy.set(f.parent.id, { mode: "allowlist", models: [cheap] })
    const child = result(yield* settleTool(f.registry, yield* record(f.parent.id, "child")))
    yield* f.policy.set(child.sessionID, { mode: "allowlist", models: [expensive] })
    const call = yield* record(child.sessionID, "grandchild", { model: `${providerID}/expensive` })
    expect((yield* settleTool(f.registry, call)).result).toMatchObject({ type: "error", value: expect.stringContaining("Subagent model denied") })
    expect((yield* f.sessions.list()).filter((session) => session.parentID === child.sessionID)).toHaveLength(0)
    expect(f.harness.requests).toHaveLength(1)
  }))

  it.effect("preserves first-slash nested model and exact virtual-provider identity", () => Effect.gen(function* () {
    const f = yield* setup
    const credentials = yield* Credential.Service
    const integrations = yield* Integration.Service
    yield* integrations.transform((draft) => draft.update(Integration.ID.make(providerID), () => {}))
    const credential = yield* credentials.create({ integrationID: Integration.ID.make(providerID), label: "task-key", value: Credential.Key.make({ type: "key", key: "fixture-key" }) })
    const ref = ModelV2.Ref.make({ providerID: ProviderV2.ID.make(`${providerID}#${credential.id}`), id: ModelV2.ID.make("org/nested/model") })
    yield* f.policy.set(f.parent.id, { mode: "allowlist", models: [ref] })
    const output = result(yield* settleTool(f.registry, yield* record(f.parent.id, "nested", { model: `${ref.providerID}/${ref.id}` })))
    expect(output.model).toMatchObject(ref)
    expect(f.harness.requests).toHaveLength(1)
    expect(f.harness.requests[0].model).toMatchObject({ provider: ref.providerID, id: "deployment-org/nested/model" })
    expect((yield* settleTool(f.registry, yield* record(f.parent.id, "base", { model: `${providerID}/${ref.id}` }))).result).toMatchObject({ type: "error", value: expect.stringContaining("Subagent model denied") })
  }))

  it.effect("refuses foreign task IDs and adopted child agent, placement, or model changes", () => Effect.gen(function* () {
    const f = yield* setup
    const foreign = yield* f.sessions.create({ location: { directory }, agent: worker, model: cheap })
    expect((yield* settleTool(f.registry, yield* record(f.parent.id, "foreign", { task_id: foreign.id }))).result).toMatchObject({ type: "error", value: expect.stringContaining("mismatch") })
    expect((yield* f.sessions.get(foreign.id)).parentID).toBeUndefined()
    const call = yield* record(f.parent.id, "adopted")
    const child = result(yield* settleTool(f.registry, call))
    expect((yield* settleTool(f.registry, { ...call, call: { ...call.call, input: { ...call.call.input, model: `${providerID}/expensive` } } })).result).toMatchObject({ type: "error", value: expect.stringContaining("recorded called input") })
    expect((yield* settleTool(f.registry, yield* record(f.parent.id, "model-conflict", {
      task_id: child.sessionID, model: `${providerID}/expensive`,
    }))).result).toMatchObject({ type: "error", value: expect.stringContaining("cannot change") })
    yield* f.sessions.switchAgent({ sessionID: child.sessionID, agent: "other" })
    expect((yield* settleTool(f.registry, call)).result).toMatchObject({ type: "error", value: expect.stringContaining("mismatch") })
    const placed = yield* f.sessions.create({ parentID: f.parent.id, location: { directory: AbsolutePath.make("/other-placement") }, agent: worker, model: cheap })
    expect((yield* settleTool(f.registry, yield* record(f.parent.id, "placement", { task_id: placed.id }))).result).toMatchObject({ type: "error", value: expect.stringContaining("mismatch") })
    const modelCall = yield* record(f.parent.id, "stored-model")
    const modeled = result(yield* settleTool(f.registry, modelCall))
    yield* f.sessions.switchModel({ sessionID: modeled.sessionID, model: expensive })
    expect(result(yield* settleTool(f.registry, modelCall)).model).toMatchObject(expensive)
    expect((yield* f.sessions.get(modeled.sessionID)).model).toMatchObject(expensive)
    expect(f.harness.requests).toHaveLength(2)
  }))

  it.effect("same-call active retry joins one drain; sibling tasks run independently", () => Effect.gen(function* () {
    const f = yield* setup
    const left = yield* gate
    const right = yield* gate
    f.harness.gates.set("left", left)
    f.harness.gates.set("right", right)
    const leftCall = yield* record(f.parent.id, "left")
    const leftTask = yield* settleTool(f.registry, leftCall).pipe(Effect.forkChild)
    yield* Deferred.await(left.started)
    const retry = yield* settleTool(f.registry, leftCall).pipe(Effect.forkChild)
    const rightTask = yield* settleTool(f.registry, yield* record(f.parent.id, "right")).pipe(Effect.forkChild)
    yield* Deferred.await(right.started)
    const execution = yield* SessionExecution.Service
    expect((yield* execution.active).size).toBe(2)
    expect(f.harness.requests).toHaveLength(2)
    yield* Deferred.succeed(right.release, undefined)
    const rightOutput = result(yield* Fiber.join(rightTask))
    expect(rightOutput.text).toBe("answer:right")
    expect((yield* execution.active).size).toBe(1)
    yield* Deferred.succeed(left.release, undefined)
    const leftOutput = result(yield* Fiber.join(leftTask))
    expect(result(yield* Fiber.join(retry))).toEqual(leftOutput)
    expect(leftOutput.sessionID).not.toBe(rightOutput.sessionID)
    expect(f.harness.requests).toHaveLength(2)
  }))

  it.effect("parent interruption stops child ownership; idle promoted retry holds until explicit task_id", () => Effect.gen(function* () {
    const f = yield* setup
    const held = yield* gate
    f.harness.gates.set("held", held)
    const call = yield* record(f.parent.id, "held")
    const task = yield* settleTool(f.registry, call).pipe(Effect.forkChild)
    yield* Deferred.await(held.started)
    const child = (yield* f.sessions.list()).find((session) => session.parentID === f.parent.id)
    if (!child) throw new Error("Missing recorded child")
    yield* Fiber.interrupt(task)
    const execution = yield* SessionExecution.Service
    expect((yield* execution.active).size).toBe(0)
    expect((yield* settleTool(f.registry, call)).result).toMatchObject({ type: "error", value: expect.stringContaining("resume explicitly with task_id") })
    expect(f.harness.requests).toHaveLength(1)
    f.harness.gates.delete("held")
    expect(result(yield* settleTool(f.registry, { ...call, call: { ...call.call, input: { ...call.call.input, task_id: child.id } } })).text).toBe("answer:held")
    expect(f.harness.requests).toHaveLength(2)
  }))

  it.effect("typed child provider failure retains visible child ID and does not trigger implicit replay", () => Effect.gen(function* () {
    const f = yield* setup
    const call = yield* record(f.parent.id, "fail")
    const settled = yield* settleTool(f.registry, call)
    const child = (yield* f.sessions.list()).find((session) => session.parentID === f.parent.id)
    if (!child) throw new Error("Missing failed child")
    expect(settled.result.type).toBe("error")
    expect(String(settled.result.value)).toContain(child.id)
    expect(String(settled.result.value)).toContain("child provider failed")
    expect((yield* settleTool(f.registry, call)).result).toMatchObject({ type: "error", value: expect.stringContaining("resume explicitly with task_id") })
    expect(f.harness.requests).toHaveLength(1)
  }))

  it.effect("rejects forged invocation, hidden or primary targets, missing parents, cycles, and depth beyond eight", () => Effect.gen(function* () {
    const f = yield* setup
    const call = yield* record(f.parent.id, "identity")
    expect((yield* settleTool(f.registry, { ...call, agent: worker })).result.type).toBe("error")
    expect((yield* settleTool(f.registry, { ...call, sessionID: SessionV2.ID.make("ses_missing") })).result.type).toBe("error")
    const other = yield* f.sessions.create({ location: { directory }, agent: caller, model: cheap })
    expect((yield* settleTool(f.registry, { ...call, sessionID: other.id })).result.type).toBe("error")
    const placed = yield* f.sessions.create({ location: { directory: AbsolutePath.make("/other-placement") }, agent: caller, model: cheap })
    expect((yield* settleTool(f.registry, yield* record(placed.id, "wrong-parent-placement"))).result).toMatchObject({ type: "error", value: expect.stringContaining("parent placement mismatch") })
    yield* Effect.forEach(["maestro", "missing", "hidden", "primary", "external-engine"], (target) => Effect.gen(function* () {
      yield* f.agents.transform((draft) => draft.update(AgentV2.ID.make(target), (agent) => {
        if (target === "hidden") agent.hidden = true
        if (["primary", "maestro"].includes(target)) agent.mode = "primary"
        if (target === "external-engine") agent.engine = "claude-code"
      }))
      const targetCall = yield* record(f.parent.id, target, { subagent_type: target })
      // An unknown ID must stay absent, not become a fixture's newly created all-mode seat.
      if (target === "missing") yield* f.agents.transform((draft) => draft.remove(AgentV2.ID.make(target)))
      expect((yield* settleTool(f.registry, targetCall)).result.type).toBe("error")
    }))
    const parents = [f.parent]
    yield* Effect.forEach(Array.from({ length: 7 }), () => Effect.gen(function* () {
      const child = yield* f.sessions.create({ parentID: parents.at(-1)?.id, location: { directory }, agent: caller, model: cheap })
      parents.push(child)
    }))
    const deepest = result(yield* settleTool(f.registry, yield* record(parents[7].id, "depth-eight")))
    expect((yield* settleTool(f.registry, yield* record(deepest.sessionID, "depth-nine"))).result).toMatchObject({ type: "error", value: expect.stringContaining("depth exceeds 8") })
    const database = yield* Database.Service
    yield* database.db.update(SessionTable).set({ parent_id: f.parent.id }).where(eq(SessionTable.id, f.parent.id)).run().pipe(Effect.orDie)
    expect((yield* settleTool(f.registry, call)).result).toMatchObject({ type: "error", value: expect.stringContaining("cycle") })
    yield* database.db.update(SessionTable).set({ parent_id: SessionV2.ID.make("ses_missing_ancestor") }).where(eq(SessionTable.id, f.parent.id)).run().pipe(Effect.orDie)
    expect((yield* settleTool(f.registry, call)).result).toMatchObject({ type: "error", value: expect.stringContaining("ancestor not found") })
    expect(f.harness.requests).toHaveLength(1)
  }))
})

describe("TaskTool durable ownership regressions", () => {
  it.effect("durable ownership: legacy admitted steer delivery survives exact retry without replay", () => Effect.gen(function* () {
    const f = yield* setup
    const parent = yield* f.sessions.create({
      id: SessionV2.ID.make("ses_legacy_task"), location: { directory }, agent: caller, model: cheap,
    })
    const child = yield* f.sessions.create({
      id: SessionV2.ID.make("ses_legacy_child"), parentID: parent.id, location: { directory }, agent: worker, model: cheap,
    })
    const call = yield* record(parent.id, "legacy-steer", {
      task_id: child.id, prompt: "legacy input",
    }, SessionMessage.ID.make("msg_legacy_task"))
    // This is the pre-queue Task wire identity, not a test reimplementation of the resolver.
    const promptID = SessionMessage.ID.make("msg_619a765348f69b5b5eec26a785b0836c15c7ad644245e6e19c2cba713dfe2707")
    yield* f.sessions.prompt({
      id: promptID, sessionID: child.id, prompt: { text: "legacy input" }, delivery: "steer", resume: false,
    })
    const first = result(yield* settleTool(f.registry, call))
    expect(first.text).toBe("answer:legacy input")
    expect(result(yield* settleTool(f.registry, call))).toEqual(first)
    expect(f.harness.requests).toHaveLength(1)
    const rows = yield* inputRows(child.id)
    expect(rows.map((row) => ({ id: row.id, delivery: row.delivery }))).toEqual([{ id: promptID, delivery: "steer" }])
  }))

  it.effect("durable ownership: malformed called input cannot authorize an executor payload", () => Effect.gen(function* () {
    const f = yield* setup
    const call = yield* record(f.parent.id, "malformed-called")
    const events = yield* EventV2.Service
    yield* events.publish(SessionEvent.Tool.Called, {
      sessionID: f.parent.id, assistantMessageID: call.assistantMessageID,
      timestamp: yield* DateTime.now, callID: call.call.id, tool: "task", input: {}, provider: { executed: false },
    })
    expect((yield* settleTool(f.registry, call)).result).toMatchObject({
      type: "error", value: expect.stringContaining("valid recorded called input"),
    })
    expect(f.harness.requests).toHaveLength(0)
    expect((yield* f.sessions.list()).filter((session) => session.parentID === f.parent.id)).toHaveLength(0)
  }))

  it.effect("durable ownership: one recorded call cannot redirect task_id to another valid sibling", () => Effect.gen(function* () {
    const f = yield* setup
    const left = yield* f.sessions.create({ parentID: f.parent.id, location: { directory }, agent: worker, model: cheap })
    const right = yield* f.sessions.create({ parentID: f.parent.id, location: { directory }, agent: worker, model: cheap })
    const call = yield* record(f.parent.id, "redirect", { task_id: left.id })
    expect(result(yield* settleTool(f.registry, call)).sessionID).toBe(left.id)
    const redirected = yield* settleTool(f.registry, {
      ...call, call: { ...call.call, input: { ...call.call.input, task_id: right.id } },
    })
    expect({
      result: redirected.result.type,
      requests: f.harness.requests.length,
      leftInputs: (yield* inputRows(left.id)).length,
      rightInputs: (yield* inputRows(right.id)).length,
    }).toEqual({ result: "error", requests: 1, leftInputs: 1, rightInputs: 0 })
  }))

  it.effect("durable ownership: concurrent same-child followups each retain their own reply boundary", () => Effect.gen(function* () {
    const f = yield* setup
    const held = yield* gate
    f.harness.gates.set("seed", held)
    const seed = yield* settleTool(f.registry, yield* record(f.parent.id, "seed")).pipe(Effect.forkChild)
    yield* Deferred.await(held.started)
    const child = (yield* f.sessions.list()).find((session) => session.parentID === f.parent.id)
    if (!child) throw new Error("Missing shared child")
    const left = yield* settleTool(f.registry, yield* record(f.parent.id, "follow-left", {
      task_id: child.id, prompt: "same followup",
    })).pipe(Effect.forkChild)
    const right = yield* settleTool(f.registry, yield* record(f.parent.id, "follow-right", {
      task_id: child.id, prompt: "same followup",
    })).pipe(Effect.forkChild)
    const admitted = yield* Effect.repeat(inputRows(child.id), { until: (rows) => rows.length === 3 })
    expect(new Set(admitted.map((row) => row.id)).size).toBe(3)
    yield* Deferred.succeed(held.release, undefined)
    expect(result(yield* Fiber.join(seed)).text).toBe("answer:seed")
    const first = yield* Fiber.join(left)
    const second = yield* Fiber.join(right)
    expect({
      left: first.result.type, right: second.result.type,
      requests: f.harness.requests.length, delivery: admitted.map((row) => row.delivery),
    }).toEqual({ left: "text", right: "text", requests: 3, delivery: ["queue", "queue", "queue"] })
    expect(result(first).text).toBe("answer:same followup")
    expect(result(second).text).toBe("answer:same followup")
  }))

  it.effect("durable ownership: approval wait rechecks target visibility, mode, engine, and configured model", () => Effect.gen(function* () {
    const f = yield* setup
    yield* f.policy.set(f.parent.id, { mode: "allowlist", models: [cheap] })
    yield* f.agents.transform((draft) => draft.update(caller, (agent) => {
      agent.permissions = [{ action: "task", resource: "*", effect: "ask" }]
    }))
    yield* Effect.forEach(["primary", "hidden", "missing", "cc", "forbidden-pin"] as const, (change) => Effect.gen(function* () {
      yield* f.agents.transform((draft) => draft.update(worker, (agent) => {
        agent.hidden = false
        agent.mode = "subagent"
        delete agent.engine
        delete agent.model
      }))
      const task = yield* settleTool(f.registry, yield* record(f.parent.id, `approval-${change}`)).pipe(Effect.forkChild)
      const asked = yield* Effect.repeat(f.permission.forSession(f.parent.id), { until: (requests) => requests.length === 1 })
      yield* f.agents.transform((draft) => {
        if (change === "missing") return draft.remove(worker)
        draft.update(worker, (agent) => {
          if (change === "primary") agent.mode = "primary"
          if (change === "hidden") agent.hidden = true
          if (change === "cc") agent.engine = "claude-code"
          if (change === "forbidden-pin") agent.model = expensive
        })
      })
      yield* f.permission.reply({ requestID: asked[0].id, reply: "once" })
      const settled = yield* Fiber.join(task)
      expect({
        change, result: settled.result.type, requests: f.harness.requests.length,
        children: (yield* f.sessions.list()).filter((session) => session.parentID === f.parent.id).length,
      }).toEqual({ change, result: "error", requests: 0, children: 0 })
    }))
  }))

  it.effect("durable ownership: cancelling joined Task retry preserves original child owner", () => Effect.gen(function* () {
    const f = yield* setup
    const held = yield* gate
    f.harness.gates.set("joined-cancel", held)
    const call = yield* record(f.parent.id, "joined-cancel")
    const owner = yield* settleTool(f.registry, call).pipe(Effect.forkChild)
    yield* Deferred.await(held.started)
    const child = (yield* f.sessions.list()).find((session) => session.parentID === f.parent.id)
    if (!child) throw new Error("Missing active child")
    const execution = yield* SessionExecution.Service
    expect((yield* execution.active).has(child.id)).toBe(true)
    const retry = yield* settleTool(f.registry, call).pipe(Effect.forkChild)
    yield* Effect.repeat(Effect.sync(() => f.harness.resumes.length), { until: (count) => count === 2 })
    yield* Effect.yieldNow
    yield* Fiber.interrupt(retry)
    const stillActive = (yield* execution.active).has(child.id)
    yield* Deferred.succeed(held.release, undefined)
    expect(stillActive).toBe(true)
    expect(result(yield* Fiber.join(owner)).text).toBe("answer:joined-cancel")
    expect(f.harness.requests).toHaveLength(1)
  }))
})

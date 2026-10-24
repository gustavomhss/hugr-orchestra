import { describe, expect } from "bun:test"
import { LLMClient, LLMEvent, ToolFailure, type LLMRequest } from "@orchestra/llm"
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
import { SessionStore } from "@orchestra/core/session/store"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { Snapshot } from "@orchestra/core/snapshot"
import { SystemContext } from "@orchestra/core/system-context"
import { TaskTool } from "@orchestra/core/tool/task"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Context, DateTime, Deferred, Effect, Layer, LayerMap, Schema, Stream } from "effect"
import { testEffect } from "./lib/effect"
import { settleTool } from "./lib/tool"

const directory = AbsolutePath.make("/task-governance-fixture")
const caller = AgentV2.ID.make("caller")
const worker = AgentV2.ID.make("worker")
const providerID = ProviderV2.ID.make("task-provider")
const cheap = ModelV2.Ref.make({ providerID, id: ModelV2.ID.make("cheap") })

class Harness extends Context.Service<Harness, {
  readonly runner: Deferred.Deferred<SessionRunner.Interface>
  readonly requests: LLMRequest[]
  readonly resumes: SessionV2.ID[]
  readonly gates: Map<string, { started: Deferred.Deferred<void>; release: Deferred.Deferred<void> }>
  readonly admitted: Array<{ readonly [key: string]: unknown }>
  // What the test governance returns from `admit`; a string refuses the call with that message.
  decision: TaskGovernance.Admission | string
}>()("test/TaskGovernanceHarness") {}

const harnessLayer = Layer.effect(Harness, Effect.gen(function* () {
  return {
    runner: yield* Deferred.make<SessionRunner.Interface>(),
    requests: [],
    resumes: [],
    gates: new Map(),
    admitted: [],
    decision: {},
  }
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

const governance = Layer.effect(TaskGovernance.Service, Effect.gen(function* () {
  const harness = yield* Harness
  return TaskGovernance.Service.of({
    input: { ticket: Schema.String.pipe(Schema.optional) },
    admit: (input) => Effect.gen(function* () {
      harness.admitted.push(input.input)
      if (typeof harness.decision === "string") return yield* new ToolFailure({ message: harness.decision })
      return harness.decision
    }),
    beforeTurn: () => Effect.void,
    settle: (input) => Effect.succeed({
      text: `settled:${input.reply.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")}`,
      structured: { receipt: input.admission.receipt, child: input.child.id },
    }),
  })
})).pipe(Layer.provide(harnessLayer))

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
  SessionSubagentModels.node, SessionExecution.node, SessionV2.node, SessionStore.node, Credential.node,
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
  [TaskGovernance.node, governance],
  [LayerNodePlatform.llmClient, client],
  [Snapshot.node, Snapshot.noopLayer],
  [Config.node, Layer.succeed(Config.Service, { entries: () => Effect.succeed([]) })],
  [SkillGuidance.node, Layer.succeed(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
  [ReferenceGuidance.node, Layer.succeed(ReferenceGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
]).pipe(Layer.provideMerge(harnessLayer)))

const setup = Effect.gen(function* () {
  const harness = yield* Harness
  yield* Deferred.succeed(harness.runner, yield* SessionRunner.Service)
  const agents = yield* AgentV2.Service
  yield* agents.transform((draft) => {
    draft.update(caller, (agent) => { agent.permissions = [{ action: "task", resource: "*", effect: "allow" }] })
    draft.update(worker, (agent) => { agent.mode = "subagent" })
    draft.update(AgentV2.defaultID, (agent) => { agent.mode = "primary" })
  })
  const catalog = yield* Catalog.Service
  yield* catalog.transform((draft) => {
    draft.model.update(providerID, cheap.id, (model) => {
      model.enabled = true
      model.status = "active"
      model.api = { type: "aisdk", package: "@ai-sdk/openai", id: ModelV2.ID.make("deployment-cheap") }
      model.limit = { context: 100_000, output: 1_000 }
    })
    draft.model.default.set(providerID, cheap.id)
  })
  const sessions = yield* SessionV2.Service
  return {
    harness, sessions,
    parent: yield* sessions.create({ location: { directory }, agent: caller, model: cheap }),
    registry: yield* ToolRegistry.Service,
    store: yield* SessionStore.Service,
  }
})

// Records the parent's Task call as the runner would, with the governance's extra input fields.
const record = Effect.fn("TaskGovernanceTest.record")(function* (
  sessionID: SessionV2.ID,
  id: string,
  extra: { readonly [key: string]: unknown } = {},
) {
  const events = yield* EventV2.Service
  const timestamp = yield* DateTime.now
  const assistantMessageID = SessionMessage.ID.create()
  const input = { description: "Governed task", prompt: id, subagent_type: worker, ...extra }
  yield* events.publish(SessionEvent.Step.Started, { sessionID, assistantMessageID, timestamp, agent: caller, model: cheap })
  yield* events.publish(SessionEvent.Tool.Input.Started, { sessionID, assistantMessageID, timestamp, callID: id, name: "task" })
  yield* events.publish(SessionEvent.Tool.Input.Ended, { sessionID, assistantMessageID, timestamp, callID: id, text: JSON.stringify(input) })
  yield* events.publish(SessionEvent.Tool.Called, {
    sessionID, assistantMessageID, timestamp, callID: id, tool: "task", input, provider: { executed: false },
  })
  return { sessionID, agent: caller, assistantMessageID, model: cheap, call: { type: "tool-call" as const, id, name: "task", input } }
})

const result = (settlement: ToolRegistry.Settlement) => {
  if (settlement.result.type === "error") throw new Error(String(settlement.result.value))
  return Schema.decodeUnknownSync(TaskTool.Output)(settlement.output?.structured)
}

const children = (sessions: SessionV2.Interface, parentID: SessionV2.ID) =>
  sessions.list().pipe(Effect.map((list) => list.filter((session) => session.parentID === parentID)))

describe("TaskTool with a Location TaskGovernance", () => {
  it.effect("passes extra input to admit and honours child ID, permissions, prompt, and settle", () => Effect.gen(function* () {
    const f = yield* setup
    const childID = SessionV2.ID.make("ses_governed_child")
    f.harness.decision = {
      childID,
      permissions: [{ action: "bash", resource: "*", effect: "deny" }],
      prompt: { text: "governed prompt" },
      receipt: "receipt-1",
    }
    const call = yield* record(f.parent.id, "caller prompt", { ticket: "T-1" })
    const output = result(yield* settleTool(f.registry, call))
    expect(f.harness.admitted).toEqual([expect.objectContaining({ prompt: "caller prompt", ticket: "T-1" })])
    expect(output).toMatchObject({
      sessionID: childID,
      text: "settled:answer:governed prompt",
      structured: { receipt: "receipt-1", child: childID },
    })
    expect(yield* f.store.permissions(childID)).toEqual([{ action: "bash", resource: "*", effect: "deny" }])
    expect(f.harness.requests).toHaveLength(1)

    // An exact retry reconciles without a second provider turn or a second permission change.
    expect(result(yield* settleTool(f.registry, call))).toEqual(output)
    expect(f.harness.requests).toHaveLength(1)
    const history = yield* f.sessions.history({ sessionID: childID, limit: 100 })
    expect(history.events.filter((event) => event.type === SessionEvent.PermissionChanged.type)).toHaveLength(1)
  }))

  it.effect("a background admission wakes the child and returns before it replies", () => Effect.gen(function* () {
    const f = yield* setup
    const gate = { started: yield* Deferred.make<void>(), release: yield* Deferred.make<void>() }
    f.harness.gates.set("background work", gate)
    f.harness.decision = { background: true }
    const output = result(yield* settleTool(f.registry, yield* record(f.parent.id, "background work")))
    expect(output.text).toBe("Task started in the background")
    expect(output.structured).toBeUndefined()
    expect(f.harness.resumes).toEqual([])
    // The child drain was woken and is held at its provider turn while Task has already returned.
    yield* Deferred.await(gate.started)
    yield* Deferred.succeed(gate.release, undefined)
    const execution = yield* SessionExecution.Service
    yield* Effect.repeat(execution.active, { until: (active) => !active.has(output.sessionID) })
    const messages = yield* f.sessions.messages({ sessionID: output.sessionID, order: "asc" })
    expect(messages.findLast((message) => message.type === "assistant")).toMatchObject({
      content: [expect.objectContaining({ type: "text", text: "answer:background work" })],
    })
  }))

  it.effect("an admit refusal fails the call before any child exists", () => Effect.gen(function* () {
    const f = yield* setup
    f.harness.decision = "delegation refused by governance"
    const settlement = yield* settleTool(f.registry, yield* record(f.parent.id, "refused", { ticket: "T-2" }))
    expect(settlement.result).toMatchObject({ type: "error", value: expect.stringContaining("delegation refused by governance") })
    expect(f.harness.admitted).toHaveLength(1)
    expect(yield* children(f.sessions, f.parent.id)).toHaveLength(0)
    expect(f.harness.requests).toHaveLength(0)
  }))
})

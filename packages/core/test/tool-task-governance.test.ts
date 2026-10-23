import { describe, expect } from "bun:test"
import { LLMClient, LLMError, LLMEvent, ToolFailure, TransportReason, type LLMRequest } from "@orchestra/llm"
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

// A replaced governance: each test sets the admission and observes the calls.
let admission: TaskGovernance.Admission = {}
let refuse: string | undefined
const admitted: Readonly<Record<string, unknown>>[] = []
const settled: { child: SessionV2.ID; reply: string | undefined; receipt: unknown }[] = []
const governance = Layer.succeed(TaskGovernance.Service, TaskGovernance.Service.of({
  input: { ticket: Schema.String.pipe(Schema.optional).annotate({ description: "A governance ticket" }) },
  admit: (input) => Effect.gen(function* () {
    admitted.push(input.input)
    if (refuse) return yield* new ToolFailure({ message: refuse })
    return admission
  }),
  beforeTurn: () => Effect.void,
  settle: (input) => Effect.sync(() => {
    const text = (input.reply?.content ?? []).flatMap((part) => part.type === "text" ? [part.text] : []).join("\n")
    settled.push({ child: input.child.id, reply: text, receipt: input.admission.receipt })
    return { text: `settled:${text}`, structured: { receipt: input.admission.receipt } }
  }),
}))

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
  [LayerNodePlatform.llmClient, client],
  [Snapshot.node, Snapshot.noopLayer],
  [Config.node, Layer.succeed(Config.Service, { entries: () => Effect.succeed([]) })],
  [SkillGuidance.node, Layer.succeed(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
  [ReferenceGuidance.node, Layer.succeed(ReferenceGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
  [TaskGovernance.node, governance],
]).pipe(Layer.provideMerge(harnessLayer)))

const setup = Effect.gen(function* () {
  admission = {}
  refuse = undefined
  admitted.length = 0
  settled.length = 0
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
  params: Partial<typeof TaskTool.Input.Type> & { readonly ticket?: string } = {},
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

describe("TaskTool governance", () => {
  it.effect("extends the input, adopts the admitted child id and settles the reply through governance", () => Effect.gen(function* () {
    const f = yield* setup
    const definition = (yield* f.registry.materialize()).definition("task")
    expect(Object.keys((definition?.inputSchema as { properties: Record<string, unknown> }).properties)).toContain("ticket")
    admission = { childID: SessionV2.ID.make("ses_reserved_child"), receipt: "receipt-1" }
    const call = yield* record(f.parent.id, "reserved", { ticket: "T-1" })
    const output = result(yield* settleTool(f.registry, call))
    expect(admitted).toEqual([expect.objectContaining({ prompt: "reserved", ticket: "T-1" })])
    expect(output).toMatchObject({
      sessionID: "ses_reserved_child", text: "settled:answer:reserved", structured: { receipt: "receipt-1" },
    })
    expect(yield* f.sessions.get(SessionV2.ID.make("ses_reserved_child"))).toMatchObject({ parentID: f.parent.id, agent: worker })
    expect(settled).toEqual([{ child: SessionV2.ID.make("ses_reserved_child"), reply: "answer:reserved", receipt: "receipt-1" }])
    // An exact retry is admitted again and reconciles the same child without another turn.
    expect(result(yield* settleTool(f.registry, call))).toEqual(output)
    expect(f.harness.requests).toHaveLength(1)
  }))

  it.effect("writes admitted permissions as the child's own rules", () => Effect.gen(function* () {
    const f = yield* setup
    admission = { permissions: [{ action: "edit", resource: "src/**", effect: "allow" }, { action: "task", resource: "*", effect: "deny" }] }
    const output = result(yield* settleTool(f.registry, yield* record(f.parent.id, "ruled")))
    const store = yield* SessionStore.Service
    expect(yield* store.permissions(output.sessionID)).toEqual(admission.permissions ?? [])
    // The runner merged the child's rules after its agent's: the worker may delegate, but the child may not.
    expect(f.harness.requests).toHaveLength(1)
    expect(f.harness.requests[0].tools.map((tool) => tool.name)).not.toContain("task")
    expect(yield* store.permissions(f.parent.id)).toEqual([])
  }))

  it.effect("sends the admitted prompt instead of the input prompt", () => Effect.gen(function* () {
    const f = yield* setup
    admission = { prompt: { text: "governed instructions" } }
    const output = result(yield* settleTool(f.registry, yield* record(f.parent.id, "plain")))
    expect(output.text).toBe("settled:answer:governed instructions")
    const users = (yield* f.sessions.messages({ sessionID: output.sessionID, order: "asc" }))
      .flatMap((message) => message.type === "user" ? [message.text] : [])
    expect(users).toEqual(["governed instructions"])
  }))

  it.effect("returns a background child at once without waiting for or settling its reply", () => Effect.gen(function* () {
    const f = yield* setup
    const held = yield* gate
    f.harness.gates.set("background", held)
    admission = { background: true }
    const output = result(yield* settleTool(f.registry, yield* record(f.parent.id, "background")))
    expect(output).toMatchObject({ agent: worker, parentSessionId: f.parent.id, text: "Task started in the background" })
    expect(output.sessionID).toMatch(/^ses_[0-9a-f]{64}$/)
    yield* Deferred.await(held.started)
    const execution = yield* SessionExecution.Service
    expect((yield* execution.active).has(output.sessionID)).toBe(true)
    yield* Deferred.succeed(held.release, undefined)
    yield* f.sessions.wait(output.sessionID)
    expect(settled).toEqual([])
    expect(yield* f.sessions.messages({ sessionID: output.sessionID, order: "asc" })).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "assistant", content: [expect.objectContaining({ type: "text", text: "answer:background" })] }),
    ]))
  }))

  it.effect("a refused admission creates no child; an explicit task_id resumes over an admitted child id", () => Effect.gen(function* () {
    const f = yield* setup
    refuse = "Dispatch reservation is held"
    expect((yield* settleTool(f.registry, yield* record(f.parent.id, "refused"))).result).toMatchObject({
      type: "error", value: expect.stringContaining("Dispatch reservation is held"),
    })
    expect((yield* f.sessions.list()).filter((session) => session.parentID === f.parent.id)).toHaveLength(0)
    expect(f.harness.requests).toHaveLength(0)
    refuse = undefined
    const first = result(yield* settleTool(f.registry, yield* record(f.parent.id, "first")))
    admission = { childID: SessionV2.ID.make("ses_ignored_child") }
    const resumed = result(yield* settleTool(f.registry, yield* record(f.parent.id, "again", { task_id: first.sessionID })))
    expect(resumed).toMatchObject({ sessionID: first.sessionID, text: "settled:answer:again" })
    expect(yield* f.sessions.get(SessionV2.ID.make("ses_ignored_child")).pipe(Effect.exit)).toMatchObject({ _tag: "Failure" })
  }))
})

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
import { ModelExecution } from "@orchestra/core/model-execution"
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
import { ExecutionHost, SessionRunner } from "@orchestra/core/session/runner"
import { node } from "@orchestra/core/session/runner/llm"
import { SessionInputTable } from "@orchestra/core/session/sql"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { Snapshot } from "@orchestra/core/snapshot"
import { SystemContext } from "@orchestra/core/system-context"
import { TaskTool } from "@orchestra/core/tool/task"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Context, DateTime, Deferred, Effect, Layer, LayerMap, Schema, Stream } from "effect"
import { eq } from "drizzle-orm"

export const directory = AbsolutePath.make("/task-fixture")
export const caller = AgentV2.ID.make("caller")
export const worker = AgentV2.ID.make("worker")
export const providerID = ProviderV2.ID.make("task-provider")
export const cheap = ModelV2.Ref.make({ providerID, id: ModelV2.ID.make("cheap") })
export const expensive = ModelV2.Ref.make({ providerID, id: ModelV2.ID.make("expensive") })

export class Harness extends Context.Service<Harness, {
  readonly runner: Deferred.Deferred<SessionRunner.Interface>
  readonly requests: LLMRequest[]
  readonly resumes: SessionV2.ID[]
  readonly gates: Map<string, { started: Deferred.Deferred<void>; release: Deferred.Deferred<void> }>
  admission?: { started: Deferred.Deferred<void>; release: Deferred.Deferred<void>; refuse: boolean }
}>()("test/TaskHarness") {}

const harnessLayer = Layer.effect(Harness, Effect.gen(function* () {
  return { runner: yield* Deferred.make<SessionRunner.Interface>(), requests: [], resumes: [], gates: new Map() }
}))

const client = Layer.effect(LLMClient.Service, Effect.gen(function* () {
  const harness = yield* Harness
  return LLMClient.Service.of({
    prepare: () => Effect.die("Unexpected prepare"),
    generate: () => Effect.die("Unexpected generate"),
    stream: (request) => Stream.unwrap<LLMEvent, LLMError, never, never, never>(Effect.gen(function* () {
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
      if (prompt === "provider-error") return Stream.fromIterable([
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.providerError({ message: "child provider event failed" }),
      ])
      if (prompt === "child-content-filter") return Stream.fromIterable([
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.stepFinish({ index: 0, reason: "content-filter" }),
        LLMEvent.finish({ reason: "content-filter" }),
      ])
      // No step settlement: the runner emits no Step.Ended, so the child assistant stays incomplete. This
      // characterizes the parent-facing incomplete wording; it is NOT evidence of a real interruption (an active
      // interruption records a failure instead, by existing runner semantics).
      if (prompt === "child-no-finish") return Stream.fromIterable([
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.textStart({ id: "answer" }),
      ])
      if (prompt === "parent-no-finish" && !request.messages.some((message) =>
        message.role === "tool" && message.content.some((part) => part.type === "tool-result" && part.id === "no-finish-task"),
      )) return Stream.fromIterable([
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.toolCall({
          id: "no-finish-task", name: "task",
          input: { description: "Focused task", prompt: "child-no-finish", subagent_type: worker },
        }),
        LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
        LLMEvent.finish({ reason: "tool-calls" }),
      ])
      if (prompt === "parent-content-filter" && !request.messages.some((message) =>
        message.role === "tool" && message.content.some((part) => part.type === "tool-result" && part.id === "content-filter-task"),
      )) return Stream.fromIterable([
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.toolCall({
          id: "content-filter-task", name: "task",
          input: { description: "Focused task", prompt: "child-content-filter", subagent_type: worker },
        }),
        LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
        LLMEvent.finish({ reason: "tool-calls" }),
      ])
      if (prompt === "parent-provider-error" && !request.messages.some((message) =>
        message.role === "tool" && message.content.some((part) => part.type === "tool-result" && part.id === "provider-error-task"),
      )) return Stream.fromIterable([
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.toolCall({
          id: "provider-error-task", name: "task",
          input: { description: "Focused task", prompt: "provider-error", subagent_type: worker },
        }),
        LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
        LLMEvent.finish({ reason: "tool-calls" }),
      ])
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
    ...TaskGovernance.allowAll,
    admit: () => Effect.gen(function* () {
      const admission = harness.admission
      if (!admission) return {}
      yield* Deferred.succeed(admission.started, undefined)
      yield* Deferred.await(admission.release)
      if (admission.refuse) return yield* new ToolFailure({ message: "worktree admission refused" })
      return {}
    }),
  })
})).pipe(Layer.provide(harnessLayer))

// A lead whose engine names this host runs its Claude-model children on it, as Claude mode does.
const host: ExecutionHost.Interface = {
  id: "claude-code",
  stateKey: "testHost",
  describeModel: () => Effect.succeed({ status: "ready" as const }),
  stream: (turn) => Stream.make(
    LLMEvent.stepStart({ index: 0 }),
    LLMEvent.textStart({ id: "answer" }),
    LLMEvent.textDelta({ id: "answer", text: `hosted:${turn.history.flatMap((message) => message.type === "user" ? [message.text] : []).at(-1)}` }),
    LLMEvent.textEnd({ id: "answer" }),
    LLMEvent.stepFinish({ index: 0, reason: "stop" }),
  ),
}

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

export const taskLayer = (location: Location.Interface, resolve: ProjectV2.Interface["resolve"]) => AppNodeBuilder.build(LayerNode.group([
  Database.node, EventV2.node, AgentV2.node, Catalog.node, Integration.node, PermissionV2.node, PermissionSaved.node,
  SessionSubagentModels.node, SessionExecution.node, SessionV2.node, Credential.node, ModelExecution.node,
  ToolRegistry.node, ToolRegistry.toolsNode, TaskTool.node, node,
]), [
  [Location.node, Layer.succeed(Location.Service, location)],
  [ProjectV2.node, Layer.succeed(ProjectV2.Service, ProjectV2.Service.of({
    resolve,
    list: () => Effect.succeed([]),
    directories: () => Effect.die("Unexpected directories"),
    commit: () => Effect.die("Unexpected project commit"),
  }))],
  [LocationServiceMap.node, Layer.effect(LocationServiceMap.Service,
    LayerMap.make((_ref: Location.Ref) =>
      Layer.effectContext<LocationServices, never, never>(Effect.die("Unexpected hook Location acquisition"))))],
  [SessionExecution.node, execution],
  [TaskGovernance.node, governance],
  [ExecutionHost.node, Layer.succeed(ExecutionHost.Service, ExecutionHost.of([host]))],
  [LayerNodePlatform.llmClient, client],
  [Snapshot.node, Snapshot.noopLayer],
  [Config.node, Layer.succeed(Config.Service, { entries: () => Effect.succeed([]) })],
  [SkillGuidance.node, Layer.succeed(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
  [ReferenceGuidance.node, Layer.succeed(ReferenceGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
]).pipe(Layer.provideMerge(harnessLayer))

export const setupAt = (parentDirectory: AbsolutePath) => Effect.gen(function* () {
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
  const parent = yield* sessions.create({ location: { directory: parentDirectory }, agent: caller, model: cheap })
  return {
    harness, agents, catalog, sessions, parent,
    registry: yield* ToolRegistry.Service,
    policy: yield* SessionSubagentModels.Service,
    permission: yield* PermissionV2.Service,
  }
})

export const setup = setupAt(directory)

export const record = Effect.fn("TaskTest.record")(function* (
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

export const result = (settlement: ToolRegistry.Settlement) => {
  if (settlement.result.type === "error") throw new Error(String(settlement.result.value))
  return Schema.decodeUnknownSync(TaskTool.Output)(settlement.output?.structured)
}

export const gate = Effect.gen(function* () {
  return { started: yield* Deferred.make<void>(), release: yield* Deferred.make<void>() }
})

export const inputRows = Effect.fn("TaskTest.inputRows")(function* (sessionID: SessionV2.ID) {
  const database = yield* Database.Service
  return yield* database.db.select().from(SessionInputTable)
    .where(eq(SessionInputTable.session_id, sessionID)).all().pipe(Effect.orDie)
})

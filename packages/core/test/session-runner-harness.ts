export * as Harness from "./session-runner-harness"

import { LLMEvent, Model, type LLMClientService } from "@orchestra/llm"
import { route } from "@orchestra/llm/protocols/openai-chat"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { ConfigCompaction } from "@orchestra/core/config/compaction"
import { Database } from "@orchestra/core/database/database"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { QuestionV2 } from "@orchestra/core/question"
import { ReferenceGuidance } from "@orchestra/core/reference/guidance"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionRunCoordinator } from "@orchestra/core/session/run-coordinator"
import { ExecutionHost, SessionRunner } from "@orchestra/core/session/runner"
import { node } from "@orchestra/core/session/runner/llm"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { Snapshot } from "@orchestra/core/snapshot"
import { SystemContext } from "@orchestra/core/system-context"
import { SystemContextRegistry } from "@orchestra/core/system-context/registry"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { Effect, Layer } from "effect"
import { testEffect } from "./lib/effect"
import { PermissionFixture } from "./permission-fixture"

export const systemContextLayer = AppNodeBuilder.build(SystemContextRegistry.node)

const referenceGuidance = Layer.mock(ReferenceGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })
export const compaction = new ConfigCompaction.Info({
  buffer: 3_000,
  keep: new ConfigCompaction.Keep({ tokens: 1_000 }),
})
const defaultConfig = Layer.succeed(
  Config.Service,
  Config.Service.of({
    entries: () =>
      Effect.succeed([
        new Config.Document({
          type: "document",
          info: new Config.Info({ compaction }),
        }),
      ]),
  }),
)

export function make(input: {
  client: Layer.Layer<LLMClientService>
  models: Layer.Layer<SessionRunnerModel.Service>
  echo: Layer.Layer<never, Tool.RegistrationError, ToolRegistry.Service>
  systemContext: Layer.Layer<SystemContextRegistry.Service>
  skillGuidance: Layer.Layer<SkillGuidance.Service>
  /** Execution hosts the runner may select by agent engine; default none. */
  hosts?: Layer.Layer<ExecutionHost.Service>
  /** Replaces the fail-closed permission fixture. */
  permissions?: Layer.Layer<PermissionV2.Service>
  /** Replaces the compaction-only config, for example to configure MCP servers. */
  config?: Layer.Layer<Config.Service>
  /** Real tool nodes (and what they need) added to the application graph, for a test that runs one end to end. */
  nodes?: ReadonlyArray<LayerNode.Node<unknown, unknown, any>>
  /** The Location's working directory, "/project" unless a tool needs a real one. */
  directory?: string
}) {
  const directory = AbsolutePath.make(input.directory ?? "/project")
  const permissions = input.permissions ?? PermissionFixture.normalLayer
  const config = input.config ?? defaultConfig
  const hosts: LayerNode.Replacements = input.hosts ? [[ExecutionHost.node, input.hosts]] : []
  const echoNode = makeLocationNode({ name: "test/session-runner-tools", layer: input.echo, deps: [ToolRegistry.node] })
  const runnerLayer = AppNodeBuilder.build(node, [
    [Snapshot.node, Snapshot.noopLayer],
    [LayerNodePlatform.llmClient, input.client],
    [SessionRunnerModel.node, input.models],
    [SystemContextRegistry.node, input.systemContext],
    [Location.node, Location.boundNode({ directory })],
    [SkillGuidance.node, input.skillGuidance],
    [ReferenceGuidance.node, referenceGuidance],
    [PermissionV2.node, permissions],
    [Config.node, config],
    ...hosts,
  ])
  const execution = Layer.effect(
    SessionExecution.Service,
    Effect.gen(function* () {
      const sessionRunner = yield* SessionRunner.Service
      const coordinator = yield* SessionRunCoordinator.make<SessionV2.ID, SessionRunner.RunError>({
        drain: (sessionID, force) => sessionRunner.run({ sessionID, force }),
      })
      return SessionExecution.Service.of({
        active: coordinator.active,
        resume: coordinator.run,
        wake: coordinator.wake,
        interrupt: coordinator.interrupt,
        exclusive: coordinator.exclusive,
        withRunner: (_, use) => use(sessionRunner),
      })
    }),
  ).pipe(Layer.provide(runnerLayer))
  return testEffect(
    AppNodeBuilder.build(
      LayerNode.group([
        Database.node,
        EventV2.node,
        QuestionV2.node,
        SessionProjector.node,
        SessionStore.node,
        ApplicationTools.node,
        AgentV2.node,
        ToolRegistry.node,
        ToolRegistry.toolsNode,
        echoNode,
        SessionRunnerModel.node,
        SessionSubagentModels.node,
        SystemContextRegistry.node,
        SkillGuidance.node,
        ReferenceGuidance.node,
        Config.node,
        Snapshot.node,
        node,
        SessionExecution.node,
        SessionV2.node,
        ...(input.nodes ?? []),
      ]),
      [
        [LayerNodePlatform.llmClient, input.client],
        [PermissionV2.node, permissions],
        [SessionRunnerModel.node, input.models],
        [SystemContextRegistry.node, input.systemContext],
        [Location.node, Location.boundNode({ directory })],
        [SkillGuidance.node, input.skillGuidance],
        [ReferenceGuidance.node, referenceGuidance],
        [Snapshot.node, Snapshot.noopLayer],
        [SessionExecution.node, execution],
        [Config.node, config],
        ...hosts,
      ],
    ),
  )
}

export const sessionID = SessionV2.ID.make("ses_runner_test")
export const otherSessionID = SessionV2.ID.make("ses_runner_other")
export const recoveryModel = Model.make({
  id: "recovery",
  provider: "fake",
  route: route.with({ limits: { context: 20_000, output: 1_000 } }),
})

export const insertSession = (id: SessionV2.ID, directory = "/project") =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    yield* db
      .insert(SessionTable)
      .values({
        id,
        project_id: Project.ID.global,
        slug: id,
        directory,
        title: "test",
        version: "test",
      })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
  })

export const setupAt = (directory: string) => Effect.gen(function* () {
  const { db } = yield* Database.Service
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make(directory), sandboxes: [] })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  yield* insertSession(sessionID, directory)
})

export const setup = setupAt("/project")

export type FragmentKind = "text" | "reasoning" | "tool input"

type FragmentFixture = {
  readonly delta: EventV2.Definition
  readonly completeEvents: LLMEvent[]
  readonly partialEvents: LLMEvent[]
  readonly expectedAssistant: unknown
  readonly expectedContent: unknown
}

export const fragmentFixture = (kind: FragmentKind, id: string, chunks: readonly string[]): FragmentFixture => {
  const text = chunks.join("")
  switch (kind) {
    case "text": {
      const partialEvents = [
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.textStart({ id }),
        ...chunks.map((text) => LLMEvent.textDelta({ id, text })),
      ]
      const expectedContent = { type: "text", id, text }
      return {
        delta: SessionEvent.Text.Delta,
        partialEvents,
        completeEvents: [
          ...partialEvents,
          LLMEvent.textEnd({ id }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ],
        expectedAssistant: { type: "assistant", finish: "stop", content: [expectedContent] },
        expectedContent,
      }
    }
    case "reasoning": {
      const partialEvents = [
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.reasoningStart({ id }),
        ...chunks.map((text) => LLMEvent.reasoningDelta({ id, text })),
      ]
      const expectedContent = { type: "reasoning", id, text }
      return {
        delta: SessionEvent.Reasoning.Delta,
        partialEvents,
        completeEvents: [
          ...partialEvents,
          LLMEvent.reasoningEnd({ id }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ],
        expectedAssistant: { type: "assistant", finish: "stop", content: [expectedContent] },
        expectedContent,
      }
    }
    case "tool input": {
      const partialEvents = [
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.toolInputStart({ id, name: "echo" }),
        ...chunks.map((text) => LLMEvent.toolInputDelta({ id, name: "echo", text })),
      ]
      const expectedContent = { type: "tool", id, state: { status: "pending", input: text } }
      return {
        delta: SessionEvent.Tool.Input.Delta,
        partialEvents,
        completeEvents: [...partialEvents, LLMEvent.toolInputEnd({ id, name: "echo" })],
        expectedAssistant: { type: "assistant", content: [expectedContent] },
        expectedContent,
      }
    }
  }
}

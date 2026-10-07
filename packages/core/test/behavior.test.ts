import { afterAll, describe, expect } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { LLMClient, Model, type LLMClientShape, type LLMRequest } from "@opencode-ai/llm"
import * as OpenAIChat from "@opencode-ai/llm/protocols/openai-chat"
import { AgentV2 } from "@opencode-ai/core/agent"
import { BehaviorV2 } from "@opencode-ai/core/behavior"
import { Config } from "@opencode-ai/core/config"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNodePlatform } from "@opencode-ai/core/effect/app-node-platform"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { Global } from "@opencode-ai/core/global"
import { Location } from "@opencode-ai/core/location"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ReferenceGuidance } from "@opencode-ai/core/reference/guidance"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionExecution } from "@opencode-ai/core/session/execution"
import { Prompt } from "@opencode-ai/core/session/prompt"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionRunCoordinator } from "@opencode-ai/core/session/run-coordinator"
import { SessionRunner } from "@opencode-ai/core/session/runner"
import * as SessionRunnerLLM from "@opencode-ai/core/session/runner/llm"
import { SessionRunnerModel } from "@opencode-ai/core/session/runner/model"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { SessionStore } from "@opencode-ai/core/session/store"
import { SkillGuidance } from "@opencode-ai/core/skill/guidance"
import { Snapshot } from "@opencode-ai/core/snapshot"
import { SystemContext } from "@opencode-ai/core/system-context"
import { SystemContextRegistry } from "@opencode-ai/core/system-context/registry"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { ToolOutputStore } from "@opencode-ai/core/tool-output-store"
import { Effect, Exit, Layer, Stream } from "effect"
import { testEffect } from "./lib/effect"
import { PermissionFixture } from "./permission-fixture"

const data = mkdtempSync(path.join(tmpdir(), "orchestra-behavior-test-"))
afterAll(() => rmSync(data, { recursive: true, force: true }))

const requests: LLMRequest[] = []
const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    stream: ((request: LLMRequest) => {
      requests.push(request)
      return Stream.empty
    }) as unknown as LLMClientShape["stream"],
    generate: () => Effect.die("unused"),
  }),
)
const model = Model.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route })
const location = (directory: string) => Location.boundNode({ directory: AbsolutePath.make(directory) })
const behaviorsAt = (directory: string) =>
  AppNodeBuilder.build(LayerNode.group([SystemContextRegistry.node, BehaviorV2.node]), [
    [Global.node, Global.layerWith({ data })],
    [Location.node, location(directory)],
  ])
// The runner's registry carries the real behavior source, reading the same project file the service writes.
const systemContext = behaviorsAt("/project")
const replacements: LayerNode.Replacements = [
  [LayerNodePlatform.llmClient, client],
  [PermissionV2.node, PermissionFixture.normalLayer],
  [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  [SessionRunnerModel.node, SessionRunnerModel.layerWith(() => Effect.succeed(model))],
  [SystemContextRegistry.node, systemContext],
  [BehaviorV2.node, systemContext],
  [Location.node, location("/project")],
  [SkillGuidance.node, Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
  [ReferenceGuidance.node, Layer.mock(ReferenceGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })],
  [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
  [Snapshot.node, Snapshot.noopLayer],
]
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
    })
  }),
).pipe(Layer.provide(AppNodeBuilder.build(SessionRunnerLLM.node, replacements)))
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      EventV2.node,
      SessionProjector.node,
      SessionStore.node,
      AgentV2.node,
      ToolRegistry.node,
      SessionRunnerModel.node,
      SystemContextRegistry.node,
      BehaviorV2.node,
      SkillGuidance.node,
      ReferenceGuidance.node,
      Config.node,
      Snapshot.node,
      SessionRunnerLLM.node,
      SessionExecution.node,
      SessionV2.node,
    ]),
    [...replacements, [SessionExecution.node, execution]],
  ),
)

const caveman = {
  id: "caveman",
  name: "Caveman",
  instructions: "Respond terse like smart caveman. Preserve technical accuracy.",
}
const reviewer = { id: "reviewer", name: "Reviewer", instructions: "Cite the file and line for every claim." }

const requestText = (request: LLMRequest | undefined) =>
  [
    ...(request?.system ?? []).map((part) => part.text),
    ...(request?.messages ?? []).flatMap((message) =>
      message.content.flatMap((content) => (content.type === "text" ? [content.text] : [])),
    ),
  ].join("\n")
const occurrences = (request: LLMRequest | undefined, text: string) => requestText(request).split(text).length - 1
const systemPrompt = (request: LLMRequest | undefined) => (request?.system ?? []).map((part) => part.text).join("\n")
const userTexts = (request: LLMRequest | undefined) =>
  (request?.messages ?? []).flatMap((message) =>
    message.role === "user"
      ? message.content.flatMap((content) => (content.type === "text" ? [content.text] : []))
      : [],
  )

const startSession = (id: string) =>
  Effect.gen(function* () {
    const sessionID = SessionV2.ID.make(id)
    const { db } = yield* Database.Service
    yield* db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
    yield* db
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: Project.ID.global,
        slug: id,
        directory: "/project",
        title: "test",
        version: "test",
      })
      .run()
      .pipe(Effect.orDie)
    requests.length = 0
    const session = yield* SessionV2.Service
    return (text: string) =>
      session.prompt({ sessionID, prompt: Prompt.make({ text }), resume: false }).pipe(
        Effect.andThen(session.resume(sessionID)),
        Effect.map(() => requests.at(-1)),
      )
  })

describe("BehaviorV2", () => {
  it.effect("applies the project's behaviors to every turn without resending them", () =>
    Effect.gen(function* () {
      const behaviors = yield* BehaviorV2.Service
      yield* behaviors.set([caveman])
      const turn = yield* startSession("ses_behavior_baseline")

      const first = yield* turn("Explain the failing test")
      expect(systemPrompt(first)).toContain(
        `Active behavior: Caveman. Apply it to every answer.\n${caveman.instructions}`,
      )
      expect(occurrences(first, caveman.instructions)).toBe(1)

      const followup = yield* turn("Explain it again")
      expect(occurrences(followup, caveman.instructions)).toBe(1)
      expect(userTexts(followup)).toEqual(["Explain the failing test", "Explain it again"])
    }),
  )

  it.effect("removes a switched-off behavior from the next turn", () =>
    Effect.gen(function* () {
      const behaviors = yield* BehaviorV2.Service
      yield* behaviors.set([caveman, reviewer])
      const turn = yield* startSession("ses_behavior_removed")
      expect(occurrences(yield* turn("First"), caveman.instructions)).toBe(1)

      yield* behaviors.set([reviewer])
      const next = yield* turn("Second")
      expect(requestText(next)).not.toContain(caveman.instructions)
      expect(occurrences(next, reviewer.instructions)).toBe(1)
      expect(userTexts(next)).toEqual(["First", "Second"])

      yield* behaviors.set([])
      expect(requestText(yield* turn("Third"))).not.toContain(reviewer.instructions)
    }),
  )

  it.effect("adds a behavior enabled mid-session once and drops it when switched off", () =>
    Effect.gen(function* () {
      const behaviors = yield* BehaviorV2.Service
      yield* behaviors.set([])
      const turn = yield* startSession("ses_behavior_enabled")
      expect(requestText(yield* turn("First"))).not.toContain(reviewer.instructions)

      yield* behaviors.set([reviewer])
      const enabled = yield* turn("Second")
      expect(enabled?.messages.at(-1)?.role).toBe("system")
      expect(occurrences(enabled, reviewer.instructions)).toBe(1)
      expect(occurrences(yield* turn("Third"), reviewer.instructions)).toBe(1)

      yield* behaviors.set([{ ...reviewer, instructions: "Quote the exact line." }])
      const changed = yield* turn("Fourth")
      expect(requestText(changed)).toContain(
        "Behavior Reviewer changed. Apply this version instead of the earlier one.",
      )
      expect(occurrences(changed, "Quote the exact line.")).toBe(1)

      yield* behaviors.set([])
      const removed = yield* turn("Fifth")
      expect(requestText(removed)).not.toContain(reviewer.instructions)
      expect(requestText(removed)).not.toContain("Quote the exact line.")
      expect(userTexts(removed)).toEqual(["First", "Second", "Third", "Fourth", "Fifth"])
    }),
  )

  it.effect("keeps one set per project and rejects duplicate ids", () =>
    Effect.gen(function* () {
      const behaviors = yield* BehaviorV2.Service
      expect(yield* behaviors.set([caveman, reviewer])).toEqual([caveman, reviewer])
      expect(yield* behaviors.list()).toEqual([caveman, reviewer])
      expect(
        yield* BehaviorV2.Service.use((other) => other.list()).pipe(
          Effect.provide(Layer.fresh(behaviorsAt("/project"))),
        ),
      ).toEqual([caveman, reviewer])
      expect(
        yield* BehaviorV2.Service.use((other) => other.list()).pipe(
          Effect.provide(Layer.fresh(behaviorsAt("/elsewhere"))),
        ),
      ).toEqual([])

      const duplicate = yield* behaviors.set([caveman, { ...caveman, name: "Again" }]).pipe(Effect.exit)
      expect(Exit.isFailure(duplicate)).toBe(true)
      expect(yield* behaviors.list()).toEqual([caveman, reviewer])
    }),
  )
})

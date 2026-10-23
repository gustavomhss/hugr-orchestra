import { describe, expect } from "bun:test"
import { LLM, LLMClient, LLMEvent, Model, type LLMClientShape } from "@orchestra/llm"
import { route } from "@orchestra/llm/protocols/openai-chat"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Host } from "@orchestra/core/host"
import { locationServices } from "@orchestra/core/location-services"
import { SessionV2 } from "@orchestra/core/session"
import { SessionCompaction } from "@orchestra/core/session/compaction"
import { SessionMessage } from "@orchestra/core/session/message"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { DateTime, Effect, Layer, Stream } from "effect"
import { Harness, sessionID } from "./session-runner-harness"
import { testEffect } from "./lib/effect"

const model = Model.make({ id: "fake-model", provider: "fake", route })
const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    stream: (() =>
      Stream.make(
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.textStart({ id: "text" }),
        LLMEvent.textDelta({ id: "text", text: "Answer" }),
        LLMEvent.textEnd({ id: "text" }),
        LLMEvent.stepFinish({ index: 0, reason: "stop" }),
      )) as unknown as LLMClientShape["stream"],
    generate: () => Effect.die("unused"),
  }),
)

const defaults = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionSubagentModels.node, SessionCompaction.node]), [
    [LayerNodePlatform.llmClient, client],
    [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed([]) }))],
  ]),
)

const calls: string[] = []
const replacement = Layer.succeed(
  SessionCompaction.Service,
  SessionCompaction.Service.of({
    compact: (input) => Effect.sync(() => calls.push(`compact:${input.sessionID}`)).pipe(Effect.as(true)),
    compactIfNeeded: (input) => Effect.sync(() => calls.push(`compactIfNeeded:${input.sessionID}`)).pipe(Effect.as(false)),
    compactAfterOverflow: () => Effect.sync(() => calls.push("compactAfterOverflow")).pipe(Effect.as(false)),
    transform: (input) => Effect.succeed(input.messages),
    afterStep: () => Effect.void,
  }),
)
const replaced = Harness.make({
  client,
  models: SessionRunnerModel.layerWith(() => Effect.succeed(model)),
  echo: Layer.empty,
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
  compaction: replacement,
})

describe("SessionCompaction node", () => {
  defaults.effect("defaults to an identity transform and a no-op afterStep", () =>
    Effect.gen(function* () {
      const compaction = yield* SessionCompaction.Service
      const messages = [
        SessionMessage.User.make({
          id: SessionMessage.ID.make("msg_user"),
          type: "user",
          text: "Hello",
          time: { created: DateTime.makeUnsafe(0) },
        }),
      ]
      expect(yield* compaction.transform({ sessionID, messages, model })).toBe(messages)
      yield* compaction.afterStep({
        sessionID,
        model,
        tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
      })
    }),
  )

  defaults.effect("does not compact an empty history", () =>
    Effect.gen(function* () {
      const compaction = yield* SessionCompaction.Service
      expect(yield* compaction.compactIfNeeded({ sessionID, entries: [], model, request: LLM.request({ model }) })).toBe(false)
      expect(yield* compaction.compact({ sessionID, entries: [], model, request: LLM.request({ model }) })).toBe(false)
    }),
  )

  replaced.effect("a replacement node is the strategy the runner consults", () =>
    Effect.gen(function* () {
      yield* Harness.setup
      calls.length = 0
      const session = yield* SessionV2.Service
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "First" }), resume: false })
      yield* session.resume(sessionID)
      expect(calls).toEqual([`compactIfNeeded:${sessionID}`])
      expect(yield* session.compact({ sessionID })).toBe(true)
      expect(calls).toEqual([`compactIfNeeded:${sessionID}`, `compact:${sessionID}`])
    }),
  )

  defaults.effect("is a built-in Location node a Host contribution may replace", () =>
    Effect.sync(() => {
      expect(locationServices.dependencies.map((node) => node.name)).toContain(SessionCompaction.node.name)
      expect(Host.merge([{ id: "continuity", replacements: [[SessionCompaction.node, replacement]] }]).replacements).toEqual([
        [SessionCompaction.node, replacement],
      ])
    }),
  )
})

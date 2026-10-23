import { describe, expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { locationServices } from "@orchestra/core/location-services"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { Project } from "@orchestra/core/project"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { DateTime, Effect } from "effect"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(TaskGovernance.node))
const created = DateTime.makeUnsafe(0)
const context = {
  sessionID: SessionSchema.ID.make("ses_parent"),
  agent: AgentV2.defaultID,
  assistantMessageID: SessionMessage.ID.make("msg_parent"),
  toolCallID: "call-1",
}
const parent = SessionSchema.Info.make({
  id: context.sessionID,
  projectID: Project.ID.global,
  agent: AgentV2.defaultID,
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  location: Location.Ref.make({ directory: AbsolutePath.make("/project") }),
  title: "Parent",
  time: { created, updated: created },
})
const target = AgentV2.Info.empty(AgentV2.ID.make("explore"))
const reply = (content: SessionMessage.Assistant["content"]) =>
  SessionMessage.Assistant.make({
    id: SessionMessage.ID.make("msg_reply"),
    type: "assistant",
    agent: "explore",
    model: { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") },
    content,
    time: { created, completed: created },
  })

describe("TaskGovernance default", () => {
  it.effect("adds no input, admits unchanged and lets every turn start", () =>
    Effect.gen(function* () {
      const governance = yield* TaskGovernance.Service
      expect(governance.input).toEqual({})
      expect(
        yield* governance.admit({ parent, target, input: { prompt: "Go" }, context }),
      ).toEqual({})
      yield* governance.beforeTurn(parent)
    }),
  )

  it.effect("settles a foreground reply as its joined text", () =>
    Effect.gen(function* () {
      const governance = yield* TaskGovernance.Service
      const settled = yield* governance.settle({
        child: parent,
        reply: reply([
          SessionMessage.AssistantText.make({ type: "text", id: "a", text: "First" }),
          SessionMessage.AssistantReasoning.make({ type: "reasoning", id: "r", text: "hidden" }),
          SessionMessage.AssistantText.make({ type: "text", id: "b", text: "Second" }),
        ]),
        admission: {},
        context,
      })
      expect(settled).toEqual({ text: "First\nSecond" })
      expect(yield* governance.settle({ child: parent, reply: undefined, admission: {}, context })).toEqual({ text: "" })
    }),
  )

  it.effect("is a built-in Location node", () =>
    Effect.sync(() => {
      expect(locationServices.dependencies.map((node) => node.name)).toContain(TaskGovernance.node.name)
    }),
  )
})

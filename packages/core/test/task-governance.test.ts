import { describe, expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { ProjectV2 } from "@orchestra/core/project"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { Effect, Schema } from "effect"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(TaskGovernance.node))

const session = Schema.decodeUnknownSync(SessionSchema.Info)({
  id: "ses_governance",
  projectID: ProjectV2.ID.global,
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 0, updated: 0 },
  title: "governance",
  location: { directory: "/governance" },
})

const reply = Schema.decodeUnknownSync(SessionMessage.Assistant)({
  id: "msg_governance",
  type: "assistant",
  agent: "worker",
  model: { providerID: "provider", id: "model" },
  content: [
    { type: "text", id: "first", text: "first line" },
    { type: "reasoning", id: "thought", text: "hidden reasoning" },
    { type: "text", id: "second", text: "second line" },
  ],
  finish: "stop",
  time: { created: 0, completed: 1 },
})

const context = {
  sessionID: session.id,
  agent: AgentV2.ID.make("caller"),
  assistantMessageID: SessionMessage.ID.make("msg_caller"),
  toolCallID: "call",
}

describe("TaskGovernance.allowAll", () => {
  it.effect("is the Location default and leaves Task unchanged", () => Effect.gen(function* () {
    const governance = yield* TaskGovernance.Service
    expect(governance).toBe(TaskGovernance.allowAll)
    expect(governance.input).toEqual({})
    expect(yield* governance.admit({
      parent: session,
      target: AgentV2.Info.empty(AgentV2.ID.make("worker")),
      input: { description: "d", prompt: "p", subagent_type: "worker" },
      context,
    })).toEqual({})
    yield* governance.beforeTurn(session)
  }))

  it.effect("settles a reply as its text parts joined by newlines", () => Effect.gen(function* () {
    const governance = yield* TaskGovernance.Service
    const settled = yield* governance.settle({ child: session, reply, admission: {}, context })
    expect(settled).toEqual({ text: "first line\nsecond line" })
  }))
})

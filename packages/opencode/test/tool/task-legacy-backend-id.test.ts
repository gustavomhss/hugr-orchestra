import { afterEach, describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Effect } from "effect"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Config } from "@/config/config"
import { Git } from "@/git"
import { Session } from "@/session/session"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import type { SessionPrompt } from "../../src/session/prompt"
import { MessageID, PartID } from "../../src/session/schema"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { LEGACY_BACKEND_ID } from "../../src/maestro/roster"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// A Task child created before the backend seat got its stable id stores the former id, derived here from the default
// label and never spelled. Resuming it, by either id, must route to the backend seat.

afterEach(async () => {
  await disposeAllInstances()
})

const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

const it = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([
      filesystem,
      Agent.node,
      BackgroundJob.node,
      EventV2Bridge.node,
      Git.node,
      Config.node,
      CrossSpawnSpawner.node,
      Session.node,
      SessionProjector.node,
      SessionRunState.node,
      SessionStatus.node,
      Truncate.node,
      ToolRegistry.node,
      Database.node,
      RuntimeFlags.node,
      Ripgrep.node,
    ]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  ),
)

const resume = Effect.fn("TaskLegacyBackendIdTest.resume")(function* (subagentType: string) {
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "parent" })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: MessageID.ascending(),
    sessionID: chat.id,
    mode: "maestro",
    agent: "maestro",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now() },
  }
  yield* sessions.updateMessage(assistant)
  const child = yield* sessions.create({ parentID: chat.id, title: "before the rename", agent: LEGACY_BACKEND_ID })
  const prompts: SessionPrompt.PromptInput[] = []
  const tool = yield* TaskTool
  const def = yield* tool.init()
  yield* def.execute(
    { description: "continue", prompt: "continue the packet", subagent_type: subagentType, task_id: child.id },
    {
      sessionID: chat.id,
      messageID: assistant.id,
      agent: "maestro",
      abort: new AbortController().signal,
      extra: { promptOps: ops(prompts) },
      messages: [],
      metadata: () => Effect.void,
      ask: () => Effect.void,
    },
  )
  return { child, prompts }
})

function ops(prompts: SessionPrompt.PromptInput[]): TaskPromptOps {
  return {
    cancel: () => Effect.void,
    resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
    prompt: (input) =>
      Effect.sync(() => {
        prompts.push(input)
        const id = MessageID.ascending()
        return {
          info: {
            id,
            role: "assistant" as const,
            parentID: input.messageID ?? MessageID.ascending(),
            sessionID: input.sessionID,
            mode: input.agent ?? "general",
            agent: input.agent ?? "general",
            cost: 0,
            path: { cwd: "/tmp", root: "/tmp" },
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            modelID: ref.modelID,
            providerID: ref.providerID,
            time: { created: Date.now() },
            finish: "stop",
          },
          parts: [
            { id: PartID.ascending(), messageID: id, sessionID: input.sessionID, type: "text" as const, text: "done" },
          ],
        }
      }),
  }
}

describe("Task resume of a child stored under the former backend id", () => {
  for (const subagentType of ["backend", LEGACY_BACKEND_ID]) {
    it.instance(
      `resumes the same child on the backend seat when called as ${subagentType === "backend" ? "backend" : "the former id"}`,
      () =>
        Effect.gen(function* () {
          const result = yield* resume(subagentType)
          expect(result.prompts).toHaveLength(1)
          expect(result.prompts[0]).toMatchObject({ sessionID: result.child.id, agent: "backend" })
        }),
    )
  }
})

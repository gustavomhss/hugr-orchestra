import { afterEach, describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Cause, Effect, Exit } from "effect"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Config } from "@/config/config"
import { Git } from "@/git"
import { Session } from "@/session/session"
import { MessageID, PartID } from "../../src/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { dispatch as governedDispatch, layer as governedLayer } from "../maestro/governed-fixture"

// F2.11 and F2-D2: the backend seat resumes only a known logical task, and its work result carries that task id,
// never the child Session ID. Other seats keep the generic lookup.

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
const governed = testEffect(governedLayer)

function ops(prompts: string[]): TaskPromptOps {
  return {
    cancel: () => Effect.void,
    resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
    prompt: (input) =>
      Effect.sync(() => {
        prompts.push(input.sessionID)
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

const seed = Effect.fn("TaskLogicalIdTest.seed")(function* () {
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Logical task" })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: MessageID.ascending(),
    sessionID: chat.id,
    mode: "build",
    agent: "build",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now() },
  }
  yield* sessions.updateMessage(assistant)
  return { chat, assistant, prompts: [] as string[] }
})

const run = Effect.fn("TaskLogicalIdTest.run")(function* (
  seeded: { chat: Session.Info; assistant: SessionV1.Assistant; prompts: string[] },
  input: { subagent: string; taskID?: string },
) {
  const def = yield* (yield* TaskTool).init()
  return yield* def
    .execute(
      {
        description: "implement",
        prompt: "packet",
        subagent_type: input.subagent,
        ...(input.taskID ? { task_id: input.taskID } : {}),
      },
      {
        sessionID: seeded.chat.id,
        messageID: seeded.assistant.id,
        agent: "build",
        agentID: "build",
        abort: new AbortController().signal,
        extra: { promptOps: ops(seeded.prompts) },
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      },
    )
    .pipe(Effect.exit)
})

function taskIdOf(metadata: object) {
  if (!("workResult" in metadata) || typeof metadata.workResult !== "object" || metadata.workResult === null)
    return undefined
  return "taskId" in metadata.workResult ? metadata.workResult.taskId : undefined
}

describe("tool.task logical task id", () => {
  it.instance("a backend Task with an unknown task_id fails closed and creates no child Session", () =>
    Effect.gen(function* () {
      const seeded = yield* seed()
      for (const taskID of ["tsk_unknown", "ses_unknown", "not-a-task"]) {
        const exit = yield* run(seeded, { subagent: "backend", taskID })
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("Task resume denied: unknown-task")
      }
      expect(yield* (yield* Session.Service).children(seeded.chat.id)).toEqual([])
      expect(seeded.prompts).toEqual([])
    }),
  )

  it.instance("a general Task with an unknown task_id still starts a fresh child", () =>
    Effect.gen(function* () {
      const seeded = yield* seed()
      const exit = yield* run(seeded, { subagent: "general", taskID: "ses_unknown" })
      if (!Exit.isSuccess(exit)) throw new Error(`expected task success: ${Cause.pretty(exit.cause)}`)
      const children = yield* (yield* Session.Service).children(seeded.chat.id)
      expect(children.map((child) => child.id)).toEqual([exit.value.metadata.sessionId])
      expect(exit.value.metadata.sessionId).not.toBe("ses_unknown")
      expect(taskIdOf(exit.value.metadata)).toBeUndefined()
    }),
  )

  it.instance("a resumed backend Task keeps its logical task id, distinct from the child Session", () =>
    Effect.gen(function* () {
      const seeded = yield* seed()
      const first = yield* run(seeded, { subagent: "backend" })
      if (!Exit.isSuccess(first)) throw new Error(`expected task success: ${Cause.pretty(first.cause)}`)
      const taskId = taskIdOf(first.value.metadata)
      const sessionId = first.value.metadata.sessionId
      expect(taskId).toMatch(/^tsk_/)
      expect(taskId).not.toBe(sessionId)
      // The model is shown the logical task id, so that is what it resumes with.
      expect(first.value.output).toContain(`<task id="${taskId}" state="completed">`)
      if (typeof taskId !== "string") throw new Error("missing taskId")
      for (const taskID of [taskId, sessionId]) {
        const resumed = yield* run(seeded, { subagent: "backend", taskID })
        if (!Exit.isSuccess(resumed)) throw new Error(`expected resume success: ${Cause.pretty(resumed.cause)}`)
        expect(resumed.value.metadata.sessionId).toBe(sessionId)
        expect(taskIdOf(resumed.value.metadata)).toBe(taskId)
      }
      expect(yield* (yield* Session.Service).children(seeded.chat.id)).toHaveLength(1)
      expect(seeded.prompts).toEqual([sessionId, sessionId, sessionId])
    }),
  )

  governed.instance(
    "a governed replay binds the same logical task id",
    () =>
      Effect.gen(function* () {
        const { def, input, first, context } = yield* governedDispatch({ subagentType: "backend" })
        const taskId = taskIdOf(first.metadata)
        expect(taskId).toMatch(/^tsk_[0-9a-f]{64}$/)
        expect(taskId).toBe(`tsk_${first.metadata.sessionId.slice(first.metadata.sessionId.lastIndexOf("_") + 1)}`)
        const replay = yield* def.execute(input, context)
        expect(replay.metadata.sessionId).toBe(first.metadata.sessionId)
        expect(taskIdOf(replay.metadata)).toBe(taskId)
      }),
    { git: true, config: { agent: { maestro: { name: "Conductor" } } } },
    60_000,
  )
})

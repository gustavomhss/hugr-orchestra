import { afterEach, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { Event } from "@opencode-ai/schema/event"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { Cause, Effect, Exit } from "effect"
import fs from "node:fs/promises"
import path from "node:path"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { MCP } from "@/mcp"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { SessionTools } from "@/session/tools"
import { TaskTool, type TaskPromptOps } from "@/tool/task"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Git } from "@/git"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([
      filesystem,
      Agent.node,
      BackgroundJob.node,
      Config.node,
      CrossSpawnSpawner.node,
      Database.node,
      EventV2Bridge.node,
      Git.node,
      MCP.node,
      Permission.node,
      Plugin.node,
      Ripgrep.node,
      RuntimeFlags.node,
      Session.node,
      SessionProjector.node,
      SessionRunState.node,
      SessionStatus.node,
      ToolRegistry.node,
      Truncate.node,
    ]),
  ),
)

const model = {
  providerID: ProviderV2.ID.make("test"),
  api: { id: "test-model" },
} as Provider.Model

it.instance("native team enforces runtime writes, task bypass, and durable Maestro events", () =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    const directory = (yield* TestInstance).directory
    const session = yield* sessions.create({ permission: Permission.fromConfig({ edit: "allow" }) })
    const message: SessionV1.Assistant = {
      id: MessageID.ascending(),
      sessionID: session.id,
      parentID: MessageID.ascending(),
      role: "assistant",
      agent: "maestro",
      mode: "maestro",
      path: { cwd: directory, root: directory },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: ModelV2.ID.make("test-model"),
      providerID: ProviderV2.ID.make("test"),
      time: { created: Date.now() },
    }
    yield* sessions.updateMessage(message)
    const metadataCalls: string[] = []
    const processor = {
      message,
      updateToolCall: (callID: string) => Effect.sync(() => { metadataCalls.push(callID); return undefined }),
      completeToolCall: () => Effect.void,
    }
    const promptOps: TaskPromptOps = {
      cancel: () => Effect.void,
      resolvePromptParts: (template) => Effect.succeed([{ type: "text", text: template }]),
      prompt: () => Effect.die("Task prompt must not run after native denial"),
    }
    const executeWrite = (agent: Agent.Info, filePath: string, content: string) =>
      Effect.gen(function* () {
        const tools = yield* SessionTools.resolve({
          agent,
          model,
          session,
          processor,
          bypassAgentCheck: true,
          messages: [],
          promptOps,
        })
        const execute = tools.write?.execute
        if (!execute) return yield* Effect.die("write tool missing")
        return yield* Effect.promise(() =>
          execute(
            { filePath, content },
            { toolCallId: `call_${agent.id}`, abortSignal: new AbortController().signal, messages: [] },
          ),
        )
      })
    const lucy = yield* agents.get("lucy")
    const charlie = yield* agents.get("charlie")
    const file = path.join(directory, "native-team.txt")

    const lucyTools = yield* SessionTools.resolve({
      agent: lucy,
      model,
      session,
      processor,
      bypassAgentCheck: true,
      messages: [],
      promptOps,
    })
    expect(lucyTools.write).toBeUndefined()
    expect(yield* Effect.promise(() => fs.exists(file))).toBe(false)

    yield* executeWrite(charlie, file, "Charlie wrote this")
    expect(yield* Effect.promise(() => fs.readFile(file, "utf8"))).toBe("Charlie wrote this")
    expect(metadataCalls).toContain("call_charlie")
    expect(metadataCalls).not.toContain("call_lucy")

    const task = yield* TaskTool
    const taskDef = yield* task.init()
    const deniedTask = yield* taskDef
      .execute(
        { description: "inspect", prompt: "inspect", subagent_type: "general" },
        {
          sessionID: session.id,
          messageID: message.id,
          callID: "call_lucy_task",
          agent: lucy.name,
          abort: new AbortController().signal,
          extra: { bypassAgentCheck: true, promptOps },
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )
      .pipe(Effect.exit)
    expect(Exit.isFailure(deniedTask)).toBe(true)
    if (Exit.isFailure(deniedTask)) expect(Cause.pretty(deniedTask.cause)).toContain("PermissionDeniedError")
    expect(yield* sessions.children(session.id)).toHaveLength(0)

    const events = yield* EventV2Bridge.Service
    const event = yield* events.publish(
      MaestroEvent.Approval.ConsumedV2,
      {
        sessionID: session.id,
        presentationID: "apr_runtime",
        approvalMessageID: "msg_runtime",
        taskHash: "task-runtime",
        callID: "call_runtime",
        childSessionID: "ses_runtime",
      },
      { id: Event.ID.make("evt_maestro_runtime") },
    )
    const database = yield* Database.Service
    const reread = yield* EventV2.readAggregate(database.db, {
      aggregateID: session.id,
      limit: 10,
      manifest: {
        definitions: Event.durable([MaestroEvent.Approval.ConsumedV2]),
        schema: MaestroEvent.Approval.ConsumedV2,
      },
    })
    expect(reread.events).toEqual([
      {
        id: event.id,
        type: event.type,
        durable: event.durable,
        data: event.data,
      },
    ])
  }),
)

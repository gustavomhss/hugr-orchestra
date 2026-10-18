import path from "node:path"
import { Cause, Effect, Exit } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventV2Bridge } from "@/event-v2-bridge"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { ResearchExecution } from "@/research/allowance"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Permission } from "@/permission"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { SessionCompaction } from "@/session/compaction"
import { MessageID, PartID } from "@/session/schema"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { TestInstance } from "../../fixture/fixture"
import { TestLLMServer } from "../../lib/llm-server"
import { testProviderConfig } from "../../lib/test-provider"

export const layer = TestAppNodeBuilder.build(LayerNode.group([
  SessionPrompt.node, SessionCompaction.node, ToolRegistry.node, Session.node, SessionProjector.node, Agent.node, Provider.node,
  Permission.node, ResearchRecords.node, ResearchArtifacts.node, ResearchExecution.node, BackgroundJob.node,
  Database.node, EventV2.node, EventV2Bridge.node, FSUtil.node,
  LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] }),
]), [[RuntimeFlags.node, RuntimeFlags.layer({ experimentalBackgroundSubagents: true })]])

export const setup = Effect.fn("NativeResearchTask.setup")(function* () {
  const remote = yield* TestLLMServer
  const fs = yield* FSUtil.Service
  const instance = yield* TestInstance
  yield* fs.writeFileString(path.join(instance.directory, "orchestra.json"), JSON.stringify({
    ...testProviderConfig(remote.url), model: "test/test-model", small_model: "test/test-model",
    plugin: [], mcp: {}, compaction: { auto: false }, continuity: { trigger: 1 },
  }))
  const sessions = yield* Session.Service
  const prompt = yield* SessionPrompt.Service
  const provider = yield* Provider.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const model = yield* provider.getModel(ProviderV2.ID.make("test"), ModelV2.ID.make("test-model"))
  const maestro = yield* agents.get("maestro")
  const parent = yield* sessions.create({ agent: "maestro", title: "Native research outcome authority" })
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: parent.id, role: "user", agent: "maestro",
    model: { providerID: model.providerID, modelID: model.id }, time: { created: Date.now() } })
  // The owner's request: a parent turn continues from its latest actual user request, never from a synthetic notice.
  yield* sessions.updatePart({ id: PartID.ascending(), sessionID: parent.id, messageID: user.id, type: "text", text: "Research with native Jimmy." })
  const assistant = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: parent.id, parentID: user.id,
    role: "assistant", agent: "maestro", mode: "maestro", path: { cwd: instance.directory, root: instance.directory },
    providerID: model.providerID, modelID: model.id, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } })
  const task = (yield* registry.tools({ agent: maestro, providerID: model.providerID, modelID: model.id })).find((tool) => tool.id === "task")
  if (!task) throw new Error("Native Maestro Task is unavailable")
  const call = (input: Record<string, unknown>, callID: string) => Effect.gen(function* () {
    const metadata: { value: Record<string, unknown> } = { value: {} }
    const part = { id: PartID.ascending(), sessionID: parent.id, messageID: assistant.id, type: "tool" as const, tool: "task", callID,
      state: { status: "running" as const, input, time: { start: Date.now() } } }
    yield* sessions.updatePart(part)
    const ctx: Tool.Context = {
      sessionID: parent.id, messageID: assistant.id, callID, agent: maestro.name, agentID: "maestro", permission: maestro.permission,
      abort: AbortSignal.any([]), messages: [],
      extra: { model, promptOps: { prompt: prompt.prompt, cancel: prompt.cancel, resolvePromptParts: prompt.resolvePromptParts } },
      ask: (request) => permission.ask({ ...request, sessionID: parent.id, tool: { messageID: assistant.id, callID }, ruleset: maestro.permission }).pipe(Effect.orDie),
      metadata: (value) => Effect.sync(() => { if (value.metadata) metadata.value = value.metadata }),
    }
    const exit = yield* task.execute(input, ctx).pipe(Effect.exit)
    yield* sessions.updatePart({ ...part, state: Exit.isSuccess(exit)
      ? { status: "completed", input, title: exit.value.title, output: exit.value.output, metadata: exit.value.metadata,
          time: { start: part.state.time.start, end: Date.now() } }
      : { status: "error", input, error: Cause.pretty(exit.cause), metadata: metadata.value,
          time: { start: part.state.time.start, end: Date.now() } } })
    // The parent's provider turn ends on its tool call, as Orchestra's loop would end it; a later notice continues it.
    yield* sessions.updateMessage({ ...assistant, finish: "tool-calls", time: { ...assistant.time, completed: Date.now() } })
    return { exit, metadata: structuredClone(metadata.value), partID: part.id }
  })
  return { remote, fs, instance, sessions, prompt, parent, assistant, model, call }
})

export * as NativeResearchTask from "./native-task"

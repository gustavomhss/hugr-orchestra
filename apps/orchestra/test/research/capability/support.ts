export * as CapabilitySupport from "./support"

import { Effect, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { SessionProjector } from "@orchestra/core/session/projector"
import { FSUtil } from "@orchestra/core/fs-util"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { Research } from "@orchestra/schema/research"
import { filesystem, httpClient } from "@orchestra/core/effect/app-node-platform"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import { LogicalTask } from "@/maestro/logical-task"
import { Permission } from "@/permission"
import { ResearchExecution } from "@/research/allowance"
import { MessageID, PartID } from "@/session/schema"
import { Instruction } from "@/session/instruction"
import { Session } from "@/session/session"
import { Skill } from "@/skill"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { Tool } from "@/tool/tool"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { TestInstance } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"

const nodes = LayerNode.group([
  ToolRegistry.node, Session.node, ResearchExecution.node, ResearchRecords.node, ResearchArtifacts.node,
  Agent.node, Permission.node, FSUtil.node, Database.node, SessionProjector.node, EventV2Bridge.node, Git.node,
  // The services ResearchRegistry.make reaches when a test initializes the engine tools itself.
  Config.node, Skill.node, Truncate.node, Instruction.node, AtlasKnowledge.node, filesystem, httpClient,
  AppProcess.node, RipgrepBinary.node,
])

/** The native loop with default flags. */
export const it = testEffect(TestAppNodeBuilder.build(nodes))

/** The native loop with the experimental LSP tool on, so its absence for the seat means something. */
export const withLsp = testEffect(TestAppNodeBuilder.build(nodes, [[RuntimeFlags.node, RuntimeFlags.layer({ experimentalLspTool: true })]]))

export const model = { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-test") }

/**
 * One native `jimmy` execution Session under a Maestro authority, as the loop's task tool leaves it. `run` executes a
 * registry tool as a completed tool part the next call can see; `invoke` runs any tool definition (including one the
 * registry hides from the seat) under the same dispatch with permission asks answered.
 */
export const dispatch = Effect.fn("CapabilitySupport.dispatch")(function* () {
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const execution = yield* ResearchExecution.Service
  const instance = yield* TestInstance
  const authority = yield* sessions.create({ agent: "maestro", title: "Capability authority" })
  const child = yield* sessions.create({ agent: "jimmy", title: "Capability execution", parentID: authority.id })
  yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: authority.id,
    projectID: child.projectID, memberID: "jimmy", source: "host" })
  const agent = yield* agents.get("jimmy")
  const tools = yield* registry.tools({ agent, ...model })
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: child.id, role: "user", agent: "jimmy",
    model, time: { created: Date.now() } })
  const assistant = { id: MessageID.ascending(), sessionID: child.id, role: "assistant" as const, parentID: user.id,
    agent: "jimmy", mode: "subagent", path: { cwd: instance.directory, root: instance.directory }, ...model, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } }
  yield* sessions.updateMessage(assistant)
  const invoke = Effect.fn("CapabilitySupport.invoke")(function* (tool: Pick<Tool.Def, "execute">, name: string, args: unknown, open = false) {
    const callID = PartID.ascending()
    const part = { type: "tool" as const, id: PartID.ascending(), sessionID: child.id, messageID: assistant.id, callID, tool: name,
      state: { status: "running" as const, input: args as Record<string, unknown>, time: { start: Date.now() } } }
    yield* sessions.updatePart(part)
    const context: Tool.Context = { sessionID: child.id, messageID: assistant.id, callID, agent: agent.name, agentID: "jimmy",
      permission: agent.permission, abort: AbortSignal.any([]), messages: yield* sessions.messages({ sessionID: child.id }),
      metadata: () => Effect.void,
      ask: open ? () => Effect.void
        : (request) => permission.ask({ ...request, sessionID: child.id, tool: { messageID: assistant.id, callID }, ruleset: agent.permission }).pipe(Effect.orDie) }
    const result = yield* execution.enter(child.id, "capability-dispatch", tool.execute(args, context))
    yield* sessions.updatePart({ ...part, state: { status: "completed", input: part.state.input, title: result.title, output: result.output,
      metadata: result.metadata, time: { start: part.state.time.start, end: Date.now() } } })
    return result
  })
  const run = (name: string, args: unknown) => {
    const tool = tools.find((candidate) => candidate.id === name)
    if (!tool) throw new Error(`Missing native research tool: ${name}`)
    return invoke(tool, name, args)
  }
  return { sessions, authority, agent, tools, run, invoke, directory: instance.directory, assistant, child }
})

export const source = (result: Tool.ExecuteResult) => Schema.decodeUnknownSync(Research.SourceReceipt)(result.metadata.researchSource)

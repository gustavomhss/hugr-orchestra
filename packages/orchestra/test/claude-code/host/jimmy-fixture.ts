export * as ClaudeResearchFixture from "./jimmy-fixture"

import { Effect, Schema } from "effect"
import { eq } from "drizzle-orm"
import type { BaseHookInput, HookInput } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Database } from "@orchestra/core/database/database"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ResearchRecords } from "@orchestra/core/research/records"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { Agent } from "@/agent/agent"
import { ClaudeHost } from "@/claude-code/host/session"
import { ClaudeHostHooks } from "@/claude-code/host/hooks"
import { ClaudeHostJoin } from "@/claude-code/host/join"
import { ClaudeHostResearch } from "@/claude-code/host/research"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { LogicalTask } from "@/maestro/logical-task"
import { Permission } from "@/permission"
import { ResearchExecution } from "@/research/allowance"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import { Todo } from "@/session/todo"
import { Snapshot } from "@/snapshot"
import { MessageID, PartID } from "@/session/schema"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { testEffect } from "../../lib/effect"

export const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  ClaudeHost.node, ToolRegistry.node, Agent.node, Config.node, Session.node, SessionProjector.node, SessionSubagentModels.node,
  ResearchExecution.node, ResearchAllowance.node, ResearchRecords.node, Database.node, EventV2Bridge.node,
  Permission.node, FSUtil.node, AppProcess.node, Git.node, ArsenalObservations.node, LocationServiceMap.node,
   Snapshot.node, Todo.node, SessionStatus.node, AtlasKnowledge.node, filesystem,
]), [[RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true, experimentalEventSystem: true })]]))

export const base = { session_id: "native-host", transcript_path: "/tmp/unused", cwd: "/tmp" } satisfies BaseHookInput
export const ref = { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-test") }

export const setup = Effect.fn("ClaudeResearchFixture.setup")(function* (input: { research?: false; capture?: false } = {}) {
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const registry = yield* ToolRegistry.Service
  const context = yield* Effect.context<never>()
  const parent = yield* sessions.create({ agent: "maestro", title: "Research authority" })
  // Model root metadata retained after native init. Child hooks may share session_id (live S13).
  yield* sessions.setMetadata({ sessionID: parent.id, metadata: { claudeCode: { sessionId: base.session_id } } })
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: parent.id, role: "user", agent: "maestro",
    model: ref, time: { created: Date.now() } } satisfies SessionV1.User)
  const assistant = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: parent.id, role: "assistant", parentID: user.id,
    agent: "maestro", mode: "maestro", providerID: ref.providerID, modelID: ref.modelID, path: { cwd: parent.directory, root: parent.directory },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } } satisfies SessionV1.Assistant)
  const join = ClaudeHostJoin.make()
  const research = yield* ClaudeHostResearch.make
  yield* Effect.addFinalizer(() => research.close)
  const seat = yield* agents.get("jimmy")
  const tools = yield* registry.tools({ agent: seat, ...ref })
  const granted = { maestro: ["task"], jimmy: tools.map((tool) => tool.id) }
  const mirrored = new Map<string, SessionV1.ToolPart>()
  const abort = new AbortController()
  yield* Effect.addFinalizer(() => Effect.sync(() => abort.abort()))
  const hooks = ClaudeHostHooks.create({ sessionID: parent.id, directory: parent.directory, worktree: parent.directory,
    agent: "maestro", abort, join, granted,
    research: input.research === false ? undefined : input.capture === false ? { ...research, capture: undefined } : research,
    run: <A, R>(effect: Effect.Effect<A, unknown, R>) => Effect.runPromiseWith(context)(effect as Effect.Effect<A, unknown>),
    parts: { tool: (callID) => mirrored.get(callID), complete: (part) => sessions.updatePart(part).pipe(
      Effect.tap(() => Effect.sync(() => { mirrored.set(part.callID, part) })), Effect.asVoid) },
  })
  // Native admission goes through the real hook and retained logical Task. Only SDK task identity is scripted.
  const nativeDispatch = Effect.fn("ClaudeResearchFixture.nativeDispatch")(function* (callID = "toolu_research", tier: Research.Depth = "quick", brief?: string) {
    const admitted = yield* dispatch(callID, { subagentType: `orchestra:jimmy-${tier}`, prompt: brief })
    const child = join.child(callID)
    if (!child) throw new Error(`Research dispatch denied: ${JSON.stringify(admitted.output)}`)
    const taskID = `native-${callID}`
    join.taskStarted({ toolUseID: callID, taskID })
    const prompt = (yield* sessions.messages({ sessionID: child })).find((message) => message.info.role === "user")
    if (!prompt) throw new Error("Missing dispatch prompt")
    const message = yield* sessions.updateMessage({ ...assistant, id: MessageID.ascending(), sessionID: child,
      parentID: prompt.info.id, agent: "jimmy", mode: "subagent" })
    const pre = (name: string, toolUseID: string, input: unknown = {}) => fire({ ...base, agent_id: taskID,
      hook_event_name: "PreToolUse", tool_name: name, tool_use_id: toolUseID, tool_input: input })
    const post = (name: string, toolUseID: string) => fire({ ...base, agent_id: taskID,
      hook_event_name: "PostToolUse", tool_name: name, tool_use_id: toolUseID, tool_input: {}, tool_response: "retained output" })
    const settle = () => fire({ ...base, hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: callID,
      tool_input: {}, tool_response: { status: "completed", agentId: taskID, content: [{ type: "text", text: "Done" }] } })
    const run = (name: string, args: unknown, toolUseID: string) => Effect.gen(function* () {
      const tool = tools.find((tool) => tool.id === name)
      if (!tool) throw new Error(`Missing registry tool ${name}`)
      // Native invocation authority includes the retained child tool part, not only its assistant message.
      const input = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(args)
      const start = Date.now()
      const part = yield* sessions.updatePart({ id: PartID.ascending(), sessionID: child, messageID: message.id, callID: toolUseID,
        type: "tool", tool: name, state: { status: "running", input, time: { start } } })
      const result = yield* research.execute(child, tool.execute(args, {
        sessionID: child, messageID: message.id, callID: toolUseID, agent: seat.name, agentID: "jimmy",
        permission: seat.permission, extra: { claudeCode: true }, abort: abort.signal, messages: [],
        ask: () => Effect.void, metadata: () => Effect.void,
      } satisfies Tool.Context))
      yield* sessions.updatePart({ ...part, state: { status: "completed", input, output: result.output, title: result.title,
        metadata: result.metadata, time: { start, end: Date.now() } } })
      return result
    })
    return { ...admitted, child, message, taskID, pre, post, settle, run }
  })
  const fire = (input: HookInput) => Effect.promise(() => hooks[input.hook_event_name]![0].hooks[0](input, undefined, { signal: abort.signal }))
  const dispatch = Effect.fn("ClaudeResearchFixture.dispatch")(function* (callID = "toolu_research",
    input: { tool?: "Agent" | "Task"; subagentType?: string; background?: boolean; prompt?: string } = {}) {
    const args = { subagent_type: input.subagentType ?? "orchestra:jimmy-quick", description: "Investigate conditions",
      prompt: input.prompt ?? "Find the applicability conditions.", run_in_background: input.background ?? false }
    const part = yield* sessions.updatePart({ id: PartID.ascending(), messageID: assistant.id, sessionID: parent.id, type: "tool",
      tool: input.tool ?? "Agent", callID, state: { status: "running", input: args, time: { start: Date.now() } }, metadata: { providerExecuted: true } })
    mirrored.set(callID, part)
    const output = yield* fire({ ...base, hook_event_name: "PreToolUse", tool_name: input.tool ?? "Agent", tool_input: args, tool_use_id: callID })
    return { output, callID }
  })
  // Service-only setup: creates a real logical Task and calls exported admission directly.
  // It does not claim that PreToolUse admits a native Jimmy child or starts an SDK query.
  const serviceDispatch = Effect.fn("ClaudeResearchFixture.serviceDispatch")(function* (callID = "service-research") {
    const child = yield* sessions.create({ parentID: parent.id, agent: "jimmy", title: "Research service fixture" })
    yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: parent.id,
      projectID: parent.projectID, memberID: "jimmy", source: "host" })
    const prompt = yield* sessions.updateMessage({ ...user, id: MessageID.ascending(), sessionID: child.id, agent: "jimmy" })
    const message = yield* sessions.updateMessage({ ...assistant, id: MessageID.ascending(), sessionID: child.id, parentID: prompt.id,
      agent: "jimmy", mode: "subagent" })
    yield* research.enter(child.id, callID)
    const run = (name: string, args: unknown, toolUseID: string) => Effect.gen(function* () {
      const tool = tools.find((tool) => tool.id === name)
      if (!tool) throw new Error(`Missing registry tool ${name}`)
      const part = yield* sessions.updatePart({ id: PartID.ascending(), sessionID: child.id, messageID: message.id, callID: toolUseID,
        type: "tool", tool: name, state: { status: "running", input: {}, time: { start: Date.now() } } })
      const result = yield* research.execute(child.id, tool.execute(args, {
        sessionID: child.id, messageID: message.id, callID: toolUseID, agent: seat.name, agentID: "jimmy",
        permission: seat.permission, extra: { claudeCode: true }, abort: abort.signal, messages: [],
        ask: () => Effect.void, metadata: () => Effect.void,
      } satisfies Tool.Context))
      yield* sessions.updatePart({ ...part, state: { status: "completed", input: {}, output: result.output, title: result.title,
        metadata: result.metadata, time: { start: Date.now(), end: Date.now() } } })
      return result
    })
    return { child: child.id, message, run, callID }
  })
  return { parent, assistant, sessions, hooks, join, research, fire, dispatch, nativeDispatch, serviceDispatch, mirrored, tools, seat, abort }
})

export const charges = Effect.fn("ClaudeResearchFixture.charges")(function* (sessionID: string) {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID)).all().pipe(Effect.orDie)
  return rows.filter((row) => row.type === EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1))
    .map((row) => Schema.decodeUnknownSync(ResearchEvent.AllowanceCharged.data)(row.data))
})

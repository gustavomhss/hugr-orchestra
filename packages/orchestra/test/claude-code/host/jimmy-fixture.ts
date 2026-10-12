export * as ClaudeResearchFixture from "./jimmy-fixture"

import { Context, Effect, Schema } from "effect"
import { eq } from "drizzle-orm"
import type { HookInput } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Database } from "@orchestra/core/database/database"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ResearchRecords } from "@orchestra/core/research/records"
import { SessionProjector } from "@orchestra/core/session/projector"
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
import { Permission } from "@/permission"
import { ResearchExecution } from "@/research/allowance"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { Todo } from "@/session/todo"
import { Snapshot } from "@/snapshot"
import { MessageID, PartID } from "@/session/schema"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { testEffect } from "../../lib/effect"

export const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  ClaudeHost.node, ToolRegistry.node, Agent.node, Config.node, Session.node, SessionProjector.node,
  ResearchExecution.node, ResearchAllowance.node, ResearchRecords.node, Database.node, EventV2Bridge.node,
  Permission.node, FSUtil.node, AppProcess.node, Git.node, ArsenalObservations.node, LocationServiceMap.node,
  Snapshot.node, Todo.node, SessionStatus.node, filesystem,
]), [[RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true, experimentalEventSystem: true })]]))

export const base = { session_id: "native-host", transcript_path: "/tmp/unused", cwd: "/tmp" }
export const ref = { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-test") }

export const setup = Effect.fn("ClaudeResearchFixture.setup")(function* () {
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const registry = yield* ToolRegistry.Service
  const context = yield* Effect.context<never>()
  const parent = yield* sessions.create({ agent: "maestro", title: "Research authority" })
  yield* sessions.setMetadata({ sessionID: parent.id, metadata: {
    ...parent.metadata, claudeCode: { ...parent.metadata?.claudeCode, sessionId: base.session_id },
  } })
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
    agent: "maestro", abort, join, granted, research,
    run: <A, R>(effect: Effect.Effect<A, unknown, R>) => Effect.runPromiseWith(context)(effect as Effect.Effect<A, unknown>),
    parts: { tool: (callID) => mirrored.get(callID), complete: (part) => sessions.updatePart(part).pipe(
      Effect.tap(() => Effect.sync(() => { mirrored.set(part.callID, part) })), Effect.asVoid) },
  })
  const fire = (input: HookInput) => Effect.promise(() => hooks[input.hook_event_name]![0].hooks[0](input, undefined, { signal: abort.signal }))
  const dispatch = Effect.fn("ClaudeResearchFixture.dispatch")(function* (callID = "toolu_research") {
    const args = { subagent_type: "orchestra:jimmy", description: "Investigate conditions", prompt: "Find the applicability conditions.", run_in_background: false }
    const part = yield* sessions.updatePart({ id: PartID.ascending(), messageID: assistant.id, sessionID: parent.id, type: "tool",
      tool: "Agent", callID, state: { status: "running", input: args, time: { start: Date.now() } }, metadata: { providerExecuted: true } })
    mirrored.set(callID, part)
    const output = yield* fire({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: args, tool_use_id: callID })
    const child = join.child(callID)
    if (!child) throw new Error(`Research dispatch denied: ${JSON.stringify(output)}`)
    join.taskStarted({ toolUseID: callID, taskID: `native-${callID}` })
    const prompt = (yield* sessions.messages({ sessionID: child })).find((message) => message.info.role === "user")
    if (!prompt) throw new Error("Missing dispatch prompt")
    const message = yield* sessions.updateMessage({ ...assistant, id: MessageID.ascending(), sessionID: child, parentID: prompt.info.id,
      agent: "jimmy", mode: "subagent" })
    // Real SDK hooks share the host session_id; the joined agent_id identifies the child.
    const pre = (name: string, toolUseID: string, input: unknown = {}) => fire({ ...base, agent_id: `native-${callID}`,
      hook_event_name: "PreToolUse", tool_name: name, tool_use_id: toolUseID, tool_input: input })
    const post = (name: string, toolUseID: string) => fire({ ...base, agent_id: `native-${callID}`,
      hook_event_name: "PostToolUse", tool_name: name, tool_use_id: toolUseID, tool_input: {}, tool_response: "retained output" })
    const settle = () => fire({ ...base, hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: callID,
      tool_input: args, tool_response: { status: "completed", agentId: `native-${callID}`, content: [{ type: "text", text: "Done" }] } })
    const run = (name: string, args: unknown, toolUseID: string) => Effect.gen(function* () {
      const tool = tools.find((tool) => tool.id === name)
      if (!tool) throw new Error(`Missing registry tool ${name}`)
      const part = yield* sessions.updatePart({ id: PartID.ascending(), sessionID: child, messageID: message.id, callID: toolUseID,
        type: "tool", tool: name, state: { status: "running", input: {}, time: { start: Date.now() } } })
      const result = yield* research.execute(child, tool.execute(args, {
        sessionID: child, messageID: message.id, callID: toolUseID, agent: seat.name, agentID: "jimmy",
        permission: seat.permission, extra: { claudeCode: true }, abort: abort.signal, messages: [],
        ask: () => Effect.void, metadata: () => Effect.void,
      } satisfies Tool.Context))
      yield* sessions.updatePart({ ...part, state: { status: "completed", input: {}, output: result.output, title: result.title,
        metadata: result.metadata, time: { start: Date.now(), end: Date.now() } } })
      return result
    })
    return { child, message, output, pre, post, settle, run, callID }
  })
  return { parent, assistant, sessions, hooks, join, research, fire, dispatch, mirrored, tools, seat, abort }
})

export const charges = Effect.fn("ClaudeResearchFixture.charges")(function* (sessionID: string) {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID)).all().pipe(Effect.orDie)
  return rows.filter((row) => row.type === EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1))
    .map((row) => Schema.decodeUnknownSync(ResearchEvent.AllowanceCharged.data)(row.data))
})

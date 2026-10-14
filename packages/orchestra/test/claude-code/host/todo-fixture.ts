export * as ClaudeHostTodoFixture from "./todo-fixture"

import type { SDKAssistantMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Database } from "@orchestra/core/database/database"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Effect } from "effect"
import { Agent } from "@/agent/agent"
import { ClaudeHostMemory } from "@/claude-code/host/memory"
import { ClaudeHostMirror } from "@/claude-code/host/mirror"
import { Archive } from "@/continuity/archive"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { SessionRevert } from "@/session/revert"
import { MessageID, PartID, type SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { Todo } from "@/session/todo"
import { Snapshot } from "@/snapshot"
import { Truncate } from "@/tool/truncate"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { TestInstance } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"

// Real services shared by retained, unavailable and recall cases; SDK frames are inputs, not mocked producers.
export const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  filesystem, CrossSpawnSpawner.node, LocationServiceMap.node, Session.node, SessionProjector.node,
  SessionRevert.node, Snapshot.node, SessionStatus.node, Todo.node, Agent.node, Archive.node, Database.node, Truncate.node,
]), [[RuntimeFlags.node, RuntimeFlags.layer({})]]))
export const subject = "A-survives-完整🙂\n" + "complete subject ".repeat(80)
const base = { session_id: "native-todos", parent_tool_use_id: null }
export const assistant = (content: SDKAssistantMessage["message"]["content"]): SDKAssistantMessage => ({
  ...base, uuid: crypto.randomUUID(), type: "assistant", message: {
    id: `api-${crypto.randomUUID()}`, model: "claude-test", role: "assistant", type: "message", container: null, context_management: null,
    stop_reason: "tool_use", stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
      cache_creation: null, server_tool_use: null, service_tier: null }, content,
  },
})
export const result = (id: string, structured: unknown, failed = false): SDKUserMessage => ({
  ...base, uuid: crypto.randomUUID(), type: "user", tool_use_result: structured,
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id,
    content: typeof structured === "string" ? structured : "native result", is_error: failed }] },
})

export const setup = Effect.fnUntraced(function* () {
  const instance = yield* TestInstance
  const sessions = yield* Session.Service
  const snapshot = yield* Snapshot.Service
  const todo = yield* Todo.Service
  const status = yield* SessionStatus.Service
  const agents = yield* Agent.Service
  const agent = yield* agents.get("maestro")
  const chat = yield* sessions.create({ title: "Retained native tasks" })
  const user = Effect.fnUntraced(function* (sessionID: SessionID) {
    const info = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID, role: "user", agent: "maestro",
      model: { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-test") }, time: { created: Date.now() } })
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: info.id, type: "text", text: "native task turn" })
    return info
  })
  // No shared maps: every call builds a cold mirror over the actual persisted history.
  const make = (owner: SessionV1.User) => ClaudeHostMirror.create({ sessionID: owner.sessionID, user: owner, agent,
    path: { cwd: instance.directory, root: instance.directory }, sessions, snapshot, todo, status })
  const native = Effect.fnUntraced(function* (mirror: ClaudeHostMirror.Mirror, name: string,
    args: Record<string, unknown>, structured: unknown, failed = false) {
    const id = crypto.randomUUID()
    yield* mirror.on(assistant([{ type: "tool_use", id, name, input: args }]))
    yield* mirror.on(result(id, structured, failed))
    const part = mirror.tool(id)
    if (!part || part.state.status !== "completed" && part.state.status !== "error") throw new Error("Missing native tool result")
    return part
  })
  const memory = (sessionID: SessionID) => ClaudeHostMemory.read({ sessionID, pending: [], grants: [] })
  return { sessions, todo, chat, user, make, native, memory }
})

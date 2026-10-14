import { Effect } from "effect"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import type { SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk"
import type { PermissionV1 } from "@orchestra/core/v1/permission"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { Agent } from "@/agent/agent"
import { ClaudeHostBridge } from "@/claude-code/host/bridge"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { ClaudeHostMirror } from "@/claude-code/host/mirror"
import type { ClaudeHostResearch } from "@/claude-code/host/research"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { Permission } from "@/permission"
import { MessageID, PartID, type SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { Todo } from "@/session/todo"
import { Snapshot } from "@/snapshot"
import type { Tool } from "@/tool/tool"
import { TestInstance } from "../../fixture/fixture"

export const connect = Effect.fnUntraced(function* (server: ReturnType<typeof ClaudeHostMcp.server>) {
  const client = new Client({ name: "host-bridge-fixture", version: "1" })
  const transports = InMemoryTransport.createLinkedPair()
  yield* Effect.addFinalizer(() => Effect.promise(() => client.close()))
  yield* Effect.promise(async () => { await server.instance.connect(transports[0]); await client.connect(transports[1]) })
  return client
})

/** Real persistence, real mirrors, real identity/permission/runtime services; only SDK frames are scripted. */
export const make = Effect.fnUntraced(function* (sessionID?: SessionID, research?: ClaudeHostResearch.Runtime) {
  const instance = yield* TestInstance
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const snapshot = yield* Snapshot.Service
  const todo = yield* Todo.Service
  const status = yield* SessionStatus.Service
  const bindings = yield* ArsenalBindings.make
  const context = yield* Effect.context<never>()
  const parent = sessionID ? yield* sessions.get(sessionID) : yield* sessions.create({ agent: "maestro", title: "Bridge parent" })
  const abort = new AbortController()
  yield* Effect.addFinalizer(() => Effect.sync(() => abort.abort()))
  const ctx = { sessionID: parent.id, directory: instance.directory, worktree: instance.directory, agent: "maestro", abort }
  const known = { calls: new Map<string, ClaudeHostMirror.Mirror>(), tasks: new Map<string, string>() }
  const live: ClaudeHostBridge.Live & { turn?: { view: ClaudeHostMirror.Mirror } } = {
    sessionID: parent.id, known, run: <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromiseWith(context)(effect),
  }
  const bridge = ClaudeHostBridge.create(live, ctx, { sessions, permission, agents, research, withSession: bindings.withSession })
  const wire = new Map<string, Record<string, unknown>>()
  const mirrors = new Map<SessionID, ClaudeHostMirror.Mirror>()
  const mirror = Effect.fnUntraced(function* (id: SessionID, seat: string) {
    const existing = mirrors.get(id)
    if (existing) return existing
    const agent = yield* agents.get(seat)
    if (!agent) throw new Error(`missing fixture agent ${seat}`)
    const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: id, role: "user", agent: seat,
      model: { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-haiku-4-5-20251001") }, time: { created: Date.now() } })
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: id, messageID: user.id, type: "text", text: `brief for ${seat}` })
    const view = ClaudeHostMirror.create({ sessionID: id, user, agent, path: { cwd: instance.directory, root: instance.directory },
      sessions, snapshot, todo, status, known })
    mirrors.set(id, view)
    return view
  })
  live.turn = { view: yield* mirror(parent.id, "maestro") }
  const child = Effect.fnUntraced(function* (seat: string, rules: PermissionV1.Ruleset = []) {
    const session = yield* sessions.create({ parentID: parent.id, agent: seat, title: seat, permission: rules })
    yield* mirror(session.id, seat)
    return session
  })
  const call = Effect.fnUntraced(function* (input: {
    id: string; tool: string; args: Record<string, unknown>; sessionID?: SessionID; seat?: string; signal?: AbortSignal;
    accepted?: Record<string, unknown>
  }) {
    const session = input.sessionID ?? parent.id
    const view = yield* mirror(session, input.seat ?? "maestro")
    const frame: SDKAssistantMessage = {
      type: "assistant", parent_tool_use_id: null, uuid: crypto.randomUUID(), session_id: "fixture-native",
      message: { id: `msg_${session}`, type: "message", role: "assistant", model: "claude-haiku-4-5-20251001", container: null,
        context_management: null, stop_reason: "tool_use", stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null,
          cache_creation: null, server_tool_use: null, service_tier: null },
        content: [{ type: "tool_use", id: input.id, name: `mcp__orchestra__${input.tool}`, input: input.args }] },
    }
    yield* view.on(frame)
    wire.set(input.id, bridge.reserve({ callID: input.id, sessionID: session, seat: input.seat ?? "maestro", tool: input.tool,
      input: input.args, args: input.accepted ?? input.args, signal: input.signal ?? new AbortController().signal }))
    const part = view.tool(input.id)
    if (!part) throw new Error("fixture did not mirror the call")
    return part
  })
  const client = (tools: readonly Tool.Def[] = []) => connect(ClaudeHostMcp.server({ ...ctx, tools, bridge }))
  return { sessions, agents, permission, parent, child, call, ctx, live, bridge, client, mirrors,
    arguments: (id: string) => {
      const input = wire.get(id)
      if (!input) throw new Error(`no accepted fixture call ${id}`)
      return input
    } }
})

export * as BridgeFixture from "./bridge-fixture"

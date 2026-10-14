export * as ClaudeHost from "./session"

// Claude Code as the host of an Orchestra session (meta-harness PLAN.md §4.1). One long-lived SDK `query()` per active
// session, fed by one streaming input that stays open while the session lives:
// - a turn sends the owner's undelivered messages and waits for Claude Code's `result`; Claude Code owns the loop;
// - a steer goes into the same input with `priority: "next"`, so Claude Code reads it once the running tools finish;
//   a queued message is simply left for the next turn;
// - Stop is `interrupt()`, the model picker is `setModel()`;
// - Claude Code's session id is derived 1:1 from the Orchestra session id, so resume and fork use the SDK's own
//   `resume` / `forkSession` and need no transcript store;
import { createHash } from "node:crypto"
import { Context, Effect, Exit, FileSystem, Layer, Semaphore } from "effect"
import type { AgentDefinition, AgentInfo, CanUseTool, ModelInfo, ModelUsage, PermissionResult, Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { Database } from "@orchestra/core/database/database"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Agent } from "@/agent/agent"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { InstanceStore } from "@/project/instance-store"
import { BackgroundProcess } from "@/background/process"
import { Config } from "@/config/config"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { Provider } from "@/provider/provider"
import { ModelsDev } from "@orchestra/core/models-dev"
import { InstanceState } from "@/effect/instance-state"
import { Permission } from "@/permission"
import { Question } from "@/question"
import { marker } from "@/continuity/alias"
import { RequestSource } from "@/continuity/request-source"
import { Archive } from "@/continuity/archive"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { SessionSummary } from "@/session/summary"
import { SessionLifecycle } from "@/session/lifecycle"
import { ClaudeHostBoundary } from "./boundary"
import { ClaudeHostAdmission } from "./admission"
import { Todo } from "@/session/todo"
import { Snapshot } from "@/snapshot"
import type { TaskPromptOps } from "@/tool/task"
import type { Tool } from "@/tool/tool"
import { ClaudeCodeSDK } from "../sdk"
import { ClaudeCodeTools } from "../tools"
import { ClaudeCodeTranscript } from "../transcript"
import { asks } from "../permissions"
import { ClaudeHostBridge } from "./bridge"
import { ClaudeHostHooks } from "./hooks"
import { ClaudeHostDelegation } from "./delegation"
import { ClaudeHostJoin } from "./join"
import { ClaudeHostResearch } from "./research"
import { ResearchExecution } from "@/research/allowance"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ResearchRecords } from "@orchestra/core/research/records"
import { Catalog } from "@orchestra/core/catalog"
import { ModelV2 } from "@orchestra/core/model"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { AbsolutePath } from "@orchestra/core/schema"
import { ClaudeHostMcp } from "./mcp"
import { ClaudeHostMirror } from "./mirror"
import { ClaudeHostPlugin } from "./plugin"
import { ClaudeHostOptions } from "./options"

export interface Interface {
  /**
   * Run one turn when the user's agent is on Claude Code: everything the owner sent since the last delivery. False when
   * the agent runs on Orchestra's loop. Like the engine's turn, it always ends with an assistant reply to `user` (with
   * `error` when it failed), so the loop's own exit check ends the run. `promptOps` is accepted for the engine's entry
   * contract; delegation here is Claude Code's own `Agent` tool.
   */
  readonly turn: (input: { sessionID: SessionID; user: SessionV1.User; promptOps?: () => Effect.Effect<TaskPromptOps> }) => Effect.Effect<boolean>
  /** Hand a message to the running turn (`priority: "next"`). False when no turn runs: the next turn sends it. */
  readonly steer: (input: { sessionID: SessionID; user: SessionV1.WithParts; model?: string }) => Effect.Effect<boolean>
  /** Stop the running turn. Idle or unknown sessions are a no-op. */
  readonly interrupt: (sessionID: SessionID) => Effect.Effect<void>
  /** The model picker: switch the live session's model. */
  readonly setModel: (input: { sessionID: SessionID; model?: string }) => Effect.Effect<void>
  /** `sessionID` was forked from `from` (at `messageID`): its first turn forks Claude Code's session too. */
  readonly fork: (input: { sessionID?: SessionID; from: SessionID; messageID?: MessageID; ids?: ReadonlyMap<string, MessageID> }) => Effect.Effect<Session.Info["metadata"]>
  /** Release the session's Claude Code process now. */
  readonly release: (sessionID: SessionID) => Effect.Effect<void>
  /** Reconcile the native history before prompt admission clears Orchestra revert state. */
  readonly reconcileRevert: (session: Session.Info) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ClaudeHost") {}

/**
 * Overrides of the plugin, MCP and hook builders (tests). They default to `plugin.ts`, `mcp.ts` and `hooks.ts`. The
 * hooks are Orchestra's policy gate: ClaudeHostOptions.build refuses a session whose hooks carry no PreToolUse gate.
 */
export const Adapters = Context.Reference<Partial<Omit<ClaudeHostOptions.Adapters, "join">>>("@orchestra/ClaudeHost/Adapters", {
  defaultValue: () => ({}),
})

/** How long a session's process outlives its last turn, so a quick follow-up does not respawn it. */
export const IdleRelease = Context.Reference<number>("@orchestra/ClaudeHost/IdleRelease", { defaultValue: () => 60_000 })

/** Claude Code's session id for an Orchestra session: a name-based (v5) UUID, stable across restarts. */
export function claudeSessionID(sessionID: string) {
  const hash = createHash("sha1").update(NAMESPACE).update(sessionID).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString("hex")
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-")
}
const NAMESPACE = Buffer.from("8f0c5b3e6a2d4f1b9c7e0d2a4b6c8e1f", "hex")

export const userInput = ClaudeHostAdmission.userInput
export const inbox = ClaudeHostAdmission.inbox

type Outcome = { ok: true } | { ok: false; aborted?: boolean; message: string }
type Turn = { view: ClaudeHostMirror.Mirror; user: SessionV1.User; cost: number; waiters: ((outcome: Outcome) => void)[]; answered: Set<MessageID>; error?: string; errorUUID?: string }
type Live = {
  sessionID: SessionID
  query: Query
  bridge?: ReturnType<typeof ClaudeHostBridge.create>
  research?: ClaudeHostResearch.Runtime
  inbox: ReturnType<typeof inbox>
  abort: AbortController
  agent: Agent.Info
  seat: string
  model?: string
  turn?: Turn
  discard: boolean
  background: number
  uuids: Record<string, string>
  delivered: Set<string>
  settledResults: Set<string>
  inputs: Record<string, ClaudeHostAdmission.Input>
  queued: Set<string>
  starts: Record<string, string>
  sends: Map<string, SessionV1.User>
  ends: Record<string, string>
  chain?: string
  pump: Promise<void>
  processJoin: () => Promise<void>
  callbacks: Set<Promise<unknown>>
  closed?: boolean
  owned?: Set<Live>
  closing?: Promise<void>
  stopping?: Promise<void>
  known: { calls: Map<string, ClaudeHostMirror.Mirror>; tasks: Map<string, string>; usage: Map<string, ModelUsage> }
  /** The child session of each subagent run, by its Agent `tool_use_id`. */
  children: Map<string, SessionID>
  /** The Agent-call identity join the hooks share with this stream consumer (spikes S3, S12). */
  join: ClaudeHostJoin.Join
  idle?: ReturnType<typeof setTimeout>
  ended?: string
  make: (user: SessionV1.User) => ClaudeHostMirror.Mirror
  run: <A>(effect: Effect.Effect<A, unknown>, teardown?: boolean) => Promise<A>
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const researchExecution = yield* ResearchExecution.Service
    const researchAllowance = yield* ResearchAllowance.Service
    const researchRecords = yield* ResearchRecords.Service
    const subagentModels = yield* SessionSubagentModels.Service
    const locations = yield* LocationServiceMap.Service
    const overrides = yield* Adapters
    const bindings = yield* ArsenalBindings.make
    const lifecycle = yield* SessionLifecycle.Service
    const summary = yield* SessionSummary.Service
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const snapshot = yield* Snapshot.Service
    const permission = yield* Permission.Service
    const question = yield* Question.Service
    const todo = yield* Todo.Service
    const status = yield* SessionStatus.Service
    const sdk = yield* ClaudeCodeSDK.Service
    const provider = yield* Provider.Service
    const catalog = yield* ModelsDev.Service
    // What resolving the served registry tools needs (ClaudeHostMcp.prepare: registry, config, the process tool).
    const preparation = yield* Effect.context<Effect.Services<ReturnType<typeof ClaudeHostMcp.prepare>> | ResearchRecords.Service>()
    const serviceState = { disposed: false }
    const lives = new Map<SessionID, Live>()
    const startups = new Map<SessionID, Semaphore.Semaphore>()
    const releasing = new Set<SessionID>()
    const revisions = new Map<SessionID, number>()
    const writes = new Map<SessionID, Semaphore.Semaphore>()
    const exclusive = <A, E, R>(locks: Map<SessionID, Semaphore.Semaphore>, sessionID: SessionID, effect: Effect.Effect<A, E, R>) => Effect.suspend(() => {
      const lock = locks.get(sessionID) ?? Semaphore.makeUnsafe(1)
      locks.set(sessionID, lock)
      return lock.withPermits(1)(effect)
    })

    const read = (sessionID: SessionID) => sessions.get(sessionID).pipe(Effect.orDie, Effect.map((session) => {
      const value = session.metadata?.claudeCode
      return ClaudeCodeTranscript.record(value) ? value : {}
    }))
    const write = (sessionID: SessionID, value: Record<string, unknown>) => exclusive(writes, sessionID, Effect.gen(function* () {
      const latest = (yield* sessions.get(sessionID).pipe(Effect.orDie)).metadata ?? {}
      yield* sessions.setMetadata({ sessionID, metadata: { ...latest,
        claudeCode: { ...(ClaudeCodeTranscript.record(latest.claudeCode) ? latest.claudeCode : {}), ...value } } })
    }))

    const send = (live: Live, view: ClaudeHostMirror.Mirror, user: SessionV1.User, prompt: string, priority?: "next") => Effect.gen(function* () {
      if (live.queued.has(user.id) || live.delivered.has(user.id)) return
      const previous = live.inputs[user.id]
      if (previous && previous.status !== "pending") return yield* Effect.die(new Error(`Claude Code input submission is unresolved for ${user.id}`))
      const message = { ...userInput(prompt, priority), uuid: previous?.uuid ?? crypto.randomUUID() }
      live.inputs[user.id] = { uuid: message.uuid, status: "pending" }
      yield* write(live.sessionID, { inputs: live.inputs })
      if (live.closed || live.stopping || live.closing || live.queued.has(user.id) || live.delivered.has(user.id)) return
      live.sends.set(message.uuid, user)
      yield* view.sent(user, message.uuid)
      if (live.inbox.push(message)) live.queued.add(user.id)
    })

    /**
     * The child session a subagent's frames mirror into. A seat dispatch gets it from the delegation hooks at
     * `PreToolUse[Agent]` (contract V2 §2); any other subagent gets one here at its first frame, keyed by the Agent
     * `tool_use_id`. Either way it exists before the subagent's first tool call, so an `orchestra` MCP call made by the
     * subagent finds its mirrored part.
     */
    const child = (live: Live) => (call: SessionV1.ToolPart) => Effect.gen(function* () {
      const input = call.state.input as Record<string, unknown>
      const seat = String(input.subagent_type ?? "").replace(/^orchestra:/, "")
      const stored = yield* sessions.getPart({ sessionID: call.sessionID, messageID: call.messageID, partID: call.id })
      const recorded = live.children.get(call.callID) ?? live.join.child(call.callID) ?? (stored?.type === "tool" ? childOf(stored) : undefined)
      const existing = recorded ? yield* sessions.get(recorded).pipe(Effect.option) : undefined
      const parent = yield* sessions.get(call.sessionID).pipe(Effect.orDie)
      const inherited = parent.agent ?? live.agent.id ?? live.agent.name
      const selected = String(input.subagent_type ?? "").startsWith("orchestra:") ? seat : inherited
      const agent = (yield* agents.get(existing?._tag === "Some" ? existing.value.agent ?? selected : selected).pipe(
        Effect.orElseSucceed(() => undefined))) ?? live.agent
      const session = existing?._tag === "Some" ? existing.value : yield* Effect.gen(function* () {
        const created = yield* sessions.create({ parentID: call.sessionID, agent: agent.id ?? agent.name, permission: parent.permission,
          title: `${String(input.description ?? seat)} (@${agent.name} subagent)` })
        // The Agent card links its child session where a seat dispatch's card does: the part's and the state's metadata.
        const owner = live.known.calls.get(call.callID)
        const current = owner?.tool(call.callID)
        const placement = { parentSessionId: call.sessionID, sessionId: created.id }
        // Background Agent returns can precede the child's first frame; link their completed cards too.
        if (owner && current && current.state.status !== "pending")
          yield* owner.complete({ ...current, metadata: { ...current.metadata, ...placement },
            state: { ...current.state, metadata: { ...current.state.metadata, ...placement } } })
        return created
      })
      live.children.set(call.callID, session.id)
      live.join.dispatched(call.callID, { child: session.id })
      const messages = yield* sessions.messages({ sessionID: session.id }).pipe(Effect.orDie)
      const brief = messages.findLast((message) => message.info.role === "user")?.info
      if (brief?.role === "user") return { sessionID: session.id, user: brief, agent }
      // No brief recorded yet: show the Agent call's prompt as the child's first message.
      const user: SessionV1.User = { id: MessageID.ascending(), sessionID: session.id, role: "user", agent: agent.id ?? agent.name,
        model: live.turn?.user.model ?? { providerID: "anthropic", modelID: live.model ?? "" } as SessionV1.User["model"], time: { created: Date.now() } }
      yield* sessions.updateMessage(user)
      yield* sessions.updatePart({ id: PartID.ascending(), sessionID: session.id, messageID: user.id, type: "text",
        text: String(input.prompt ?? ""), synthetic: true })
      return { sessionID: session.id, user, agent }
    })

    /** Approvals Claude Code still asks for: AskUserQuestion opens the question dock, the rest Orchestra's permission. */
    const permit = (live: Live): CanUseTool => (name, toolInput, options) => live.run(Effect.gen(function* () {
      const part = live.turn?.view.tool(options.toolUseID)
      const tool = part ? { messageID: part.messageID, callID: part.callID } : undefined
      if (name === "AskUserQuestion") {
        const asked = ClaudeHostMirror.questions(toolInput)
        const exit = yield* question.ask({ sessionID: live.sessionID, questions: asked, ...(tool ? { tool } : {}) }).pipe(Effect.exit)
        if (Exit.isFailure(exit)) return { behavior: "deny", message: "The owner dismissed this question." } satisfies PermissionResult
        return { behavior: "allow", updatedInput: { ...toolInput,
          answers: Object.fromEntries(asked.map((item, index) => [item.question, (exit.value[index] ?? []).join(", ")])) } } satisfies PermissionResult
      }
      const session = yield* sessions.get(live.sessionID).pipe(Effect.orDie)
      const ruleset = Permission.merge(live.agent.permission, session.permission ?? [])
      const ctx: Tool.Context = { sessionID: live.sessionID, messageID: part?.messageID ?? MessageID.ascending(), callID: part?.callID,
        agent: live.agent.name, agentID: live.agent.id, abort: options.signal, messages: [], metadata: () => Effect.void,
        ask: (request) => permission.ask({ ...request, sessionID: live.sessionID, ...(tool ? { tool } : {}), ruleset }).pipe(Effect.orDie) }
      const exit = yield* asks(name, toolInput, ctx, (command) =>
        ctx.ask({ permission: "bash", patterns: [command], always: ["*"], metadata: { command } })).pipe(Effect.exit)
      return Exit.isSuccess(exit) ? { behavior: "allow", updatedInput: toolInput } satisfies PermissionResult
        : { behavior: "deny", message: ClaudeCodeTools.failure(exit.cause) } satisfies PermissionResult
    }))

    const settle = (live: Live, outcome: Outcome) => {
      const turn = live.turn
      live.turn = undefined
      turn?.waiters.forEach((resolve) => resolve(outcome))
    }
    const idle = (live: Live, ms: number) => {
      clearTimeout(live.idle)
      live.idle = setTimeout(() => {
        if (live.turn || live.background > 0) return idle(live, ms)
        void close(live)
      }, ms)
      live.idle.unref?.()
    }
    // Keep the old owner in the map until BOTH the stream pump and the actual process exit have joined.
    const shutdown = (live: Live) => {
      if (live.closed) return
      live.closed = true
      clearTimeout(live.idle)
      live.inbox.end()
      live.abort.abort()
      if (live.research) void live.run(live.research.close, true).catch(() => {})
      live.query.close()
    }
    const retire = (live: Live) => {
      live.owned?.delete(live)
      if (lives.get(live.sessionID) !== live) return
      ClaudeHostMcp.release(live.sessionID)
      lives.delete(live.sessionID)
    }
    const close = (live: Live): Promise<void> => {
      if (live.closing) return live.closing
      shutdown(live)
      live.closing = (async () => {
        await live.pump
        // A failed spawn has no process to join; the pump retains its error for the waiting turn.
        await live.processJoin().catch(() => undefined)
        while (live.callbacks.size) await Promise.allSettled([...live.callbacks])
        if (!live.stopping) retire(live)
      })()
      return live.closing
    }

    const summarize = (live: Live, turn: Turn) => Effect.forEach(turn.answered,
      (messageID) => summary.summarize({ sessionID: live.sessionID, messageID }), { discard: true })

    /** Applies one frame of the live session. */
    const handle = (live: Live, message: SDKMessage, release: number) => Effect.gen(function* () {
      if (message.type === "system" && message.subtype === "background_tasks_changed") live.background = message.tasks.length
      // The Agent-call join reads these whatever turn they arrive in (spikes S3, S12).
      if (message.type === "system" && message.subtype === "task_started" && message.tool_use_id)
        live.join.taskStarted({ toolUseID: message.tool_use_id, taskID: message.task_id })
      if (message.type === "system" && message.subtype === "task_notification") live.join.taskNotification(message)
      if (live.research) yield* live.research.observe(live.join, message)
      if (live.discard) {
        // Stop closes the query; discarded frames never relinquish its ownership.
        return
      }
      if (message.type === "system" && message.subtype === "init") yield* write(live.sessionID, { sessionId: message.session_id })
      // Claude Code may start a turn on its own, for a background subagent's completion: it answers the latest message.
      if (!live.turn && (message.type === "assistant" || message.type === "stream_event")) {
        const latest = (yield* sessions.messages({ sessionID: live.sessionID }).pipe(Effect.orDie)).findLast((item) => item.info.role === "user")?.info
        const state = yield* read(live.sessionID)
        if (latest?.role === "user")
          live.turn = { view: live.make(latest), user: latest, cost: typeof state.cost === "number" ? state.cost : 0, waiters: [], answered: new Set([latest.id]) }
      }
      const turn = live.turn
      if (!turn) {
        if (message.type === "rate_limit_event") return yield* write(live.sessionID, { rateLimit: message.rate_limit_info })
        // A background subagent's progress and notification after its dispatching turn ended: its card is in `known`.
        if (message.type === "system" && (message.subtype === "task_progress" || message.subtype === "task_updated" ||
          message.subtype === "task_notification")) {
          const callID = message.subtype === "task_notification" ? live.join.notification(message)
            : "tool_use_id" in message && message.tool_use_id ? message.tool_use_id : live.known.tasks.get(message.task_id)
          const owner = callID ? live.known.calls.get(callID) : undefined
          if (owner) yield* owner.on(message)
        }
        return
      }
      if (message.type === "assistant" && !message.parent_tool_use_id && message.error) {
        turn.errorUUID = message.uuid
        turn.error = ClaudeCodeSDK.signedOut(message) ? ClaudeCodeSDK.SIGNED_OUT
          : message.message.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n") || message.error
      }
      if (message.type === "assistant" && message.supersedes?.length) {
        if (turn.errorUUID && message.supersedes.some((uuid) => uuid === turn.errorUUID)) turn.error = undefined
        yield* turn.view.retract(message.supersedes)
      }
      if (message.type === "system" && message.subtype === "model_refusal_fallback" && message.retracted_message_uuids?.length) {
        if (message.retracted_message_uuids.some((uuid) => uuid === turn.errorUUID)) turn.error = undefined
        yield* turn.view.retract(message.retracted_message_uuids)
      }
      const root = !("parent_tool_use_id" in message && message.parent_tool_use_id)
      const submitted = root && message.type === "user" && message.uuid ? live.sends.get(message.uuid) : undefined
      const receipts = root && "user_message_uuids" in message && message.user_message_uuids
        ? message.user_message_uuids : root && "user_message_uuid" in message && message.user_message_uuid ? [message.user_message_uuid] : []
      const previous = turn.view.current()?.parentID ?? turn.user.id
      const chain = live.chain
      // A replayed result cannot reset a producer epoch or charge the same cumulative total again.
      const receipt = message.type === "result" ? `${message.session_id}:${message.uuid}:${message.total_cost_usd}` : undefined
      const replay = !!receipt && live.settledResults.has(receipt)
      yield* turn.view.on(message.type === "result" && replay ? { ...message, total_cost_usd: turn.cost } : message)
      if (live.discard) return
      if (message.type === "system" && message.subtype === "init") yield* write(live.sessionID, { resumeAt: undefined, freshSessionId: undefined })
      const acknowledged = ClaudeHostAdmission.acknowledge(live.inputs, live.sends, receipts, submitted ? message.uuid : undefined)
      acknowledged.forEach((id) => live.delivered.add(id))
      const parent = turn.view.current()?.parentID ?? turn.user.id
      turn.answered.add(parent)
      turn.view.consumed().forEach((user) => turn.answered.add(user.id))
      if (previous !== parent && chain) {
        live.ends[previous] = chain
      }
      if (submitted && chain) live.starts[submitted.id] = chain
      if ((message.type === "assistant" || message.type === "user") && !message.parent_tool_use_id && message.uuid) {
        live.chain = message.uuid
        live.ends[submitted?.id ?? parent] = message.uuid
      }
      if (acknowledged.length || submitted) yield* write(live.sessionID, { ...("session_id" in message && typeof message.session_id === "string" ? { sessionId: message.session_id } : {}), inputs: live.inputs, delivered: [...live.delivered], starts: live.starts, ends: live.ends, chain: live.chain })
      if (message.type !== "result") return
      live.settledResults.add(receipt!)
      idle(live, release)
      yield* write(live.sessionID, { uuids: live.uuids, starts: live.starts, ends: live.ends, chain: live.chain, resumeAt: undefined, settledResults: [...live.settledResults] })
      if (turn.error || message.subtype !== "success" || message.is_error) {
        const detail = message.subtype === "success" && message.is_error ? message.result
          : "errors" in message && message.errors?.length ? message.errors.join("; ") : turn.error ?? message.subtype
        const failed = yield* turn.view.fail({ aborted: false, message: detail })
        if (failed) live.uuids[failed.id] ??= message.uuid
        // fail preserves the real error/abort/tool status; finish allocates SDK cost to that failed reply.
        const { cost } = yield* turn.view.finish(replay ? turn.cost : message.total_cost_usd < turn.cost ? 0 : turn.cost)
        yield* write(live.sessionID, { cost, uuids: live.uuids })
        yield* summarize(live, turn)
        if (live.discard) return
        return settle(live, { ok: false, message: detail })
      }
      const pending = turn.view.pendingInputs()
      // A restarted native producer can reset its cumulative counters. Charge the new epoch from zero.
      const { cost } = yield* turn.view.finish(replay ? turn.cost : message.total_cost_usd < turn.cost ? 0 : turn.cost)
      yield* summarize(live, turn)
      const context = yield* Effect.tryPromise(() => live.query.getContextUsage()).pipe(Effect.option)
      yield* write(live.sessionID, { cost, uuids: live.uuids, starts: live.starts, ends: live.ends, chain: live.chain, resumeAt: undefined, ...(context._tag === "Some"
        ? { context: { totalTokens: context.value.totalTokens, maxTokens: context.value.maxTokens, percentage: context.value.percentage } } : {}) })
      if (live.discard) return
      settle(live, { ok: true })
      // A steer Claude Code did not read before the turn ended starts the next turn: that turn answers it.
      if (pending.length) {
        const user = pending[0].user
        const view = live.make(user)
        live.turn = { view, user, cost, waiters: [], answered: new Set([user.id]) }
        yield* Effect.forEach(pending, (item) => item.uuid ? view.sent(item.user, item.uuid) : view.steer(item.user), { discard: true })
      }
    })

    const launch = (input: { sessionID: SessionID; agent: Agent.Info; user: SessionV1.User; model?: string; state: Record<string, unknown>; revision: number }) => Effect.gen(function* () {
      if (releasing.has(input.sessionID)) return yield* Effect.fail(new Error("Claude Code session is being released"))
      const ownership = yield* InstanceState.get(custody)
      const instance = yield* InstanceState.context
      const env = yield* ClaudeCodeSDK.Environment
      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
      const prepared = overrides.plugin && overrides.mcp ? undefined
        : yield* ClaudeHostMcp.prepare({ agent: input.agent, model: input.user.model, permission: session.permission }).pipe(
          Effect.provide(preparation))
      const release = yield* IdleRelease
      // Retain private layer services and the real filesystem; HTTP callers can supply a noop filesystem.
      // Instance placement and request references still come from the caller.
      const context = Context.add(Context.add(Context.merge(preparation, Context.omit(FileSystem.FileSystem)(yield* Effect.context<never>())),
        ResearchRecords.Service, researchRecords), SessionSubagentModels.Service, subagentModels)
      const abort = new AbortController()
      const fork = ClaudeCodeTranscript.record(input.state.forkFrom) ? input.state.forkFrom : undefined
      const resume = typeof input.state.sessionId === "string" ? { resume: input.state.sessionId,
          ...(typeof input.state.resumeAt === "string" ? { resumeSessionAt: input.state.resumeAt } : {}) }
        : fork && typeof fork.sessionId === "string" ? { resume: fork.sessionId, forkSession: true, sessionId: claudeSessionID(input.sessionID),
            ...(typeof fork.at === "string" ? { resumeSessionAt: fork.at } : {}) }
        : { sessionId: typeof input.state.freshSessionId === "string" ? input.state.freshSessionId : claudeSessionID(input.sessionID) }
      const usage = typeof input.state.sessionId === "string" || typeof fork?.sessionId === "string"
        ? ClaudeCodeTranscript.record(input.state.modelUsage) ? input.state.modelUsage : {} : {}
      const uuids = ClaudeCodeTranscript.record(input.state.uuids) ? input.state.uuids : {}
      const live: Live = {
        sessionID: input.sessionID, inbox: inbox(async (message) => {
          const user = message.uuid ? live.sends.get(message.uuid) : undefined
          if (!user || live.closed) return
          live.inputs[user.id].status = "submitted"
          await live.run(write(live.sessionID, { inputs: live.inputs }))
        }, async (message) => {
          const user = message.uuid ? live.sends.get(message.uuid) : undefined
          if (!user) return
          live.inputs[user.id].status = "pending"
          await live.run(write(live.sessionID, { inputs: live.inputs }), true)
        }), abort, agent: input.agent, seat: input.agent.id ?? input.user.agent, model: input.model, discard: false, background: 0,
        inputs: ClaudeHostAdmission.read(input.state.inputs), queued: new Set(),
        delivered: new Set(Array.isArray(input.state.delivered) ? input.state.delivered.map(String) : []),
        settledResults: new Set(Array.isArray(input.state.settledResults) ? input.state.settledResults.map(String) : []),
        uuids: ClaudeHostBoundary.strings(uuids), starts: ClaudeHostBoundary.strings(input.state.starts), sends: new Map(), ends: ClaudeHostBoundary.strings(input.state.ends),
        chain: typeof input.state.chain === "string" ? input.state.chain : undefined, pump: Promise.resolve(), processJoin: async () => {}, callbacks: new Set(),
        known: { calls: new Map(), tasks: new Map(), usage: new Map(Object.entries(usage) as [string, ModelUsage][]) },
        children: new Map(), join: ClaudeHostJoin.make(),
        query: undefined as unknown as Query,
        run: (effect, teardown) => {
          // Late SDK callbacks are cancelled too; only our reconciliation may run after shutdown.
          const running = Effect.runPromiseWith(context)(effect, { signal: teardown ? undefined : abort.signal })
          live.callbacks.add(running)
          void running.finally(() => live.callbacks.delete(running)).catch(() => {})
          return running
        },
        make: (user) => ClaudeHostMirror.create({ sessionID: input.sessionID, user, agent: input.agent,
          path: { cwd: instance.directory, root: instance.worktree }, sessions, snapshot, todo, status, provider, catalog,
          child: child(live), known: live.known, notification: live.join.notification,
          state: (patch) => write(input.sessionID, patch),
          record: (value) => Effect.sync(() => { if (value.uuid) live.uuids[value.messageID] = value.uuid }) }),
      }
      const ctx: ClaudeHostOptions.Context = { sessionID: input.sessionID, directory: instance.directory, worktree: instance.worktree,
        agent: live.seat, abort }
      const research = yield* ClaudeHostResearch.make.pipe(Effect.provideService(ResearchExecution.Service, researchExecution),
        Effect.provideService(ResearchAllowance.Service, researchAllowance), Effect.provideService(ClaudeHostResearch.NativeStop, ClaudeHostResearch.nativeStop(live)))
      live.research = research
      const bridge = ClaudeHostBridge.create(live, ctx, { sessions, permission, agents, research, withSession: bindings.withSession })
      live.bridge = bridge
      const adapters: ClaudeHostOptions.Adapters = {
        plugin: overrides.plugin ?? (() => ClaudeHostPlugin.build({ seats: prepared?.seats ?? [], tools: prepared?.granted ?? {},
          // SDK-owned definitions stay fixed for this query, unlike hot-reloaded project agent files.
          sdk: Object.fromEntries((prepared?.seats ?? []).map((seat) => [seat.id, {}])),
        })),
        mcp: overrides.mcp ?? ((value) => ClaudeHostMcp.server({ ...value, bridge, tools: prepared?.tools ?? [] })),
        // Orchestra's policy gate and delegation records, on the mirrored parts of this session and its seats.
        hooks: overrides.hooks ?? ((value) => ClaudeHostHooks.create({ ...value, join: live.join, granted: prepared?.granted ?? {}, calls: bridge, research,
          run: live.run as ClaudeHostHooks.Context["run"],
          models: (type, override) => Effect.gen(function* () {
            if (override !== undefined || type === "fork" || !definitions[type]?.model || definitions[type].model === "inherit") return undefined
            // Corroborate our fixed SDK definition using public metadata, without another provider turn.
            const metadata = yield* Effect.tryPromise(() => live.query.initializationResult()).pipe(Effect.option)
            if (metadata._tag === "None") return undefined
            if (metadata.value.agents.filter((entry) => entry.name === type).length !== 1) return undefined
            const entries = yield* Effect.gen(function* () {
              const catalog = yield* Catalog.Service
              return yield* catalog.model.all()
            }).pipe(Effect.provide(locations.get({ directory: AbsolutePath.make(instance.directory), workspaceID: undefined })))
            return selectModel(metadata.value.agents, metadata.value.models, entries, type, override, definitions)
          }),
          parts: { tool: (callID) => live.turn?.view.tool(callID) ?? live.known.calls.get(callID)?.tool(callID),
            author: (callID) => live.turn?.view.author(callID) ?? live.known.calls.get(callID)?.author(callID),
            complete: bridge.complete } })),
      }
      const options = yield* Effect.tryPromise(() => ClaudeHostOptions.build({
        ctx: { ...ctx, join: live.join },
        adapters, model: input.model, session: resume, abortController: abort, canUseTool: permit(live), env,
      }))
      const definitions = Object.freeze(Object.fromEntries(Object.entries(options.agents ?? {}).map(([name, definition]) =>
        [name, Object.freeze({ model: definition.model })])))
      if (releasing.has(input.sessionID) || ownership.disposed || serviceState.disposed) return yield* Effect.fail(new Error("Claude Code host was disposed before startup completed"))
      const lifetime = ClaudeCodeSDK.processLifetime(options)
      live.processJoin = lifetime.join
      live.query = sdk.query({ prompt: live.inbox, options: lifetime.options })
      lives.set(input.sessionID, live)
      ownership.owned.add(live)
      live.owned = ownership.owned
      return yield* Effect.gen(function* () {
        const pump = (async () => {
          const failure = await (async () => {
            for await (const message of live.query) await live.run(handle(live, message, release))
          })().then(() => undefined, (error: unknown) => error)
          live.ended = live.turn?.error ?? (failure instanceof Error ? failure.message : "Claude Code ended the session before the turn finished.")
          // Do not await close from inside the pump: close itself joins this pump.
          shutdown(live)
          if (!live.stopping) settle(live, { ok: false, message: live.ended })
        })()
        live.pump = pump
        void pump.then(() => close(live)).catch(() => {})
        // Sign-in state without a model turn and without secrets (spike S2). Email and organization are never read here.
        // A session whose process never started (a failed spawn) ends instead of answering.
        const account = yield* Effect.tryPromise(() => Promise.race([live.query.accountInfo(), pump.then(() => undefined)])).pipe(Effect.option)
        // No turn waits on this session yet, so its end is this start's failure.
        if (live.closed || live.ended !== undefined) {
          yield* Effect.promise(() => close(live))
          return yield* Effect.fail(new Error(live.ended ?? "Claude Code startup was cancelled"))
        }
        if (account._tag === "Some" && account.value) {
          const signedIn = account.value.tokenSource !== "none" || account.value.apiKeySource !== undefined
          yield* write(input.sessionID, { account: { signedIn, subscriptionType: account.value.subscriptionType, apiProvider: account.value.apiProvider } })
          if (!signedIn) {
            yield* Effect.promise(() => close(live))
            return yield* Effect.fail(new Error(ClaudeCodeSDK.SIGNED_OUT))
          }
        }
        return live
      }).pipe(Effect.onInterrupt(() => Effect.promise(() => close(live))))
    })

    const start = (input: Parameters<typeof launch>[0]) => exclusive(startups, input.sessionID, Effect.gen(function* () {
      if (input.revision !== (revisions.get(input.sessionID) ?? 0)) return yield* Effect.fail(new Error("Claude Code startup ownership was released"))
      const owner = lives.get(input.sessionID)
      if (owner?.closing || owner?.stopping) yield* Effect.promise(() => owner.stopping ?? owner.closing!)
      const existing = lives.get(input.sessionID)
      if (existing && existing.seat === (input.agent.id ?? input.user.agent)) return existing
      if (existing) yield* stop(existing)
      return yield* launch({ ...input, state: yield* read(input.sessionID) })
    }))

    const stop = (live: Live) => Effect.promise(() => {
      live.bridge?.interrupt()
      if (live.stopping) return live.stopping
      const turn = live.turn
      live.discard = true
      live.inbox.end()
      // Query has no public cancel_async_message API. Closing the query is its documented cancellation control;
      // do it synchronously after issuing interrupt, before any still_queued send can start another turn.
      const receipt = live.query.interrupt().catch(() => undefined)
      shutdown(live)
      live.stopping = (async () => {
        const interrupted = await receipt
        await close(live)
        Object.entries(live.inputs).forEach(([id, input]) => {
          if (interrupted?.still_queued?.includes(input.uuid)) {
            input.status = "pending"
            live.delivered.delete(id)
          }
          if (input.status === "submitted") input.status = "uncertain"
        })
        if (interrupted) await live.run(write(live.sessionID, { stoppedQueued: interrupted.still_queued }), true)
        await live.run(write(live.sessionID, { inputs: live.inputs, delivered: [...live.delivered], uuids: live.uuids, starts: live.starts, ends: live.ends, chain: live.chain }), true)
        if (turn) {
          await live.run(turn.view.fail({ aborted: true, message: "The owner stopped the turn." }), true)
          await live.run(summarize(live, turn), true)
        }
      })().finally(() => {
        settle(live, { ok: false, aborted: true, message: "The owner stopped the turn." })
        retire(live)
      })
      return live.stopping
    })

    const turn: Interface["turn"] = Effect.fn("ClaudeHost.turn")(function* (input) {
      const { sessionID } = input
      const requestedRevision = revisions.get(sessionID) ?? 0
      if (releasing.has(sessionID)) return yield* Effect.die(new Error("Claude Code session is being released"))
      const agent = yield* agents.get(input.user.agent).pipe(Effect.orElseSucceed(() => undefined))
      if (agent?.engine !== "claude-code") return false
      const instance = yield* InstanceState.context
      const owned = lives.get(sessionID)
      if (owned?.stopping || owned?.closing) yield* Effect.promise(() => owned.stopping ?? owned.closing!)
      if (owned?.closed) yield* Effect.promise(() => close(owned))
      const seatOwner = lives.get(sessionID)
      if (seatOwner && seatOwner.seat !== (agent.id ?? input.user.agent)) yield* stop(seatOwner)
      const session = yield* sessions.get(sessionID).pipe(Effect.orDie)
      yield* reconcileRevert(session)
      const revision = session.revert ? revisions.get(sessionID) ?? 0 : requestedRevision
      const history = yield* sessions.messages({ sessionID }).pipe(Effect.orDie)
      const state = yield* read(sessionID)
      const inputs = ClaudeHostAdmission.read(state.inputs)
      const historic = new Set(answered(history).filter((id) => !inputs[id]))
      const delivered = new Set(Array.isArray(state.delivered) ? state.delivered.map(String) : [])
      const users = history.filter((message) => (RequestSource.actual(message) ||
        message.parts.some((part) => marker(part)?.type === "task-return")) && !delivered.has(message.info.id) && !historic.has(message.info.id))
      const prompts = users.flatMap((message) => message.info.role === "user" ? [{ user: message.info, text: ClaudeCodeTranscript.hostPrompt([message]) }] : []).filter((item) => item.text)
      const prompt = prompts.map((item) => item.text).join("\n")
      const model = input.user.model.providerID === "anthropic" ? input.user.model.modelID : undefined
      const existing = lives.get(sessionID)
      // Already handed over (a steer Claude Code answers in its own next turn): wait for that turn.
      const view = existing?.turn && !prompt ? existing.turn.view
        : ClaudeHostMirror.create({ sessionID, user: input.user, agent, path: { cwd: instance.directory, root: instance.worktree },
            sessions, snapshot, todo, status, provider, catalog })
      if (!prompt && !existing?.turn) {
        if (delivered.has(input.user.id)) {
          if (!history.some((message) => message.info.role === "assistant" && message.info.parentID === input.user.id && message.info.time.completed))
            yield* view.fail({ aborted: true, message: "The delivered turn was interrupted." })
          return true
        }
        yield* view.fail({ aborted: false, message: "Claude Code receives text only; this message has no text." })
        return true
      }
      // A settled/ended query's queued set is not a native receipt and cannot authorize retrying a submitted input.
      const unresolved = prompts.find((item) => inputs[item.user.id] && inputs[item.user.id].status !== "pending" &&
        (!existing?.turn || existing.closed || !existing.queued.has(item.user.id)))
      if (unresolved) {
        yield* view.fail({ aborted: false, message: `Claude Code input submission is unresolved for ${unresolved.user.id}` })
        return true
      }
      prompts.forEach((item) => { inputs[item.user.id] ??= { uuid: crypto.randomUUID(), status: "pending" } })
      if (existing) prompts.forEach((item) => { existing.inputs[item.user.id] ??= inputs[item.user.id] })
      if (prompts.length) yield* write(sessionID, { inputs: existing?.inputs ?? inputs })
      if (prompt && typeof state.sessionId !== "string") yield* sessions.setTitle({ sessionID, title: prompt.split("\n")[0].slice(0, 80) })
      const started = existing ? Exit.succeed(existing) : yield* start({ sessionID, agent, user: input.user, model, state, revision }).pipe(Effect.exit)
      if (Exit.isFailure(started)) {
        if (revision !== (revisions.get(sessionID) ?? 0)) return true
        yield* view.fail({ aborted: false, message: ClaudeCodeTools.failure(started.cause) })
        return true
      }
      const host = started.value
      clearTimeout(host.idle)
      if (model && model !== host.model) yield* setModel({ sessionID, model })
      const running = host.turn
      const turn = running ?? { view: host.make(input.user), user: input.user, cost: typeof state.cost === "number" ? state.cost : 0, waiters: [], answered: new Set([input.user.id]) }
      host.turn = turn
      if (!running) host.bridge?.resume()
      const outcome = new Promise<Outcome>((resolve) => turn.waiters.push(resolve))
      if (host.ended !== undefined) settle(host, { ok: false, message: host.ended })
      if (prompt) yield* Effect.forEach(prompts, (item) => send(host, turn.view, item.user, item.text, running ? "next" : undefined), { discard: true })
      const result = yield* Effect.promise(() => outcome).pipe(Effect.onInterrupt(() => stop(host)))
      if (!result.ok && revision === (revisions.get(sessionID) ?? 0)) yield* turn.view.fail({ aborted: result.aborted === true, message: result.message })
      return true
    })

    const steer: Interface["steer"] = Effect.fn("ClaudeHost.steer")(function* (input) {
      const live = lives.get(input.sessionID)
      const prompt = ClaudeCodeTranscript.hostPrompt([input.user])
      if (!live || live.stopping || live.closing || !prompt || input.user.info.role !== "user") return false
      const agent = yield* agents.get(input.user.info.agent)
      if ((agent?.id ?? input.user.info.agent) !== live.seat) {
        yield* stop(live)
        return false
      }
      // Bind the UUID before model control, but enqueue only after the control succeeds.
      const identity = live.inputs[input.user.info.id] ?? { uuid: crypto.randomUUID(), status: "pending" as const }
      live.inputs[input.user.info.id] = identity
      yield* write(input.sessionID, { inputs: live.inputs })
      if (!live.turn) return false
      if ("model" in input) yield* setModel({ sessionID: input.sessionID, model: input.model })
      if (!live.turn || live.closed || live.stopping || live.closing) return false
      yield* send(live, live.turn.view, input.user.info, prompt, "next")
      return true
    })

    const interrupt: Interface["interrupt"] = (sessionID) => Effect.suspend(() => {
      // Child task Stop also cancels its Orchestra calls, independently of the SDK task's receipt.
      lives.forEach((owner) => owner.bridge?.interrupt(sessionID))
      const live = lives.get(sessionID)
      const owners = [...lives.values()].flatMap((candidate) => [...new Map([...candidate.children, ...candidate.join.children()])]
        .flatMap(([callID, child]) => child === sessionID ? [{ live: candidate, callID }] : []))
      return Effect.forEach([...(live ? [stop(live)] : []), ...owners.map((owner) => Effect.gen(function* () {
        // A hook can publish the child before task_started reaches the pump. Keep the Stop until the join arrives.
        for (let round = 0; round < 500; round++) {
          const joined = owner.live.join.get(owner.callID)
          if (owner.live.closed || joined?.hold) return
          const taskID = joined?.taskID
          if (taskID) return yield* Effect.promise(() => owner.live.query.stopTask(taskID))
          yield* Effect.sleep("20 millis")
        }
        return yield* Effect.die(new Error(`Claude Code has no native task id for child ${sessionID}`))
      }))], (effect) => effect, { concurrency: "unbounded", discard: true })
    })

    const setModel: Interface["setModel"] = (input) => Effect.gen(function* () {
      const live = lives.get(input.sessionID)
      if (!live || live.closing || live.stopping) return
      if (live.model === input.model) return
      yield* Effect.promise(() => live.query.setModel(input.model)).pipe(
        Effect.catchCause((cause) => live.stopping || live.closing ? Effect.void : Effect.failCause(cause)))
      live.model = input.model
    })

    const fork: Interface["fork"] = (input) => Effect.gen(function* () {
      const source = yield* sessions.get(input.from).pipe(Effect.orDie)
      if (!source.metadata?.claudeCode) return undefined
      if (!input.ids) return yield* Effect.die(new ClaudeHostBoundary.UnprovableNativeLineage("NATIVE_FORK_MAP_UNAVAILABLE"))
      const native = ClaudeHostBoundary.fork(source,
        yield* sessions.messages({ sessionID: source.id }).pipe(Effect.orDie), yield* read(source.id), input.ids, input.messageID)
      if (input.sessionID) yield* write(input.sessionID, native)
      return { ...source.metadata, claudeCode: native }
    })
    const release: Interface["release"] = (sessionID) => Effect.gen(function* () {
      // Startup may hold the semaphore while waiting for an account control. Cancel its acquired owner first.
      releasing.add(sessionID)
      revisions.set(sessionID, (revisions.get(sessionID) ?? 0) + 1)
      const acquired = lives.get(sessionID)
      if (acquired) yield* stop(acquired)
      return yield* exclusive(startups, sessionID, Effect.gen(function* () {
        const live = lives.get(sessionID)
        if (!live) return yield* interrupt(sessionID)
        if (live.turn && !live.stopping) return yield* stop(live)
        yield* Effect.promise(() => live.stopping ?? close(live))
      }))
    }).pipe(Effect.ensuring(Effect.sync(() => releasing.delete(sessionID))))
    const reconcileRevert: Interface["reconcileRevert"] = (session) => Effect.gen(function* () {
      if (!session.revert || !session.metadata?.claudeCode) return
      const state = yield* read(session.id)
      const history = yield* sessions.messages({ sessionID: session.id }).pipe(Effect.orDie)
      const patch = ClaudeHostBoundary.revert(session, history, state)
      yield* release(session.id)
      yield* write(session.id, patch)
    })

    yield* lifecycle.register({ remove: release,
      fork: (input) => fork({ from: input.source.id, messageID: input.messageID, ids: input.ids }) })
    // Instance disposal joins its owners as well as layer disposal. The captured run context stays alive until then.
    const custody = yield* InstanceState.make(() => Effect.gen(function* () {
      const ownership = { owned: new Set<Live>(), disposed: false }
      yield* Effect.addFinalizer(() => Effect.sync(() => { ownership.disposed = true }).pipe(
        Effect.andThen(Effect.forEach(ownership.owned, (live) => release(live.sessionID), { concurrency: "unbounded", discard: true }))))
      return ownership
    }))
    yield* Effect.addFinalizer(() => Effect.sync(() => { serviceState.disposed = true }).pipe(
      Effect.andThen(Effect.forEach([...lives.keys()], release, { concurrency: "unbounded", discard: true }))))

    return Service.of({ turn, steer, interrupt, setModel, fork, release, reconcileRevert })
  }),
)

/** The child session an Agent part names, as the delegation hooks or this host recorded it. */
function childOf(part: SessionV1.ToolPart) {
  const id = part.state.status === "pending" ? undefined : part.state.metadata?.sessionId ?? part.metadata?.sessionId
  return typeof id === "string" ? SessionID.make(id) : undefined
}

/** Users a session answered before it had a delivery cursor, such as turns run on Orchestra's loop. */
function answered(history: readonly SessionV1.WithParts[]) {
  const last = Math.max(-1, ...history.flatMap((message) => {
    if (message.info.role !== "assistant" || message.info.time.completed === undefined || message.info.error) return []
    const parent = message.info.parentID
    return [history.findIndex((user) => user.info.role === "user" && user.info.id === parent)]
  }))
  return history.slice(0, last + 1).flatMap((message) => message.info.role === "user" ? [message.info.id] : [])
}

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [ResearchExecution.node, ResearchAllowance.node, ResearchRecords.node, SessionSubagentModels.node, SessionLifecycle.node, SessionSummary.node, Agent.node, Session.node, Snapshot.node, Permission.node, Question.node, Todo.node, SessionStatus.node, ClaudeCodeSDK.node,
    ToolRegistry.node, Config.node, BackgroundProcess.node, FSUtil.node, CrossSpawnSpawner.node, Truncate.node, Provider.node, ModelsDev.node,
    AppProcess.node, Database.node, LocationServiceMap.node, ArsenalObservations.node, EventV2Bridge.node, Git.node, InstanceStore.node, Archive.node, filesystem],
})

/** SDK aliases are not catalog ids. Missing/ambiguous mappings stay unknown to the canonical guard. */
export function selectModel(agents: readonly AgentInfo[], sdkModels: readonly ModelInfo[], catalog: readonly ModelV2.Info[],
  type: string, override: unknown, definitions?: Readonly<Record<string, Pick<AgentDefinition, "model">>>): ClaudeHostDelegation.ModelSelection | undefined {
  const agent = agents.filter((entry) => entry.name === type)
  if (agent.length !== 1) return undefined
  // Family aliases can reuse a different parent version. Project definitions can hot-reload;
  // neither cached initialization rows nor a literal "inherit" prove the effective model.
  if (override !== undefined || type === "fork") return undefined
  const selected = definitions?.[type]?.model
  if (!selected || selected === "inherit" || agent[0].model !== selected) return undefined
  const mappings = [...new Set(sdkModels.filter((entry) => entry.resolvedModel === selected)
    .flatMap((entry) => entry.resolvedModel ? [entry.resolvedModel] : []))]
  const model = mappings.length === 1 ? mappings[0] : undefined
  if (!model) return undefined
  const matching = catalog.filter((entry) => entry.providerID === "anthropic" && entry.api.id === model)
  if (matching.length !== 1) return undefined
  return { model, ref: ModelV2.Ref.make({ providerID: matching[0].providerID, id: matching[0].id }) }
}

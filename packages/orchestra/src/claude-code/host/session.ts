export * as ClaudeHost from "./session"

// Claude Code as the host of an Orchestra session (meta-harness PLAN.md §4.1). One long-lived SDK `query()` per active
// session, fed by one streaming input that stays open while the session lives:
// - a turn sends the owner's undelivered messages and waits for Claude Code's `result`; Claude Code owns the loop;
// - a steer goes into the same input with `priority: "next"`, so Claude Code reads it once the running tools finish;
//   a queued message is simply left for the next turn;
// - Stop is `interrupt()`, the model picker is `setModel()`;
// - Claude Code's session id is derived 1:1 from the Orchestra session id, so resume and fork use the SDK's own
//   `resume` / `forkSession` and need no transcript store;
// - an idle session releases its process; the next turn resumes it.
// The entry mirrors claude-code/engine.ts `turn`, so the engine can hand a turn to this host with a small diff.
import { createHash } from "node:crypto"
import { Context, Effect, Exit, Layer } from "effect"
import type { CanUseTool, PermissionResult, Query, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { LayerNode } from "@orchestra/core/effect/layer-node"
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
import { InstanceState } from "@/effect/instance-state"
import { Permission } from "@/permission"
import { Question } from "@/question"
import { marker } from "@/continuity/alias"
import { RequestSource } from "@/continuity/request-source"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
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
import { ClaudeHostJoin } from "./join"
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
  readonly steer: (input: { sessionID: SessionID; user: SessionV1.WithParts }) => Effect.Effect<boolean>
  /** Stop the running turn. Idle or unknown sessions are a no-op. */
  readonly interrupt: (sessionID: SessionID) => Effect.Effect<void>
  /** The model picker: switch the live session's model. */
  readonly setModel: (input: { sessionID: SessionID; model?: string }) => Effect.Effect<void>
  /** `sessionID` was forked from `from` (at `messageID`): its first turn forks Claude Code's session too. */
  readonly fork: (input: { sessionID: SessionID; from: SessionID; messageID?: MessageID }) => Effect.Effect<void>
  /** Release the session's Claude Code process now. */
  readonly release: (sessionID: SessionID) => Effect.Effect<void>
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

/** One SDK input message. The uuid comes back on Claude Code's replies. */
export function userInput(prompt: string, priority?: "next"): SDKUserMessage {
  return { type: "user", message: { role: "user", content: prompt }, parent_tool_use_id: null, uuid: crypto.randomUUID(),
    ...(priority ? { priority } : {}) }
}

/** The streaming input of one live session: open until the session is released. */
export function inbox() {
  const queue: SDKUserMessage[] = []
  const state: { closed: boolean; wake?: () => void } = { closed: false }
  return {
    push: (message: SDKUserMessage) => {
      queue.push(message)
      state.wake?.()
    },
    end: () => {
      state.closed = true
      state.wake?.()
    },
    async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
      while (true) {
        const next = queue.shift()
        if (next) {
          yield next
          continue
        }
        if (state.closed) return
        await new Promise<void>((resolve) => { state.wake = resolve })
        state.wake = undefined
      }
    },
  }
}

type Outcome = { ok: true } | { ok: false; aborted?: boolean; message: string }
type Turn = { view: ClaudeHostMirror.Mirror; user: SessionV1.User; cost: number; waiters: ((outcome: Outcome) => void)[] }
type Live = {
  sessionID: SessionID
  query: Query
  bridge?: ReturnType<typeof ClaudeHostBridge.create>
  inbox: ReturnType<typeof inbox>
  abort: AbortController
  agent: Agent.Info
  model?: string
  turn?: Turn
  /** Frames of a stopped turn still arrive until its result; they are dropped. */
  discard: boolean
  background: number
  uuids: Record<string, string>
  known: { calls: Map<string, ClaudeHostMirror.Mirror>; tasks: Map<string, string> }
  /** The child session of each subagent run, by its Agent `tool_use_id`. */
  children: Map<string, SessionID>
  /** The Agent-call identity join the hooks share with this stream consumer (spikes S3, S12). */
  join: ClaudeHostJoin.Join
  idle?: ReturnType<typeof setTimeout>
  /** Why the session's stream ended, once it has. */
  ended?: string
  make: (user: SessionV1.User) => ClaudeHostMirror.Mirror
  run: <A>(effect: Effect.Effect<A, unknown>) => Promise<A>
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bindings = yield* ArsenalBindings.make
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const snapshot = yield* Snapshot.Service
    const permission = yield* Permission.Service
    const question = yield* Question.Service
    const todo = yield* Todo.Service
    const status = yield* SessionStatus.Service
    const sdk = yield* ClaudeCodeSDK.Service
    // What resolving the served registry tools needs (ClaudeHostMcp.prepare: registry, config, the process tool).
    const preparation = yield* Effect.context<Effect.Services<ReturnType<typeof ClaudeHostMcp.prepare>>>()
    const lives = new Map<SessionID, Live>()

    const read = (sessionID: SessionID) => sessions.get(sessionID).pipe(Effect.orDie, Effect.map((session) => {
      const value = session.metadata?.claudeCode
      return ClaudeCodeTranscript.record(value) ? value : {}
    }))
    const write = (sessionID: SessionID, value: Record<string, unknown>) => Effect.gen(function* () {
      const latest = (yield* sessions.get(sessionID).pipe(Effect.orDie)).metadata ?? {}
      yield* sessions.setMetadata({ sessionID, metadata: { ...latest,
        claudeCode: { ...(ClaudeCodeTranscript.record(latest.claudeCode) ? latest.claudeCode : {}), ...value } } })
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
        if (owner && current?.state.status === "running")
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
        close(live)
      }, ms)
      live.idle.unref?.()
    }
    const close = (live: Live) => {
      clearTimeout(live.idle)
      if (lives.get(live.sessionID) === live) lives.delete(live.sessionID)
      ClaudeHostMcp.release(live.sessionID)
      live.inbox.end()
      live.abort.abort()
      live.query.close()
    }

    /** Applies one frame of the live session. */
    const handle = (live: Live, message: SDKMessage, release: number) => Effect.gen(function* () {
      if (message.type === "system" && message.subtype === "background_tasks_changed") live.background = message.tasks.length
      // The Agent-call join reads these whatever turn they arrive in (spikes S3, S12).
      if (message.type === "system" && message.subtype === "task_started" && message.tool_use_id)
        live.join.taskStarted({ toolUseID: message.tool_use_id, taskID: message.task_id })
      if (message.type === "system" && message.subtype === "task_notification") live.join.taskNotification(message)
      if (live.discard) {
        if (message.type === "result") live.discard = false
        return
      }
      // Claude Code may start a turn on its own, for a background subagent's completion: it answers the latest message.
      if (!live.turn && (message.type === "assistant" || message.type === "stream_event")) {
        const latest = (yield* sessions.messages({ sessionID: live.sessionID }).pipe(Effect.orDie)).findLast((item) => item.info.role === "user")?.info
        const state = yield* read(live.sessionID)
        if (latest?.role === "user")
          live.turn = { view: live.make(latest), user: latest, cost: typeof state.cost === "number" ? state.cost : 0, waiters: [] }
      }
      const turn = live.turn
      if (!turn) {
        if (message.type === "rate_limit_event") return yield* write(live.sessionID, { rateLimit: message.rate_limit_info })
        // A background subagent's progress and notification after its dispatching turn ended: its card is in `known`.
        if (message.type === "system" && (message.subtype === "task_progress" || message.subtype === "task_updated" ||
          message.subtype === "task_notification")) {
          const callID = "tool_use_id" in message && message.tool_use_id ? message.tool_use_id : live.known.tasks.get(message.task_id)
          const owner = callID ? live.known.calls.get(callID) : undefined
          if (owner) yield* owner.on(message)
        }
        return
      }
      if (ClaudeCodeSDK.signedOut(message)) {
        live.discard = true
        return settle(live, { ok: false, message: ClaudeCodeSDK.SIGNED_OUT })
      }
      if (message.type === "assistant" && message.supersedes?.length) yield* turn.view.retract(message.supersedes)
      if (message.type === "system" && message.subtype === "model_refusal_fallback" && message.retracted_message_uuids?.length)
        yield* turn.view.retract(message.retracted_message_uuids)
      yield* turn.view.on(message)
      if (message.type !== "result") return
      idle(live, release)
      if (message.subtype !== "success" || message.is_error) {
        const detail = "errors" in message && message.errors?.length ? message.errors.join("; ") : message.subtype
        return settle(live, { ok: false, message: ClaudeCodeSDK.billingRejection(detail) ?? `Claude Code turn failed: ${detail}` })
      }
      const pending = turn.view.pending()
      const { cost } = yield* turn.view.finish(turn.cost)
      const context = yield* Effect.tryPromise(() => live.query.getContextUsage()).pipe(Effect.option)
      yield* write(live.sessionID, { cost, uuids: live.uuids, ...(context._tag === "Some"
        ? { context: { totalTokens: context.value.totalTokens, maxTokens: context.value.maxTokens, percentage: context.value.percentage } } : {}) })
      settle(live, { ok: true })
      // A steer Claude Code did not read before the turn ended starts the next turn: that turn answers it.
      if (pending) live.turn = { view: live.make(pending), user: pending, cost, waiters: [] }
    })

    const start = (input: { sessionID: SessionID; agent: Agent.Info; user: SessionV1.User; model?: string; state: Record<string, unknown> }) => Effect.gen(function* () {
      const instance = yield* InstanceState.context
      const overrides = yield* Adapters
      const env = yield* ClaudeCodeSDK.Environment
      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
      // The registry tools of Maestro and every seat, resolved once per live session (agent PLUGIN's prepare).
      const prepared = overrides.plugin && overrides.mcp ? undefined
        : yield* ClaudeHostMcp.prepare({ agent: input.agent, model: input.user.model, permission: session.permission }).pipe(
          Effect.provide(preparation))
      const release = yield* IdleRelease
      const context = yield* Effect.context<never>()
      const abort = new AbortController()
      const fork = ClaudeCodeTranscript.record(input.state.forkFrom) ? input.state.forkFrom : undefined
      const resume = typeof input.state.sessionId === "string" ? { resume: input.state.sessionId }
        : fork && typeof fork.sessionId === "string" ? { resume: fork.sessionId, forkSession: true, sessionId: claudeSessionID(input.sessionID),
            ...(typeof fork.at === "string" ? { resumeSessionAt: fork.at } : {}) }
        : { sessionId: claudeSessionID(input.sessionID) }
      const uuids = ClaudeCodeTranscript.record(input.state.uuids) ? input.state.uuids : {}
      const live: Live = {
        sessionID: input.sessionID, inbox: inbox(), abort, agent: input.agent, model: input.model, discard: false, background: 0,
        uuids: Object.fromEntries(Object.entries(uuids).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : [])),
        known: { calls: new Map(), tasks: new Map() }, children: new Map(), join: ClaudeHostJoin.make(),
        query: undefined as unknown as Query,
        run: (effect) => Effect.runPromiseWith(context)(effect),
        make: (user) => ClaudeHostMirror.create({ sessionID: input.sessionID, user, agent: input.agent,
          path: { cwd: instance.directory, root: instance.worktree }, sessions, snapshot, todo, status, child: child(live), known: live.known,
          state: (patch) => write(input.sessionID, patch),
          record: (value) => Effect.sync(() => { if (value.uuid) live.uuids[value.messageID] = value.uuid }) }),
      }
      const ctx: ClaudeHostOptions.Context = { sessionID: input.sessionID, directory: instance.directory, worktree: instance.worktree,
        agent: input.agent.id ?? input.agent.name, abort }
      const bridge = ClaudeHostBridge.create(live, ctx, { sessions, permission, agents, withSession: bindings.withSession })
      live.bridge = bridge
      const adapters: ClaudeHostOptions.Adapters = {
        plugin: overrides.plugin ?? (() => ClaudeHostPlugin.build({ seats: prepared?.seats ?? [], tools: prepared?.granted ?? {} })),
        mcp: overrides.mcp ?? ((value) => ClaudeHostMcp.server({ ...value, bridge, tools: prepared?.tools ?? [] })),
        // Orchestra's policy gate and delegation records, on the mirrored parts of this session and its seats.
        hooks: overrides.hooks ?? ((value) => ClaudeHostHooks.create({ ...value, join: live.join, granted: prepared?.granted ?? {}, calls: bridge,
          // The hooks' effects need only what this session's context provides.
          run: live.run as ClaudeHostHooks.Context["run"],
          parts: { tool: (callID) => live.turn?.view.tool(callID) ?? live.known.calls.get(callID)?.tool(callID),
            complete: bridge.complete } })),
      }
      const options = yield* Effect.tryPromise(() => ClaudeHostOptions.build({
        ctx: { ...ctx, join: live.join },
        adapters, model: input.model, session: resume, abortController: abort, canUseTool: permit(live), env,
      }))
      live.query = sdk.query({ prompt: live.inbox, options: ClaudeCodeSDK.processLifetime(options).options })
      lives.set(input.sessionID, live)
      const pump = (async () => {
        const failure = await (async () => {
          for await (const message of live.query) await live.run(handle(live, message, release))
        })().then(() => undefined, (error: unknown) => error)
        live.ended = failure instanceof Error ? failure.message : "Claude Code ended the session before the turn finished."
        close(live)
        settle(live, { ok: false, message: live.ended })
      })()
      // Sign-in state without a model turn and without secrets (spike S2). Email and organization are never read here.
      // A session whose process never started (the plan-approval lock, a failed spawn) ends instead of answering.
      const account = yield* Effect.tryPromise(() => Promise.race([live.query.accountInfo(), pump.then(() => undefined)])).pipe(Effect.option)
      // No turn waits on this session yet, so its end is this start's failure.
      if (live.ended !== undefined) return yield* Effect.fail(new Error(live.ended))
      if (account._tag === "Some" && account.value) {
        const signedIn = account.value.tokenSource !== "none" || account.value.apiKeySource !== undefined
        yield* write(input.sessionID, { account: { signedIn, subscriptionType: account.value.subscriptionType, apiProvider: account.value.apiProvider } })
        if (!signedIn) {
          close(live)
          yield* Effect.promise(() => pump)
          return yield* Effect.fail(new Error(ClaudeCodeSDK.SIGNED_OUT))
        }
      }
      return live
    })

    const stop = (live: Live) => Effect.gen(function* () {
      live.bridge?.interrupt()
      if (!live.turn) return
      live.discard = true
      const turn = live.turn
      settle(live, { ok: false, aborted: true, message: "The owner stopped the turn." })
      yield* Effect.promise(() => live.query.interrupt().catch(() => undefined))
      yield* turn.view.fail({ aborted: true, message: "The owner stopped the turn." })
    })

    const turn: Interface["turn"] = Effect.fn("ClaudeHost.turn")(function* (input) {
      const { sessionID } = input
      const agent = yield* agents.get(input.user.agent).pipe(Effect.orElseSucceed(() => undefined))
      if (agent?.engine !== "claude-code") return false
      const instance = yield* InstanceState.context
      const history = yield* sessions.messages({ sessionID }).pipe(Effect.orDie)
      const state = yield* read(sessionID)
      const delivered = new Set(Array.isArray(state.delivered) ? state.delivered.map(String) : answered(history))
      const users = history.filter((message) => (RequestSource.actual(message) ||
        message.parts.some((part) => marker(part)?.type === "task-return")) && !delivered.has(message.info.id))
      const prompt = ClaudeCodeTranscript.hostPrompt(users)
      const model = input.user.model.providerID === "anthropic" ? input.user.model.modelID : undefined
      const existing = lives.get(sessionID)
      // Already handed over (a steer Claude Code answers in its own next turn): wait for that turn.
      const view = existing?.turn && !prompt ? existing.turn.view
        : ClaudeHostMirror.create({ sessionID, user: input.user, agent, path: { cwd: instance.directory, root: instance.worktree },
            sessions, snapshot, todo, status })
      if (!prompt && !existing?.turn) {
        yield* view.fail({ aborted: false, message: "Claude Code receives text only; this message has no text." })
        return true
      }
      if (prompt && typeof state.sessionId !== "string") yield* sessions.setTitle({ sessionID, title: prompt.split("\n")[0].slice(0, 80) })
      const started = existing ? Exit.succeed(existing) : yield* start({ sessionID, agent, user: input.user, model, state }).pipe(Effect.exit)
      if (Exit.isFailure(started)) {
        yield* view.fail({ aborted: false, message: ClaudeCodeTools.failure(started.cause) })
        return true
      }
      const host = started.value
      clearTimeout(host.idle)
      if (model && model !== host.model) {
        host.model = model
        yield* Effect.promise(() => host.query.setModel(model).catch(() => undefined))
      }
      // A turn Claude Code started on its own is still running: this message steers it, and this turn waits for it.
      const running = host.turn
      if (running && prompt) yield* running.view.steer(input.user)
      const turn = running ?? { view: host.make(input.user), user: input.user, cost: typeof state.cost === "number" ? state.cost : 0, waiters: [] }
      host.turn = turn
      if (!running) host.bridge?.resume()
      const outcome = new Promise<Outcome>((resolve) => turn.waiters.push(resolve))
      // The session's stream may have ended while this turn was being set up: nothing would answer it.
      if (host.ended !== undefined) settle(host, { ok: false, message: host.ended })
      if (prompt) host.inbox.push(userInput(prompt, running ? "next" : undefined))
      if (prompt) yield* write(sessionID, { delivered: [...delivered, ...users.map((message) => message.info.id)] })
      const result = yield* Effect.promise(() => outcome).pipe(Effect.onInterrupt(() => stop(host)))
      if (!result.ok) yield* turn.view.fail({ aborted: result.aborted === true, message: result.message })
      return true
    })

    const steer: Interface["steer"] = Effect.fn("ClaudeHost.steer")(function* (input) {
      const live = lives.get(input.sessionID)
      const prompt = ClaudeCodeTranscript.hostPrompt([input.user])
      if (!live?.turn || !prompt || input.user.info.role !== "user") return false
      live.inbox.push(userInput(prompt, "next"))
      yield* live.turn.view.steer(input.user.info)
      const state = yield* read(input.sessionID)
      yield* write(input.sessionID, { delivered: [...(Array.isArray(state.delivered) ? state.delivered : []), input.user.info.id] })
      return true
    })

    const interrupt: Interface["interrupt"] = (sessionID) => Effect.suspend(() => {
      // Child task Stop also cancels its Orchestra calls, independently of the SDK task's receipt.
      lives.forEach((owner) => owner.bridge?.interrupt(sessionID))
      const live = lives.get(sessionID)
      return live ? stop(live) : Effect.void
    })

    const setModel: Interface["setModel"] = (input) => Effect.gen(function* () {
      const live = lives.get(input.sessionID)
      if (!live) return
      live.model = input.model
      yield* Effect.promise(() => live.query.setModel(input.model).catch(() => undefined))
    })

    const fork: Interface["fork"] = (input) => Effect.gen(function* () {
      const from = yield* read(input.from)
      const uuids = ClaudeCodeTranscript.record(from.uuids) ? from.uuids : {}
      const at = input.messageID ? uuids[input.messageID] : undefined
      yield* write(input.sessionID, { forkFrom: { sessionId: typeof from.sessionId === "string" ? from.sessionId : claudeSessionID(input.from),
        ...(typeof at === "string" ? { at } : {}) }, sessionId: undefined, delivered: undefined, cost: 0 })
    })

    const release: Interface["release"] = (sessionID) => Effect.sync(() => {
      const live = lives.get(sessionID)
      if (live) close(live)
    })

    return Service.of({ turn, steer, interrupt, setModel, fork, release })
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
  deps: [Agent.node, Session.node, Snapshot.node, Permission.node, Question.node, Todo.node, SessionStatus.node, ClaudeCodeSDK.node,
    ToolRegistry.node, Config.node, BackgroundProcess.node, FSUtil.node, CrossSpawnSpawner.node, Truncate.node,
    AppProcess.node, Database.node, LocationServiceMap.node, ArsenalObservations.node, EventV2Bridge.node, Git.node, InstanceStore.node],
})

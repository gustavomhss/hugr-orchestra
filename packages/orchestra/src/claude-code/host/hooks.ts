export * as ClaudeHostHooks from "./hooks"

// The SDK `hooks` option of one Claude Code host session: in-process callbacks, never plugin shell hooks, so every
// record they write comes from inside Orchestra's process.
// - PreToolUse: the policy gate (gate.ts) for every call, then the Agent dispatch record (delegation.ts) and Jimmy's
//   per-call allowance charge. Any failure here is a deny.
// - PostToolUse: output inspection, the native safety evidence, Jimmy's provenance and byte charges, and the Agent
//   settlement record.
// - SubagentStop: the subagent's last text (a background run's author, recorded only once it is delivered).
// - The join's `task_notification` frames (join.ts, fed by HOST's stream consumer): background deliveries.
// - SessionStart(compact): owned retained memory and honestly labelled query-local state, with no model call.
// - PostCompact: Claude Code's summary archived for `context_recall`.
import { Effect, Exit, Option } from "effect"
import type { HookCallback, HookCallbackMatcher, HookEvent, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import type { SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { ClaudeCodeTools } from "../tools"
import { ClaudeHostDelegation } from "./delegation"
import { ClaudeHostGate } from "./gate"
import type { ClaudeHostJoin } from "./join"
import { ClaudeHostMcp } from "./mcp"
import { ClaudeHostMemory } from "./memory"

/**
 * What HOST hands the hooks. `run`, `join` and the optional ports are HOOKS additions to the brief's base fields:
 * - `run` runs an Orchestra effect with the engine's services and instance placement, as the engine's own `run` does;
 * - `join` is the session's identity registry (ClaudeHostJoin.make()); HOST's stream consumer feeds it `task_started`
 *   and `task_notification`, and reads `join.child(toolUseID)` to mirror a subagent's frames into its child Session;
 * - `parts` is the mirror's part API, so records land on the mirrored parts and a later stream frame cannot overwrite them;
 * - `granted` is `ClaudeHostMcp.prepare().granted`: the Orchestra tools each seat may call through the shared server;
 * - `research` is the discovery dispatch's native allowance port (required before dispatch);
 * - `policy` replaces the live gate checks (tests only).
 */
export type Context = {
  readonly sessionID: SessionID
  readonly directory: string
  readonly worktree: string
  /** The main conversation's seat id (Maestro). */
  readonly agent: string
  readonly abort: AbortController
  readonly run: <A, R>(effect: Effect.Effect<A, unknown, R>, teardown?: boolean) => Promise<A>
  readonly join: ClaudeHostJoin.Join
  readonly parts?: ClaudeHostDelegation.Parts
  readonly granted: ClaudeHostGate.Ports["granted"]
  readonly research?: Research
  readonly policy?: ClaudeHostGate.Ports
  /** Accepted per-call MCP dispatches and their SDK cancellation signals, owned by the query bridge. */
  readonly calls?: ClaudeHostMcp.Calls
}

/**
 * Jimmy's research allowance and provenance (src/research on jimmy-land: ResearchExecution and ResearchSourceCapture).
 * Each fails to refuse: an exhausted allowance is a hard stop, an unrecorded source is withheld from the model.
 */
export type Research = {
  /** Bind the dispatch's allowance to the child Session, at `PreToolUse[Agent]`. */
  readonly enter: (executionSessionID: SessionID, dispatchCallID: string) => Effect.Effect<void, unknown>
  /** Charge one tool call before it runs. */
  readonly tool: (executionSessionID: SessionID, callID: string, tool: string) => Effect.Effect<void, unknown>
  readonly stopReason?: (executionSessionID: SessionID) => Effect.Effect<string | undefined>
  readonly settle?: (executionSessionID: SessionID) => Effect.Effect<void>
  /** Optional fallback for builtin readers; production scopes discovery to native MCP capture instead. */
  readonly capture?: (executionSessionID: SessionID, callID: string, tool: string, input: unknown, output: string) => Effect.Effect<void, unknown>
}

/** Claude Code's native reads whose results Jimmy may cite only through recorded provenance. */
const CAPTURED = ["Read", "Grep", "Glob", "WebFetch", "WebSearch", "LSP"]

export function create(ctx: Context): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const delegation = ClaudeHostDelegation.make({ sessionID: ctx.sessionID, agent: ctx.agent,
    path: { cwd: ctx.directory, root: ctx.worktree }, join: ctx.join, parts: ctx.parts })
  const policy: { value?: Promise<ClaudeHostGate.Ports> } = {}
  const fault: { reason?: string } = {}
  // Observed exact native session/actor pairs belong to this query, never a process-global registry.
  const nativeOwners = new Map<string, ClaudeHostGate.Actor>()
  const actorSessions = new Map<string, string>()
  const conflicted = new Set<string>()
  const ports = () => policy.value ??= ctx.policy ? Promise.resolve(ctx.policy)
    : ctx.run(ClaudeHostGate.live({ granted: ctx.granted, abort: ctx.abort.signal, part: ctx.parts?.tool }))
  const unsubscribe = ctx.join.subscribe((frame) => {
    void Promise.resolve().then(() => ctx.run(delegation.notify(frame))).catch((error: unknown) => {
      fault.reason = `Orchestra could not record the subagent delivery: ${String(error)}`
      ctx.abort.abort()
    })
  })
  // The session's end releases its notices, its unbound grants and the jails its background processes still hold.
  ctx.abort.signal.addEventListener("abort", () => {
    unsubscribe()
    ClaudeHostMcp.release(ctx.sessionID)
    if (policy.value) policy.value.then((value) => ctx.run(value.close, true)).catch(() => undefined)
  }, { once: true })

  // A defect in Orchestra's own checks denies the call: the gate fails closed.
  const pre: HookCallback = (input, _toolUseID, options) => {
    if (input.hook_event_name !== "PreToolUse") return Promise.resolve({})
    return ctx.run(Effect.gen(function* () {
      const actor = yield* delegation.actor(input.agent_id)
      if ("hold" in actor) return ClaudeHostGate.deny(actor.hold)
      if (input.agent_id) yield* bind(input.session_id, actor)
      const exhausted = yield* researchStopReason(actor)
      if (exhausted) return { ...ClaudeHostGate.deny(exhausted), continue: false, stopReason: exhausted }
      const args = record(input.tool_input)
      if (ClaudeCodeTools.orchestra(input.tool_name) && Object.hasOwn(args, ClaudeHostMcp.DISPATCH))
        return ClaudeHostGate.deny("HOLD: the MCP dispatch receipt is supplied by the host, so model-supplied receipts are refused.")
      const decision = yield* ClaudeHostGate.decide(yield* Effect.promise(ports), actor, input.tool_name, args, input.tool_use_id)
      if (!decision.allow) {
        yield* evidence(actor, input.tool_name, input.tool_use_id, "held", decision.reason)
        return ClaudeHostGate.output(decision)
      }
      if (ClaudeHostGate.agentCall(input.tool_name)) {
        if (args.subagent_type === `${ClaudeHostDelegation.PREFIX}jimmy`)
          return ClaudeHostGate.deny("HOLD: NATIVE_RESEARCH_PROVIDER_ADMISSION_UNAVAILABLE: this SDK exposes no documented per-dispatch pre-provider admission for Jimmy's durable allowance; use Jimmy on Orchestra's loop.")
        yield* delegation.dispatch(input, actor)
        const dispatched = delegation.child(input.tool_use_id)
        if (dispatched && ctx.research && delegation.seat(input.tool_use_id) === "jimmy") yield* ctx.research.enter(dispatched, input.tool_use_id)
      }
      if (actor.seat === "jimmy") {
        if (!ctx.research) return ClaudeHostGate.deny("HOLD: jimmy's research allowance is not available on this host.")
        const charged = yield* Effect.exit(ctx.research.tool(actor.sessionID, input.tool_use_id, input.tool_name))
        const reason = yield* researchStopReason(actor)
        if (reason) return { ...ClaudeHostGate.deny(reason), continue: false, stopReason: reason }
        if (Exit.isFailure(charged)) {
          return ClaudeHostGate.deny(ClaudeCodeTools.failure(charged.cause))
        }
      }
      const own = ClaudeCodeTools.orchestra(input.tool_name)
      if (own && ctx.calls) return ClaudeHostGate.output({ ...decision, input: ctx.calls.reserve({
        callID: input.tool_use_id, sessionID: actor.sessionID, seat: actor.seat,
        tool: own, input: args, args: decision.input ?? args, signal: options.signal,
      }) })
      return ClaudeHostGate.output(decision)
    }).pipe(Effect.catchCause((cause) => Effect.succeed(ClaudeHostGate.deny(ClaudeCodeTools.failure(cause)))),
      // A call denied after its jail was set up never runs, so nothing else would release that jail.
      Effect.tap((output) => ClaudeHostGate.denied(output) ? release(input.tool_use_id) : Effect.void)))
  }

  const post: HookCallback = (input) => {
    if (input.hook_event_name !== "PostToolUse") return Promise.resolve({})
    ctx.calls?.release(input.tool_use_id)
    return ctx.run(Effect.gen(function* () {
      const agent = ClaudeHostGate.agentCall(input.tool_name)
      if (agent) yield* settleResearch(input.tool_use_id)
      // A background process keeps its jail until the session ends; any other call's jail ends with the call.
      if (ClaudeCodeTools.orchestra(input.tool_name) !== ClaudeHostGate.PROCESS) yield* release(input.tool_use_id)
      const actor = yield* delegation.actor(input.agent_id)
      const exhausted = "hold" in actor ? undefined : yield* researchStopReason(actor)
      if (exhausted) return { ...withheld(exhausted), continue: false, stopReason: exhausted }
      // Today's output boundary for Orchestra's tools: a recognized credential never reaches the model or a record.
      const inspected = yield* Effect.exit(ToolSafety.inspect(input.tool_response))
      const refused = Exit.isFailure(inspected) ? ClaudeCodeTools.failure(inspected.cause) : undefined
      if ("hold" in actor) return {}
      yield* evidence(actor, input.tool_name, input.tool_use_id, refused ? "held" : "success", refused)
      const context = agent ? yield* delegation.settle(input, refused) : undefined
      if (refused) return withheld(refused, context)
      if (actor.seat === "jimmy" && CAPTURED.includes(input.tool_name)) {
        if (!ctx.research?.capture) return withheld("jimmy's provenance capture is not available on this host")
        const captured = yield* Effect.exit(ctx.research.capture(actor.sessionID, input.tool_use_id, input.tool_name,
          input.tool_input, typeof input.tool_response === "string" ? input.tool_response : JSON.stringify(input.tool_response ?? null)))
        if (Exit.isFailure(captured)) return withheld(`its provenance was not recorded: ${ClaudeCodeTools.failure(captured.cause)}`)
      }
      return context ? { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context } } : {}
    }))
  }

  // A failed call holds a jail too; nothing else is recorded for it here.
  const failed: HookCallback = (input) => {
    if (input.hook_event_name !== "PostToolUseFailure") return Promise.resolve({})
    ctx.calls?.cancel(input.tool_use_id)
    ctx.calls?.release(input.tool_use_id)
    return ctx.run(Effect.gen(function* () {
      if (ClaudeHostGate.agentCall(input.tool_name)) yield* settleResearch(input.tool_use_id)
      yield* release(input.tool_use_id)
      const actor = yield* delegation.actor(input.agent_id)
      const exhausted = "hold" in actor ? undefined : yield* researchStopReason(actor)
      return exhausted ? { continue: false, stopReason: exhausted } : {}
    }))
  }

  const stop: HookCallback = (input) => {
    if (input.hook_event_name === "SubagentStop") delegation.stop(input.agent_id, input.last_assistant_message)
    return Promise.resolve({})
  }

  const compact: HookCallback = (input, _toolUseID, options) => {
    if (input.hook_event_name !== "SessionStart" || input.source !== "compact") return Promise.resolve({})
    return runMemory(Effect.gen(function* () {
      const actor = yield* owner(input.session_id)
      const text = yield* ClaudeHostMemory.read({ sessionID: actor.sessionID, pending: delegation.summaries(),
        grants: actor.sessionID === ctx.sessionID ? delegation.grants() : [] })
      return text ? { hookSpecificOutput: { hookEventName: "SessionStart" as const, additionalContext: text } } : {}
    }), options.signal)
  }

  const archive: HookCallback = (input, _toolUseID, options) => {
    if (input.hook_event_name !== "PostCompact") return Promise.resolve({})
    return runMemory(Effect.gen(function* () {
      const actor = yield* owner(input.session_id)
      yield* ClaudeHostMemory.observe({ sessionID: actor.sessionID, nativeSessionID: input.session_id,
        text: input.compact_summary, trigger: input.trigger })
      return {}
    }), options.signal)
  }

  return {
    PreToolUse: [{ hooks: [closed(pre)] }],
    PostToolUse: [{ hooks: [closed(post)] }],
    PostToolUseFailure: [{ hooks: [closed(failed)] }],
    SubagentStop: [{ hooks: [closed(stop)] }],
    SessionStart: [{ matcher: "compact", hooks: [closed(compact)] }],
    PostCompact: [{ hooks: [closed(archive)] }],
  }

  // A rejected SDK callback is a hook error, not a denial (SDK 0.3.289). Recover outside run AND cleanup, including
  // synchronous throws and cancellation. Record failures latch the gate; events without stop control abort the query.
  function closed(callback: HookCallback): HookCallback {
    return (input, toolUseID, options) => Promise.resolve().then(() => {
      if (fault.reason && input.hook_event_name === "PreToolUse") return ClaudeHostGate.deny(fault.reason)
      return callback(input, toolUseID, options)
    }).catch(async (error: unknown): Promise<HookJSONOutput> => {
      const reason = `Orchestra ${input.hook_event_name} failed closed: ${String(error)}`
      fault.reason ??= reason
      if (input.hook_event_name === "PreToolUse") {
        await Promise.resolve().then(() => {
          ctx.calls?.cancel(input.tool_use_id)
          ctx.calls?.release(input.tool_use_id)
        }).catch(() => undefined)
        return ClaudeHostGate.deny(reason)
      }
      if (input.hook_event_name === "PostToolUse")
        return { ...withheld(reason), continue: false, stopReason: reason }
      if (input.hook_event_name === "SessionStart" || input.hook_event_name === "PostCompact") ctx.abort.abort()
      return { continue: false, stopReason: reason, systemMessage: reason }
    })
  }

  function release(toolUseID: string) {
    // No acquired policy means no jail to release. Never initialize policy during denial cleanup.
    return policy.value ? Effect.promise(() => policy.value!).pipe(Effect.flatMap((policy) => policy.release(toolUseID))) : Effect.void
  }

  function settleResearch(toolUseID: string) {
    const child = delegation.child(toolUseID)
    return child && delegation.seat(toolUseID) === "jimmy" && ctx.research?.settle ? ctx.research.settle(child) : Effect.void
  }

  function researchStopReason(actor: ClaudeHostGate.Actor) {
    // Tool-hook stop control ends the calling loop (CLI 2.1.289), never the parent's Agent return hook.
    return actor.seat === "jimmy" && actor.agentID && ctx.research?.stopReason
      ? ctx.research.stopReason(actor.sessionID) : Effect.succeed(undefined)
  }

  // Durable safety evidence per call, on the mirrored call's message. A call the mirror has not seen yet has no anchor.
  function evidence(actor: ClaudeHostGate.Actor, tool: string, callID: string, outcome: "success" | "held", reason: string | undefined) {
    return Effect.gen(function* () {
      const observations = yield* Effect.serviceOption(ArsenalObservations.Service)
      const part = ctx.parts?.tool(callID)
      if (Option.isNone(observations) || !part) return
      const store = yield* Session.Service
      const session = yield* store.get(actor.sessionID)
      yield* observations.value.emit({ sessionID: actor.sessionID, assistantMessageID: part.messageID, callID,
        placement: { directory: session.directory, projectID: session.projectID },
        fact: { source: "native-host", version: 1, kind: "safety", tool: tool.slice(0, 128), outcome,
          ...(reason ? { reason: reason.slice(0, 4096) } : {}) } })
    })
  }

  function bind(nativeSessionID: string, actor: ClaudeHostGate.Actor) {
    return Effect.gen(function* () {
      const sessions = yield* Session.Service
      const root = yield* sessions.get(ctx.sessionID)
      const nativeRoot = root.metadata?.claudeCode?.sessionId
      const previous = nativeOwners.get(nativeSessionID)
      if (!actor.agentID || actor.sessionID === ctx.sessionID || typeof nativeRoot !== "string" ||
        nativeSessionID === nativeRoot || !nativeSessionID || conflicted.has(nativeSessionID) ||
        previous && (previous.agentID !== actor.agentID || previous.sessionID !== actor.sessionID) ||
        actorSessions.has(actor.agentID) && actorSessions.get(actor.agentID) !== nativeSessionID) {
        conflicted.add(nativeSessionID)
        if (actor.agentID && actorSessions.has(actor.agentID)) conflicted.add(actorSessions.get(actor.agentID)!)
        return yield* Effect.fail(new Error("COMPACT_NATIVE_OWNER_CONFLICT: native session/actor pair cannot be bound"))
      }
      nativeOwners.set(nativeSessionID, actor)
      actorSessions.set(actor.agentID, nativeSessionID)
    })
  }

  function owner(nativeSessionID: string) {
    return Effect.gen(function* () {
      const sessions = yield* Session.Service
      const root = yield* sessions.get(ctx.sessionID)
      const nativeRoot = root.metadata?.claudeCode?.sessionId
      if (conflicted.has(nativeSessionID)) return yield* Effect.fail(new Error("COMPACT_NATIVE_OWNER_CONFLICT"))
      if (typeof nativeRoot !== "string" || !nativeRoot)
        return yield* Effect.fail(new Error("COMPACT_NATIVE_OWNER_UNAVAILABLE: root init identity is not persisted"))
      if (nativeOwners.has(nativeRoot)) return yield* Effect.fail(new Error("COMPACT_NATIVE_OWNER_CONFLICT: root identity overlaps an observed child"))
      if (nativeSessionID === nativeRoot) return { sessionID: ctx.sessionID, seat: ctx.agent }
      const observed = nativeOwners.get(nativeSessionID)
      if (!observed?.agentID) return yield* Effect.fail(new Error(
        "COMPACT_NATIVE_OWNER_UNAVAILABLE: no joined PreToolUse native session/actor pair in this query (including after restart)"))
      const actor = yield* delegation.actor(observed.agentID)
      if ("hold" in actor || actor.sessionID !== observed.sessionID || actor.agentID !== observed.agentID)
        return yield* Effect.fail(new Error("COMPACT_NATIVE_OWNER_CONFLICT: observed actor is no longer joined"))
      const child = yield* sessions.get(actor.sessionID)
      if (!child.parentID) return yield* Effect.fail(new Error("COMPACT_NATIVE_OWNER_CONFLICT: child has no dispatching Session"))
      const parent = yield* ClaudeHostMemory.retained(child.parentID)
      if (!parent.history.some((message) => message.parts.some((part) => part.type === "tool" &&
        ClaudeHostGate.agentCall(part.tool) && part.state.status !== "pending" && part.state.metadata?.sessionId === child.id)))
        return yield* Effect.fail(new Error("COMPACT_NATIVE_OWNER_UNRETAINED: joined Agent part is absent from its dispatcher's view"))
      return actor
    })
  }

  function runMemory<A, R>(work: Effect.Effect<A, unknown, R>, signal: AbortSignal) {
    // Also close the Promise delivery gap after the Effect interpreter settles, before the SDK accepts the result.
    return ctx.run(cancellable(work, signal)).then((value) => {
      if (signal.aborted || ctx.abort.signal.aborted) throw new Error("COMPACT_HOOK_CANCELLED: callback delivery was aborted")
      return value
    })
  }

  function cancellable<A, R>(work: Effect.Effect<A, unknown, R>, signal: AbortSignal) {
    const signals = [...new Set([signal, ctx.abort.signal])]
    const cancelled = () => Effect.fail(new Error("COMPACT_HOOK_CANCELLED: native callback or owning host aborted"))
    return Effect.suspend(() => {
      if (signals.some((signal) => signal.aborted)) return cancelled()
      return Effect.raceFirst(work, Effect.callback<never, Error>((resume) => {
        const abort = () => resume(cancelled())
        signals.forEach((signal) => signal.addEventListener("abort", abort, { once: true }))
        if (signals.some((signal) => signal.aborted)) abort()
        return Effect.sync(() => signals.forEach((signal) => signal.removeEventListener("abort", abort)))
      })).pipe(Effect.flatMap((value) => signals.some((signal) => signal.aborted) ? cancelled() : Effect.succeed(value)))
    })
  }
}

function withheld(reason: string, context?: string): HookJSONOutput {
  return { hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput: `Orchestra withheld this output: ${reason}`,
    ...(context ? { additionalContext: context } : {}) } }
}

function record(value: unknown): { readonly [key: string]: unknown } {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export * as ClaudeHostHooks from "./hooks"

// The SDK `hooks` option of one Claude Code host session: in-process callbacks, never plugin shell hooks, so every
// record they write comes from inside Orchestra's process.
// - PreToolUse: the policy gate (gate.ts) for every call, then the Agent dispatch record (delegation.ts) and Jimmy's
//   per-call allowance charge. Any failure here is a deny.
// - PostToolUse: output inspection, the installed Relay hooks' `after` (their notes go to the model as context), the
//   native safety evidence, Jimmy's provenance and byte charges, and the Agent settlement record.
// - SubagentStop: the subagent's last text (a background run's author, recorded only once it is delivered).
// - The join's `task_notification` frames (join.ts, fed by HOST's stream consumer): background deliveries.
// - SessionStart(compact): owned retained memory and honestly labelled query-local state, with no model call.
// - PostCompact: Claude Code's summary archived for `context_recall`.
import { Effect, Exit, Option } from "effect"
import type { HookCallback, HookCallbackMatcher, HookEvent, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk"
import { ToolSafety } from "@orchestra/core/tool-safety"
import type { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { Archive } from "@/continuity/archive"
import type { SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { ClaudeCodeTools } from "../tools"
import { ClaudeHostDelegation } from "./delegation"
import { ClaudeHostGate } from "./gate"
import type { ClaudeHostJoin } from "./join"
import { ClaudeHostMcp } from "./mcp"
import { ClaudeHostMemory } from "./memory"
import { ClaudeHostResearch } from "./research"
import { ClaudeHostResearchResult } from "./research-result"

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
  /** The host layer's arsenal bindings for the gate (ClaudeHostGate.live). */
  readonly arsenal?: Effect.Success<typeof ArsenalBindings.make>
  /** Accepted per-call MCP dispatches and their SDK cancellation signals, owned by the query bridge. */
  readonly calls?: ClaudeHostMcp.Calls
  /** Resolve SDK selection metadata to canonical catalog identity; missing facts remain unknown. */
  readonly models?: ClaudeHostDelegation.Models
}

/**
 * Jimmy's research allowance and provenance (src/research on jimmy-land: ResearchExecution and ResearchSourceCapture).
 * Each fails to refuse: an exhausted allowance is a hard stop, an unrecorded source is withheld from the model.
 */
export type Research = ClaudeHostResearchResult.Port & {
  /** Bind the dispatch's allowance, at the dispatcher's effort tier, to the child Session at `PreToolUse[Agent]`. */
  readonly enter: (executionSessionID: SessionID, dispatchCallID: string,
    tier: NonNullable<ReturnType<typeof ClaudeHostResearch.effort>>) => Effect.Effect<void, unknown>
  /** Charge one tool call before it runs. */
  readonly tool: (executionSessionID: SessionID, callID: string, tool: string) => Effect.Effect<void, unknown>
  /** Optional fallback for builtin readers; production scopes discovery to native MCP capture instead. */
  readonly capture?: (executionSessionID: SessionID, callID: string, tool: string, input: unknown, output: string) => Effect.Effect<void, unknown>
}

/** Claude Code's native reads whose results Jimmy may cite only through recorded provenance. */
const CAPTURED = ["Read", "Grep", "Glob", "WebFetch", "WebSearch", "LSP"]

export function create(ctx: Context): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const delegation = ClaudeHostDelegation.make({ sessionID: ctx.sessionID, agent: ctx.agent,
    path: { cwd: ctx.directory, root: ctx.worktree }, join: ctx.join, parts: ctx.parts, research: ctx.research, models: ctx.models })
  const policy: { value?: Promise<ClaudeHostGate.Ports> } = {}
  const fault: { reason?: string } = {}
  const ports = () => policy.value ??= ctx.policy ? Promise.resolve(ctx.policy)
    : ctx.run(ClaudeHostGate.live({ granted: ctx.granted, abort: ctx.abort.signal, part: ctx.parts?.tool, arsenal: ctx.arsenal }))
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
        const tier = ClaudeHostResearch.effort(args.prompt)
        const invalidTier = "HOLD: jimmy's brief starts with an unknown effort line. Use `effort: quick`, `effort: focused` or `effort: deep`, or omit the line for quick."
        if (args.subagent_type === `${ClaudeHostDelegation.PREFIX}jimmy` && !ctx.research)
          return ClaudeHostGate.deny("HOLD: jimmy's research allowance is not available on this host.")
        if (args.subagent_type === `${ClaudeHostDelegation.PREFIX}jimmy` && !tier) return ClaudeHostGate.deny(invalidTier)
        yield* delegation.dispatch(input, actor)
        const dispatched = delegation.child(input.tool_use_id)
        if (dispatched && ctx.research && delegation.seat(input.tool_use_id) === "jimmy")
          yield* tier ? ctx.research.enter(dispatched, input.tool_use_id, tier) : Effect.fail(new Error(invalidTier))
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
      if (ClaudeHostGate.agentCall(input.tool_name)) yield* delegation.admit(input, actor)
      const own = ClaudeCodeTools.orchestra(input.tool_name)
      if (own && ctx.calls) return ClaudeHostGate.output({ ...decision, input: ctx.calls.reserve({
        callID: input.tool_use_id, sessionID: actor.sessionID, seat: actor.seat,
        tool: own, input: args, args: decision.input ?? args, signal: options.signal,
      }) })
      return ClaudeHostGate.output(decision)
    }).pipe(Effect.catchCause((cause) => Effect.succeed(ClaudeHostGate.deny(ClaudeCodeTools.failure(cause)))),
      // A call denied after its jail or its hooks' `before` was set up never runs, so nothing else would end them.
      Effect.tap((output) => ClaudeHostGate.denied(output)
        ? release(input.tool_use_id).pipe(Effect.andThen(settle(input.tool_use_id, false).pipe(Effect.ignore))) : Effect.void)))
  }

  const post: HookCallback = (input) => {
    if (input.hook_event_name !== "PostToolUse") return Promise.resolve({})
    ctx.calls?.release(input.tool_use_id)
    return ctx.run(Effect.gen(function* () {
      const agent = ClaudeHostGate.agentCall(input.tool_name)
      // A background process keeps its jail until the session ends; any other call's jail ends with the call.
      if (ClaudeCodeTools.orchestra(input.tool_name) !== ClaudeHostGate.PROCESS) yield* release(input.tool_use_id)
      const actor = yield* delegation.actor(input.agent_id)
      const exhausted = "hold" in actor ? undefined : yield* researchStopReason(actor)
      if (exhausted) return { ...withheld(exhausted), continue: false, stopReason: exhausted }
      // Today's output boundary for Orchestra's tools: a recognized credential never reaches the model or a record.
      const inspected = yield* Effect.exit(ToolSafety.inspect(input.tool_response))
      // Then the installed hooks' `after`: their notes reach the model beside the result, and a refusal withholds it.
      const hooked = yield* Effect.exit(settle(input.tool_use_id, Exit.isSuccess(inspected)))
      const refused = Exit.isFailure(inspected) ? ClaudeCodeTools.failure(inspected.cause)
        : Exit.isFailure(hooked) ? ClaudeCodeTools.failure(hooked.cause) : undefined
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
      const additional = [context, Exit.isSuccess(hooked) ? hooked.value.join("\n") : ""].filter(Boolean).join("\n\n")
      if (!additional) return {}
      return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: additional,
        ...(context ? { updatedToolOutput: context } : {}) } }
    }))
  }

  // A failed Agent call settles its existing parent part without manufacturing a child output or delivery.
  const failed: HookCallback = (input) => {
    if (input.hook_event_name !== "PostToolUseFailure") return Promise.resolve({})
    ctx.calls?.cancel(input.tool_use_id)
    ctx.calls?.release(input.tool_use_id)
    return ctx.run(Effect.gen(function* () {
      const context = ClaudeHostGate.agentCall(input.tool_name) ? yield* delegation.fail(input) : undefined
      yield* release(input.tool_use_id)
      // A failed call runs no `after` hooks; the notes its `before` hooks recorded still reach the model.
      const notes = yield* settle(input.tool_use_id, false).pipe(Effect.orElseSucceed(() => []))
      const actor = yield* delegation.actor(input.agent_id)
      const exhausted = "hold" in actor ? undefined : yield* researchStopReason(actor)
      if (exhausted) return { continue: false, stopReason: exhausted }
      const additional = [context, notes.join("\n")].filter(Boolean).join("\n\n")
      return additional ? { hookSpecificOutput: { hookEventName: "PostToolUseFailure", additionalContext: additional } } : {}
    }))
  }

  const stop: HookCallback = (input) => {
    if (input.hook_event_name === "SubagentStop") delegation.stop(input.agent_id, input.last_assistant_message)
    return Promise.resolve({})
  }

  const compact: HookCallback = (input, _toolUseID, options) => {
    if (input.hook_event_name !== "SessionStart" || input.source !== "compact") return Promise.resolve({})
    return runMemory(Effect.gen(function* () {
      const actor = yield* owner(input.session_id, input.agent_id)
      const text = yield* ClaudeHostMemory.read({ sessionID: actor.sessionID, pending: delegation.summaries(),
        grants: actor.sessionID === ctx.sessionID ? delegation.grants() : [] })
      return text ? { hookSpecificOutput: { hookEventName: "SessionStart" as const, additionalContext: text } } : {}
    }), options.signal)
  }

  const archive: HookCallback = (input, _toolUseID, options) => {
    if (input.hook_event_name !== "PostCompact") return Promise.resolve({})
    return runMemory(Effect.gen(function* () {
      const actor = yield* owner(input.session_id, input.agent_id)
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
      // Archive exposes an owned reason code, not its source bytes or filesystem error text.
      const detail = error instanceof Archive.ArchiveError
        ? `${error._tag}: ${/^archive-[a-z-]+$/.test(error.reason) ? error.reason : "archive-unavailable"}` : String(error)
      const reason = `Orchestra ${input.hook_event_name} failed closed: ${detail}`
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

  // The installed hooks' `after` of a call the gate let through (ClaudeHostGate.Ports.settle), and the end of its state.
  function settle(toolUseID: string, succeeded: boolean) {
    return Effect.gen(function* () {
      // No acquired policy means no call passed the gate, so no hook ran before one.
      const acquired = policy.value
      if (!acquired) return []
      const gate = yield* Effect.promise(() => acquired)
      return gate.settle ? yield* gate.settle(toolUseID, succeeded) : []
    })
  }

  function researchStopReason(actor: ClaudeHostGate.Actor) {
    // Tool-hook stop control ends the calling loop (CLI 2.1.289), never the parent's Agent return hook.
    return actor.seat === "jimmy" && actor.agentID && ctx.research?.stopReason
      ? ctx.research.stopReason(actor.sessionID).pipe(Effect.flatMap((text) =>
        text === undefined ? Effect.succeed(undefined) : ClaudeHostResearchResult.diagnostic(text))) : Effect.succeed(undefined)
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

  function owner(nativeSessionID: string, agentID: string | undefined) {
    return Effect.gen(function* () {
      // BaseHookInput.agent_id identifies subagent events even when session_id is shared with the root.
      // The query's dispatch join owns that identity; a native session string cannot override it.
      if (agentID === "")
        return yield* Effect.fail(new Error("COMPACT_NATIVE_OWNER_UNAVAILABLE: an empty agent_id cannot identify the root"))
      const actor = yield* delegation.actor(agentID)
      if ("hold" in actor) {
        const call = agentID ? ctx.join.toolUse(agentID) : undefined
        return yield* Effect.fail(new Error(`${call && ctx.join.get(call)?.hold
          ? "COMPACT_NATIVE_OWNER_CONFLICT" : "COMPACT_NATIVE_OWNER_UNAVAILABLE"}: ${actor.hold}`))
      }
      const sessions = yield* Session.Service
      if (!agentID) {
        const root = yield* sessions.get(ctx.sessionID)
        const nativeRoot = root.metadata?.claudeCode?.sessionId
        if (typeof nativeRoot !== "string" || !nativeRoot || nativeSessionID !== nativeRoot)
          return yield* Effect.fail(new Error("COMPACT_NATIVE_OWNER_UNAVAILABLE: root init identity is not persisted or does not match"))
        return actor
      }
      const child = yield* sessions.get(actor.sessionID)
      if (!child.parentID || child.id === ctx.sessionID)
        return yield* Effect.fail(new Error("COMPACT_NATIVE_OWNER_CONFLICT: joined child has no dispatching Session"))
      const parent = yield* ClaudeHostMemory.retained(child.parentID)
      const call = ctx.join.toolUse(agentID)
      if (!parent.history.some((message) => message.parts.some((part) => part.type === "tool" &&
        ClaudeHostGate.agentCall(part.tool) && part.callID === call && part.state.status !== "pending" &&
        part.state.metadata?.sessionId === child.id)))
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
      const cleanup: { run?: () => void } = {}
      return Effect.raceFirst(work, Effect.callback<never, Error>((resume) => {
        const abort = () => resume(cancelled())
        cleanup.run = () => signals.forEach((signal) => signal.removeEventListener("abort", abort))
        signals.forEach((signal) => signal.addEventListener("abort", abort, { once: true }))
        if (signals.some((signal) => signal.aborted)) abort()
      })).pipe(
        // callback's returned cleanup runs only on interruption, not when abort resumes it with a failure.
        Effect.ensuring(Effect.sync(() => cleanup.run?.())),
        Effect.flatMap((value) => signals.some((signal) => signal.aborted) ? cancelled() : Effect.succeed(value)),
      )
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

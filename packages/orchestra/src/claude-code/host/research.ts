export * as ClaudeHostResearch from "./research"

import { Cause, Effect, Exit, Fiber, Scope } from "effect"
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { Research } from "@orchestra/schema/research"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ResearchExecution } from "@/research/allowance"
import type { SessionID } from "@/session/schema"
import { ClaudeCodeTools } from "../tools"
import type { ClaudeHostJoin } from "./join"

/** One query's issued native dispatch frames; model input cannot supply research attribution. */
export const make = Effect.gen(function* () {
  const execution = yield* ResearchExecution.Service
  const allowances = yield* ResearchAllowance.Service
  const scope = yield* Scope.make()
  const frames = new Map<SessionID, ResearchExecution.Frame>()
  const turns = new Map<SessionID, Set<string>>()
  const holds = new Map<SessionID, Research.Error>()
  const deadlines = new Map<SessionID, Fiber.Fiber<void>>()
  const aborts = new Map<SessionID, AbortController>()

  const attributed = <A, E, R>(sessionID: SessionID, effect: Effect.Effect<A, E, R>) => Effect.suspend<A, E | Research.Error, R>(() => {
    const frame = frames.get(sessionID)
    if (!frame) return Effect.fail(new Research.Error({ code: "binding_missing", message: "Research dispatch was not admitted by PreToolUse[Agent]" }))
    const hold = holds.get(sessionID)
    if (hold) return Effect.fail(hold)
    return effect.pipe(Effect.provideService(ResearchExecution.Current, frame))
  })

  // Keep the native failure code visible in hook denies and MCP error text, which otherwise render only message.
  const named = (sessionID: SessionID) => <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Research.Error, R> =>
    effect.pipe(Effect.catchCause((cause): Effect.Effect<never, E | Research.Error> => {
      if (Cause.hasInterrupts(cause)) return Effect.failCause(cause)
      const error = cause.reasons.flatMap((reason) => Cause.isDieReason(reason) ? [reason.defect]
        : Cause.isFailReason(reason) ? [reason.error] : []).find((error) => error instanceof Research.Error)
      if (!(error instanceof Research.Error)) return Effect.failCause(cause)
      const failure = new Research.Error({ code: error.code, message: `${error.code}: ${error.message}` })
      if (error.code === "budget_exhausted" && holds.get(sessionID)?.code !== "budget_exhausted") holds.set(sessionID, failure)
      return Effect.fail(failure)
    }))

  return {
    enter: (sessionID: SessionID, callID: string) => execution.enter(sessionID, callID, Effect.gen(function* () {
      const frame = yield* ResearchExecution.Current
      if (!frame) return yield* new Research.Error({ code: "binding_missing", message: "Research dispatch has no native binding" })
      // Exact admission retries must not extend the dispatch's deadline.
      if (frames.has(sessionID)) return
      frames.set(sessionID, frame)
      const abort = new AbortController()
      aborts.set(sessionID, abort)
      deadlines.set(sessionID, yield* Effect.sleep("600 seconds").pipe(Effect.andThen(Effect.sync(() => {
        holds.set(sessionID, new Research.Error({ code: "budget_exhausted",
          message: "budget_exhausted: Research dispatch deadline exhausted (600 seconds); retained work remains available" }))
        abort.abort()
      })), Effect.forkIn(scope, { startImmediately: true })))
    })),
    /** Only joined child tool hooks consume this reason; the parent Agent settlement must keep running. */
    stopReason: (sessionID: SessionID) => Effect.sync(() => {
      const hold = holds.get(sessionID)
      return hold?.code === "budget_exhausted" ? `budget_exhausted: ${hold.message.replace(/^budget_exhausted: /, "")}` : undefined
    }),
    signal: (sessionID: SessionID) => aborts.get(sessionID)?.signal,
    settle: (sessionID: SessionID) => Effect.gen(function* () {
      const deadline = deadlines.get(sessionID)
      deadlines.delete(sessionID)
      if (deadline) yield* Fiber.interrupt(deadline)
    }),
    close: Scope.close(scope, Exit.void).pipe(Effect.andThen(Effect.sync(() => deadlines.clear()))),
    tool: (sessionID: SessionID, callID: string, name: string) => attributed(sessionID,
      execution.tool(sessionID, callID, ClaudeCodeTools.orchestra(name) ?? name, Effect.void)).pipe(named(sessionID)),
    /** Registry execution charges the same tool operation idempotently and reserves bytes before retention. */
    execute: <A, E, R>(sessionID: SessionID, effect: Effect.Effect<A, E, R>) => frames.has(sessionID)
      ? attributed(sessionID, effect).pipe(named(sessionID)) : effect,
    /** Complete assistant blocks share the Messages API id (SDK 0.3.289); progress summaries are not model turns. */
    observe: (join: ClaudeHostJoin.Join, message: SDKMessage) => Effect.gen(function* () {
      if (message.type !== "assistant" || !message.parent_tool_use_id) return
      const sessionID = join.child(message.parent_tool_use_id)
      const frame = sessionID ? frames.get(sessionID) : undefined
      if (!sessionID || !frame) return
      const seen = turns.get(sessionID) ?? new Set<string>()
      turns.set(sessionID, seen)
      if (seen.has(message.message.id) || seen.size >= frame.allowance.providerLimit) return
      yield* allowances.charge(frame.allowance, "provider", `provider:claude-host:${message.message.id}`).pipe(
        Effect.catch((error) => Effect.sync(() => {
          // A late ledger failure cannot undo deadline/tool/byte exhaustion or its hook stop control.
          if (holds.get(sessionID)?.code !== "budget_exhausted") holds.set(sessionID, error)
        })))
      seen.add(message.message.id)
      // maxTurns bounds the SDK's agentic loop; completed IDs remain the native ledger's observable debit.
      // Hidden retries and in-flight compaction have no dispatch-specific admission hook here.
      if (seen.size >= frame.allowance.providerLimit && holds.get(sessionID)?.code !== "budget_exhausted") holds.set(sessionID, new Research.Error({ code: "budget_exhausted",
        message: `budget_exhausted: Research provider allowance exhausted (${frame.allowance.providerLimit}/${frame.allowance.providerLimit}); retained work remains available` }))
    }),
  }
})

export type Runtime = Effect.Success<typeof make>

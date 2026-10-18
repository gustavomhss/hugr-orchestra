export * as ClaudeHostBridge from "./bridge"

import { isDeepStrictEqual } from "node:util"
import { Effect } from "effect"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import type { Session } from "@/session/session"
import type { Tool } from "@/tool/tool"
import { ClaudeHostMcp } from "./mcp"
import type { ClaudeHostMirror } from "./mirror"
import type { ClaudeHostOptions } from "./options"
import type { ClaudeHostResearch } from "./research"

export type Live = {
  readonly sessionID: ClaudeHostOptions.Context["sessionID"]
  readonly turn?: { readonly view: ClaudeHostMirror.Mirror }
  readonly known: { readonly calls: Map<string, ClaudeHostMirror.Mirror> }
  readonly run: ClaudeHostMcp.Bridge["run"]
}

type Call = {
  readonly reservation: ClaudeHostMcp.Reservation
  readonly receipt: string
  readonly abort: AbortController
  claimed: boolean
  signal?: AbortSignal
}

/** One bridge per query: reservations survive turn completion, and each execution owns its cancellation. */
export function create(live: Live, ctx: ClaudeHostOptions.Context, services: {
  readonly sessions: Session.Interface
  readonly permission: Permission.Interface
  readonly agents: Agent.Interface
  readonly research?: ClaudeHostResearch.Runtime
  readonly withSession: <A>(sessionID: string, effect: Effect.Effect<A>) => Effect.Effect<A>
}) {
  const admission = { stopped: false }
  const stoppedChildren = new Set<ClaudeHostOptions.Context["sessionID"]>()
  const calls = new Map<string, Call>()
  const owner = (callID: string) => live.known.calls.get(callID) ?? live.turn?.view
  const tool = (callID: string) => owner(callID)?.tool(callID)
  const bridge: ClaudeHostMcp.Bridge & ClaudeHostMcp.Calls & { interrupt: (sessionID?: ClaudeHostOptions.Context["sessionID"]) => void; resume: () => void } = {
    run: live.run,
    reserve: (reservation: ClaudeHostMcp.Reservation) => {
      if (admission.stopped || ctx.abort.signal.aborted) throw new Error("HOLD: this host turn was stopped, so no MCP call was admitted.")
      if (stoppedChildren.has(reservation.sessionID)) throw new Error("HOLD: this child was stopped, so no MCP call was admitted.")
      if (services.research?.signal(reservation.sessionID)?.aborted) throw new Error("budget_exhausted: Research dispatch deadline exhausted.")
      if (calls.has(reservation.callID)) throw new Error(`HOLD: duplicate MCP reservation ${reservation.callID}.`)
      const receipt = crypto.randomUUID()
      calls.set(reservation.callID, { reservation: { ...reservation, input: structuredClone(reservation.input), args: structuredClone(reservation.args) },
        receipt, abort: new AbortController(), claimed: false })
      return { ...reservation.args, [ClaudeHostMcp.DISPATCH]: receipt }
    },
    cancel: (callID: string) => calls.get(callID)?.abort.abort(),
    release: (callID: string) => {
      calls.get(callID)?.abort.abort()
      calls.delete(callID)
    },
    resume: () => { admission.stopped = false },
    /** Cancels outstanding calls, optionally scoped to one child. Completed processes are adopted separately. */
    interrupt: (sessionID?: ClaudeHostOptions.Context["sessionID"]) => {
      if (!sessionID) admission.stopped = true
      // Root continuation cannot reopen an interrupted native child; an explicit new query gets a fresh bridge.
      if (sessionID) stoppedChildren.add(sessionID)
      calls.forEach((call) => {
        if (!sessionID || call.reservation.sessionID === sessionID) call.abort.abort()
      })
    },
    claim: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Effect.gen(function* () {
      const receipt = args[ClaudeHostMcp.DISPATCH]
      const matches = [...calls.values()].filter((call) => call.receipt === receipt)
      if (typeof receipt !== "string" || matches.length !== 1 || matches[0].claimed)
        return yield* Effect.die(new Error(`HOLD: ${name} has no unique, unclaimed MCP dispatch receipt; correlation is unavailable or ambiguous.`))
      const call = matches[0]
      if (call.reservation.tool !== name || !isDeepStrictEqual(call.reservation.args, ClaudeHostMcp.argumentsOf(args)))
        return yield* Effect.die(new Error(`HOLD: ${name} arguments do not match its accepted dispatch.`))
      call.claimed = true
      const research = services.research?.signal(call.reservation.sessionID)
      call.signal = AbortSignal.any([ctx.abort.signal, signal, call.reservation.signal, call.abort.signal,
        ...(research ? [research] : [])])
      for (let round = 0; round < 1500; round++) {
        if (call.signal.aborted) return yield* Effect.die(new Error(`MCP call ${call.reservation.callID} was cancelled.`))
        const part = tool(call.reservation.callID)
        if (part) {
          if (part.tool !== name || part.sessionID !== call.reservation.sessionID || part.state.status !== "running" ||
            !isDeepStrictEqual(part.state.input, call.reservation.input))
            return yield* Effect.die(new Error(`HOLD: mirrored MCP call ${part.callID} does not match its accepted dispatch.`))
          return part
        }
        yield* Effect.sleep("20 millis")
      }
      return yield* Effect.die(new Error(`no mirrored ${name} call ${call.reservation.callID} to run`))
    }),
    complete: (part) => Effect.suspend(() => {
      const current = tool(part.callID)
      // Stop may have already closed the card while the cancelled execution unwinds.
      if (calls.get(part.callID)?.signal?.aborted && current && current.state.status !== "running") return Effect.void
      return owner(part.callID)?.complete(part) ?? Effect.void
    }),
    context: (part) => Effect.gen(function* () {
      const call = calls.get(part.callID)
      if (!call?.signal || call.signal.aborted) return yield* Effect.die(new Error(`MCP call ${part.callID} was cancelled or unreserved.`))
      const session = yield* services.sessions.get(part.sessionID).pipe(Effect.orDie)
      const messages = yield* services.sessions.messages({ sessionID: part.sessionID }).pipe(Effect.orDie)
      const author = messages.find((message) => message.info.id === part.messageID)?.info
      if (author?.role !== "assistant") return yield* Effect.die(new Error(`HOLD: MCP call ${part.callID} has no owning assistant.`))
      const agent = yield* services.agents.get(session.agent ?? author.agent).pipe(Effect.orDie)
      if (!agent || (agent.id ?? agent.name) !== call.reservation.seat || author.agent !== call.reservation.seat)
        return yield* Effect.die(new Error(`HOLD: MCP call ${part.callID} does not belong to its calling seat.`))
      return {
        sessionID: part.sessionID, messageID: part.messageID, callID: part.callID, agent: agent.name, agentID: agent.id,
        abort: call.signal, messages, extra: { claudeCode: true },
        metadata: (value) => Effect.gen(function* () {
          if (call.signal?.aborted) return
          const current = tool(part.callID)
          if (!current || current.state.status !== "running") return
          yield* bridge.complete({ ...current, state: { ...current.state, title: value.title ?? current.state.title,
            metadata: { ...current.state.metadata, ...value.metadata } } })
        }),
        ask: (request) => Effect.gen(function* () {
          const latest = yield* services.sessions.get(part.sessionID).pipe(Effect.orDie)
          yield* services.permission.ask({ ...request, sessionID: part.sessionID, tool: { messageID: part.messageID, callID: part.callID },
            ruleset: Permission.merge(agent.permission, latest.permission ?? []) }).pipe(Effect.orDie)
        }),
      } satisfies Tool.Context
    }),
    execute: (def, args, context) => {
      const execute = Effect.suspend(() => {
        if (context.abort.aborted) return Effect.die(new Error(`MCP call ${context.callID} was cancelled.`))
        return Effect.raceFirst(def.execute(args, context), Effect.callback<never>((resume) => {
          const abort = () => resume(Effect.die(new Error(`MCP call ${context.callID} was cancelled.`)))
          if (context.abort.aborted) abort()
          context.abort.addEventListener("abort", abort, { once: true })
          return Effect.sync(() => context.abort.removeEventListener("abort", abort))
        })).pipe(Effect.flatMap((result) => context.abort.aborted
          ? Effect.die(new Error(`MCP call ${context.callID} was cancelled.`)) : Effect.succeed(result)))
      })
      return services.withSession(context.sessionID, services.research
        ? services.research.execute(context.sessionID, execute).pipe(Effect.orDie) : execute)
    },
    settled: (callID) => {
      // Retain identity until PostToolUse so a delayed/repeated handler cannot be rebound to another call.
      calls.get(callID)?.abort.abort()
    },
  }
  return bridge
}

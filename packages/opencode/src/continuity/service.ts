export * as SessionContinuity from "./service"

import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { BackgroundJob } from "@/background/job"
import { InstanceState } from "@/effect/instance-state"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import type { MessageID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { Cause, Context, Effect, Layer } from "effect"
import { create } from "./context"
import { run, snapshot } from "./fork"
import { isCurrent } from "./model"
import { isSafe, shouldStart, tokenCount } from "./trigger"
import type { SessionV1 } from "@opencode-ai/core/v1/session"

type Active = { generation: number; boundary: MessageID }
type Entry = {
  generation: number
  safe?: MessageID
  active?: Active
  pending?: SessionV1.Assistant
  attempted?: MessageID
  refresh: boolean
}
type State = { sessions: Map<SessionID, Entry>; contexts: ReturnType<typeof create> }

export interface Interface {
  readonly prepare: (input: { sessionID: SessionID; messages: SessionV1.WithParts[] }) => Effect.Effect<{
    messages: SessionV1.WithParts[]
    system: string[]
  }>
  readonly start: (input: { sessionID: SessionID; message: SessionV1.Assistant }) => Effect.Effect<void>
  readonly advance: (sessionID: SessionID) => Effect.Effect<void>
  readonly invalidate: (sessionID: SessionID) => Effect.Effect<void>
  readonly forget: (sessionID: SessionID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionContinuity") {}

function entry(state: State, sessionID: SessionID) {
  const existing = state.sessions.get(sessionID)
  if (existing) return existing
  const next: Entry = { generation: 0, refresh: false }
  state.sessions.set(sessionID, next)
  return next
}

// Provider causes may contain conversation content. Keep diagnostics structural.
function diagnostic(sessionID: SessionID, boundary: MessageID | undefined, reason: string) {
  return Effect.logWarning("continuity maintenance", { sessionID, boundary, reason })
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const background = yield* BackgroundJob.Service
    const provider = yield* Provider.Service
    const llm = yield* LLM.Service
    const state = yield* InstanceState.make(() => Effect.succeed<State>({ sessions: new Map(), contexts: create() }))

    const prepare: Interface["prepare"] = Effect.fn("SessionContinuity.prepare")(function* (input) {
      const current = yield* InstanceState.get(state)
      return yield* Effect.sync(() => current.contexts.prepare(input.sessionID, input.messages))
    })

    const advance: Interface["advance"] = Effect.fn("SessionContinuity.advance")(function* (sessionID) {
      const current = yield* InstanceState.get(state)
      yield* Effect.sync(() => {
        const item = entry(current, sessionID)
        item.generation += 1
        item.safe = undefined
        item.pending = undefined
        if (item.active) item.refresh = true
      })
    })

    const invalidate: Interface["invalidate"] = Effect.fn("SessionContinuity.invalidate")(function* (sessionID) {
      yield* advance(sessionID)
      const current = yield* InstanceState.get(state)
      current.contexts.discard(sessionID)
      const item = entry(current, sessionID)
      item.attempted = undefined
      item.refresh = true
    })

    const forget: Interface["forget"] = Effect.fn("SessionContinuity.forget")(function* (sessionID) {
      const current = yield* InstanceState.get(state)
      current.contexts.discard(sessionID)
      current.sessions.delete(sessionID)
    })

    const schedule = (current: State, sessionID: SessionID, message: SessionV1.Assistant): Effect.Effect<void> =>
      Effect.gen(function* () {
        const active = yield* Effect.sync(() => {
          const item = entry(current, sessionID)
          if (item.active || item.safe !== message.id || item.attempted === message.id) return
          if (current.contexts.get(sessionID)?.boundary === message.id) return
          if (!item.refresh && !shouldStart({ tokens: tokenCount(message.tokens), active: false })) return
          const active: Active = { generation: item.generation, boundary: message.id }
          item.active = active
          item.attempted = message.id
          item.pending = undefined
          return active
        })
        if (!active) return

        const finish = Effect.gen(function* () {
          const pending = yield* Effect.sync(() => {
            const item = current.sessions.get(sessionID)
            if (!item || item.active !== active) return
            item.active = undefined
            const pending = item.pending
            item.pending = undefined
            // New users clear the safe boundary; retry only a new completed turn.
            if (!pending || item.safe !== pending.id || item.attempted === pending.id) return
            return pending
          })
          if (pending) yield* schedule(current, sessionID, pending)
        })

        yield* Effect.suspend(() => background.start({
          id: `continuity:${sessionID}:${active.boundary}:${active.generation}`,
          type: "context-continuity",
          title: "Context continuity",
          metadata: { sessionId: sessionID, background: true },
          run: Effect.gen(function* () {
            const history = yield* sessions.messages({ sessionID })
            const selected = yield* Effect.sync(() => {
              const item = current.sessions.get(sessionID)
              if (!item || item.active !== active || item.generation !== active.generation || item.safe !== active.boundary ||
                history.at(-1)?.info.id !== active.boundary) return
              const prepared = current.contexts.prepare(sessionID, history)
              const previous = prepared.system.length ? current.contexts.get(sessionID)?.text : undefined
              return snapshot(sessionID, prepared.messages, previous)
            })
            if (!selected) {
              yield* diagnostic(sessionID, active.boundary, "no-current-snapshot")
              return "discarded"
            }
            const text = yield* run(selected, { provider, llm })
            const latest = (yield* sessions.messages({ sessionID })).at(-1)?.info.id
            const applied = yield* Effect.sync(() => {
              const item = current.sessions.get(sessionID)
              if (!item || !text?.trim() || item.active !== active || item.generation !== active.generation ||
                item.safe !== active.boundary || selected.boundary !== active.boundary || !isCurrent(selected, latest)) return false
              current.contexts.set({ sessionID, boundary: selected.boundary, tailStart: selected.tailStart, text })
              item.refresh = false
              return true
            })
            if (!applied) {
              yield* diagnostic(sessionID, active.boundary, "empty-or-stale-output")
              return "discarded"
            }
            return "applied"
          }).pipe(
            Effect.catchCause((cause) => diagnostic(sessionID, active.boundary,
              Cause.hasInterruptsOnly(cause) ? "cancelled" : "failed",
            ).pipe(Effect.andThen(Cause.hasInterruptsOnly(cause)
              ? Effect.failCause(cause)
              : Effect.fail(new Error("Continuity maintenance failed"))))),
            Effect.ensuring(finish),
          ),
        })).pipe(
          // BackgroundJob carries caller interruptibility into its worker.
          Effect.interruptible,
          Effect.catchCause((cause) => diagnostic(sessionID, active.boundary,
            Cause.hasInterruptsOnly(cause) ? "scheduling-cancelled" : "scheduling-failed",
          ).pipe(Effect.andThen(finish))),
          Effect.asVoid,
        )
      })

    const start: Interface["start"] = Effect.fn("SessionContinuity.start")((input) =>
      Effect.gen(function* () {
        if (!isSafe(input.message) || input.message.sessionID !== input.sessionID) return
        const current = yield* InstanceState.get(state)
        const idle = yield* Effect.sync(() => {
          const item = entry(current, input.sessionID)
          item.safe = input.message.id
          if (item.active) {
            if (item.active.boundary !== input.message.id) {
              item.pending = input.message
              item.refresh = true
            }
            return false
          }
          return true
        })
        if (idle) yield* schedule(current, input.sessionID, input.message)
      }).pipe(
        Effect.uninterruptible,
        Effect.catchCause((cause) => diagnostic(input.sessionID, input.message.id,
          Cause.hasInterruptsOnly(cause) ? "setup-cancelled" : "setup-failed",
        )),
      ),
    )

    return Service.of({ prepare, start, advance, invalidate, forget })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Session.node, BackgroundJob.node, Provider.node, LLM.node],
})

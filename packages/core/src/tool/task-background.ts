export * as TaskBackground from "./task-background"

import { Context, Deferred, Effect, Layer } from "effect"
import { makeGlobalNode } from "../effect/app-node"
import { SessionSchema } from "../session/schema"

export interface Interface {
  /** Waits until the Session's foreground subagents are moved to the background. */
  readonly requested: (sessionID: SessionSchema.ID) => Effect.Effect<void>
  /** Releases every foreground subagent the Session waits on and returns how many it released. */
  readonly request: (sessionID: SessionSchema.ID) => Effect.Effect<number>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/TaskBackground") {}

const layer = Layer.sync(Service, () => {
  const waiting = new Map<SessionSchema.ID, Set<Deferred.Deferred<void>>>()
  return Service.of({
    requested: (sessionID) =>
      Effect.acquireUseRelease(
        Effect.gen(function* () {
          const signal = yield* Deferred.make<void>()
          waiting.set(sessionID, (waiting.get(sessionID) ?? new Set()).add(signal))
          return signal
        }),
        (signal) => Deferred.await(signal),
        (signal) =>
          Effect.sync(() => {
            const signals = waiting.get(sessionID)
            signals?.delete(signal)
            if (signals?.size === 0) waiting.delete(sessionID)
          }),
      ),
    request: Effect.fn("TaskBackground.request")(function* (sessionID) {
      const signals = [...(waiting.get(sessionID) ?? [])]
      waiting.delete(sessionID)
      yield* Effect.forEach(signals, (signal) => Deferred.succeed(signal, undefined), { discard: true })
      return signals.length
    }),
  })
})

export const node = makeGlobalNode({ service: Service, layer, deps: [] })

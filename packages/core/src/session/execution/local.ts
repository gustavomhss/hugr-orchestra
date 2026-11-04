import { Cause, Effect, Layer } from "effect"
import { LocationServiceMap } from "../../location-service-map"
import { makeGlobalNode } from "../../effect/app-node"
import { SessionRunCoordinator } from "../run-coordinator"
import { SessionRunner } from "../runner"
import { SessionSchema } from "../schema"
import { SessionStore } from "../store"
import { SessionExecution } from "../execution"

/** Current-process routing for implicit-local Locations. Future remote placement belongs here. */
const layer = Layer.effect(
  SessionExecution.Service,
  Effect.gen(function* () {
    const store = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const coordinator = yield* SessionRunCoordinator.make<SessionSchema.ID, SessionRunner.RunError>({
      drain: Effect.fnUntraced(function* (sessionID: SessionSchema.ID, force) {
        const session = yield* store.get(sessionID)
        // A coalesced wake can outlive its Session (removal interrupts, then deletes); only an explicit run is a defect.
        if (!session && !force) return
        if (!session) return yield* Effect.die(`Session not found: ${sessionID}`)
        return yield* SessionRunner.Service.use((runner) => runner.run({ sessionID, force })).pipe(
          Effect.provide(locations.get(session.location)),
          Effect.mapError((error) => error as SessionRunner.RunError),
          Effect.tapCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : Effect.logError("Failed to drain Session", cause).pipe(Effect.annotateLogs({ sessionID })),
          ),
        )
      }),
    })

    return SessionExecution.Service.of({
      active: coordinator.active,
      interrupt: coordinator.interrupt,
      resume: (sessionID, options) => coordinator.run(sessionID, options),
      wake: coordinator.wake,
      exclusive: coordinator.exclusive,
      withRunner: <A, E>(sessionID: SessionSchema.ID, use: (runner: SessionRunner.Interface) => Effect.Effect<A, E>) =>
        Effect.gen(function* () {
          const session = yield* store.get(sessionID)
          if (!session) return yield* Effect.die(`Session not found: ${sessionID}`)
          return yield* SessionRunner.Service.use(use).pipe(
            Effect.provide(locations.get(session.location)),
            Effect.mapError((error) => error as E),
          )
        }) as Effect.Effect<A, E, never>,
    })
  }),
)

export const node = makeGlobalNode({
  service: SessionExecution.Service,
  layer,
  deps: [SessionStore.node, LocationServiceMap.node],
})

export * as SessionExecutionLocal from "./local"

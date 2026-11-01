import { describe, expect } from "bun:test"
import { Effect, Fiber, Layer, Queue, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { ProjectV2 } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionRunCoordinator } from "@orchestra/core/session/run-coordinator"
import { testEffect } from "./lib/effect"

const projects = Layer.succeed(
  ProjectV2.Service,
  ProjectV2.Service.of({
    resolve: () => Effect.succeed({ id: ProjectV2.ID.global, directory: AbsolutePath.make("/project") }),
    list: () => Effect.succeed([]),
    directories: () => Effect.succeed([]),
    commit: () => Effect.void,
  }),
)
const nodes = LayerNode.group([Database.node, EventV2.node, SessionV2.node])
const it = testEffect(
  AppNodeBuilder.build(nodes, [
    [ProjectV2.node, projects],
    [SessionExecution.node, SessionExecution.noopLayer],
  ]),
)
const location = Location.Ref.make({ directory: AbsolutePath.make("/project") })

/** Every drain blocks until interrupted; `wakeAfterInterrupt` simulates a prompt that lands right after a stop. */
const gated = Effect.fnUntraced(function* (log: string[], options: { wakeAfterInterrupt: boolean }) {
  const started = yield* Queue.unbounded<SessionV2.ID>()
  const layer = Layer.effect(
    SessionExecution.Service,
    Effect.gen(function* () {
      const coordinator = yield* SessionRunCoordinator.make<SessionV2.ID, never>({
        drain: (sessionID) =>
          Effect.sync(() => log.push(`drain ${sessionID}`)).pipe(
            Effect.andThen(Queue.offer(started, sessionID)),
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Effect.sync(() => log.push(`interrupted ${sessionID}`))),
          ),
      })
      let woken = !options.wakeAfterInterrupt
      return SessionExecution.Service.of({
        active: coordinator.active,
        resume: coordinator.run,
        wake: coordinator.wake,
        interrupt: (sessionID) =>
          coordinator.interrupt(sessionID).pipe(
            Effect.andThen(
              Effect.suspend(() => {
                if (woken) return Effect.void
                woken = true
                // Hold the stop until the racing drain runs, so the race is not a matter of scheduling.
                return coordinator.wake(sessionID).pipe(Effect.andThen(Queue.take(started)), Effect.asVoid)
              }),
            ),
          ),
        exclusive: coordinator.exclusive,
        withRunner: () => Effect.die("unused"),
      })
    }),
  )
  return { started, layer }
})

const provide = (execution: Layer.Layer<SessionExecution.Service>) =>
  Effect.provide(
    Layer.fresh(
      AppNodeBuilder.build(nodes, [
        [ProjectV2.node, projects],
        [SessionExecution.node, execution],
      ]),
    ),
  )

describe("SessionV2 stops runs on archive and remove", () => {
  it.live("remove stops a drain that a racing wake started before the delete; nothing runs after Deleted", () =>
    Effect.gen(function* () {
      const log: string[] = []
      const execution = yield* gated(log, { wakeAfterInterrupt: true })
      yield* Effect.gen(function* () {
        const session = yield* SessionV2.Service
        const events = yield* EventV2.Service
        const unsubscribe = yield* events.listen((event) =>
          Effect.sync(() => {
            if (Schema.is(SessionEvent.Deleted)(event)) log.push("deleted")
          }),
        )
        yield* Effect.addFinalizer(() => unsubscribe)
        const created = yield* session.create({ location })
        yield* session.remove(created.id)
        expect(yield* session.active).toEqual(new Set())
        // The racing wake's drain was interrupted before the row was deleted, and none started after.
        expect(log).toEqual([`drain ${created.id}`, `interrupted ${created.id}`, "deleted"])
      }).pipe(provide(execution.layer))
    }),
  )

  it.live("removing a parent interrupts the active drain of its child", () =>
    Effect.gen(function* () {
      const log: string[] = []
      const execution = yield* gated(log, { wakeAfterInterrupt: false })
      yield* Effect.gen(function* () {
        const session = yield* SessionV2.Service
        const parent = yield* session.create({ location })
        const child = yield* session.create({ location, parentID: parent.id })
        const grandchild = yield* session.create({ location, parentID: child.id })
        const owner = yield* session.resume(grandchild.id).pipe(Effect.forkChild)
        yield* Queue.take(execution.started)
        expect(yield* session.active).toEqual(new Set([grandchild.id]))
        yield* session.remove(parent.id)
        expect(yield* session.active).toEqual(new Set())
        expect(log).toEqual([`drain ${grandchild.id}`, `interrupted ${grandchild.id}`])
        yield* Fiber.await(owner)
        expect((yield* session.get(grandchild.id).pipe(Effect.flip))._tag).toBe("Session.NotFoundError")
      }).pipe(provide(execution.layer))
    }),
  )

  it.live("archiving stops a drain that a racing wake started after the interrupt", () =>
    Effect.gen(function* () {
      const log: string[] = []
      const execution = yield* gated(log, { wakeAfterInterrupt: true })
      yield* Effect.gen(function* () {
        const session = yield* SessionV2.Service
        const created = yield* session.create({ location })
        yield* session.archive({ sessionID: created.id, archived: true })
        expect(yield* session.active).toEqual(new Set())
        expect(log).toEqual([`drain ${created.id}`, `interrupted ${created.id}`])
      }).pipe(provide(execution.layer))
    }),
  )
})

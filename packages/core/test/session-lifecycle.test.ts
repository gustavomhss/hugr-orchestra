import { expect } from "bun:test"
import { Deferred, Effect, Fiber, Layer } from "effect"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { ProjectV2 } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionTable } from "@orchestra/core/session/sql"
import { testEffect } from "./lib/effect"

const location = Location.Ref.make({ directory: AbsolutePath.make("/project") })

testEffect(Layer.empty).live("child creation revalidates a parent deleted during project resolution", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const project = { id: ProjectV2.ID.global, directory: AbsolutePath.make("/project") }
    let calls = 0
    const projects = Layer.succeed(ProjectV2.Service, ProjectV2.Service.of({
      resolve: () => Effect.gen(function* () {
        if (++calls === 2) {
          yield* Deferred.succeed(entered, undefined)
          yield* Deferred.await(release)
        }
        return project
      }),
      list: () => Effect.succeed([]), directories: () => Effect.succeed([]), commit: () => Effect.void,
    }))
    yield* Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const { db } = yield* Database.Service
      const parent = yield* session.create({ location })
      const child = yield* session.create({ location, parentID: parent.id }).pipe(Effect.exit, Effect.forkScoped)
      yield* Deferred.await(entered)
      yield* session.remove(parent.id)
      const unrelated = yield* session.create({ location })
      expect((yield* session.get(unrelated.id)).id).toBe(unrelated.id)
      yield* Deferred.succeed(release, undefined)
      const outcome = yield* Fiber.join(child)
      const rows = yield* db.select().from(SessionTable).all().pipe(Effect.orDie)
      expect(rows.every((row) => !row.parent_id || rows.some((parent) => parent.id === row.parent_id))).toBe(true)
      expect(outcome._tag).toBe("Failure")
    }).pipe(Effect.provide(AppNodeBuilder.build(
      LayerNode.group([Database.node, EventV2.node, SessionV2.node]),
      [[ProjectV2.node, projects], [SessionExecution.node, SessionExecution.noopLayer]],
    )))
  }),
)

// Admit a new branch precisely after remove's first descendant snapshot, while it interrupts the root.
testEffect(Layer.empty).live("remove stops children admitted during its initial stop before deleting them", () =>
  Effect.gen(function* () {
    const interrupted: SessionV2.ID[] = []
    let onInterrupt = (_id: SessionV2.ID): Effect.Effect<void> => Effect.void
    const execution = Layer.succeed(SessionExecution.Service, SessionExecution.Service.of({
      active: Effect.succeed(new Set()), wake: () => Effect.void, resume: () => Effect.void,
      interrupt: (id) => Effect.sync(() => interrupted.push(id)).pipe(Effect.andThen(Effect.suspend(() => onInterrupt(id)))),
      exclusive: (_, effect) => Effect.asSome(effect), withRunner: () => Effect.die("unused"),
    }))
    const projects = Layer.succeed(ProjectV2.Service, ProjectV2.Service.of({
      resolve: () => Effect.succeed({ id: ProjectV2.ID.global, directory: location.directory }),
      list: () => Effect.succeed([]), directories: () => Effect.succeed([]), commit: () => Effect.void,
    }))
    yield* Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const { db } = yield* Database.Service
      const root = yield* session.create({ location })
      const arrivals: SessionV2.ID[] = []
      onInterrupt = () => Effect.gen(function* () {
        onInterrupt = () => Effect.void
        const child = yield* session.create({ location, parentID: root.id })
        const grandchild = yield* session.create({ location, parentID: child.id })
        arrivals.push(child.id, grandchild.id)
      }).pipe(Effect.orDie)
      yield* session.remove(root.id)
      expect(interrupted).toEqual([root.id, root.id, ...arrivals])
      expect(yield* db.select().from(SessionTable).all().pipe(Effect.orDie)).toEqual([])
    }).pipe(Effect.provide(AppNodeBuilder.build(
      LayerNode.group([Database.node, EventV2.node, SessionV2.node, SessionExecution.node]),
      [[ProjectV2.node, projects], [SessionExecution.node, execution]],
    )))
  }),
)

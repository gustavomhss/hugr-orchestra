import { expect } from "bun:test"
import { ToolCall } from "@orchestra/llm"
import { eq } from "drizzle-orm"
import { Cause, Context, Deferred, Effect, Fiber, Layer, Option, Queue, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { ProjectV2 } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionRunCoordinator } from "@orchestra/core/session/run-coordinator"
import { SessionInputTable, SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { Tool } from "@orchestra/core/tool/tool"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

it.live("CONTROL L1: an independent child's real tool reaches its effect after its gate opens", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const parent = yield* sessions.create({ location: f.location })
      const child = yield* sessions.create({ location: f.location, parentID: parent.id })
      const running = yield* sessions.resume(child.id).pipe(Effect.forkChild)
      expect(yield* Queue.take(f.started)).toBe(child.id)
      expect((yield* sessions.active).has(child.id)).toBe(true)
      expect(yield* Effect.promise(() => Bun.file(f.marker).text())).toBe("untouched")
      yield* Deferred.succeed(f.toolRelease, undefined)
      yield* Fiber.join(running)
      expect(yield* Effect.promise(() => Bun.file(f.marker).text())).toBe("tool completed")
      yield* sessions.remove(parent.id)
      expect(yield* sessions.active).toEqual(new Set())
    }).pipe(Effect.ensuring(f.release()), Effect.provide(f.layer))
  }),
)

it.live("CONTROL L1: outside removal an existing Session ID still adopts its recorded parent", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const parent = yield* sessions.create({ location: f.location })
      const child = yield* sessions.create({ location: f.location, parentID: parent.id })
      const adopted = yield* sessions.create({
        id: child.id,
        location: f.location,
        parentID: SessionV2.ID.make("ses_not_the_recorded_parent"),
      })
      expect(adopted).toEqual(child)
      expect(adopted.parentID).toBe(parent.id)
    }).pipe(Effect.ensuring(f.release()), Effect.provide(f.layer))
  }),
)

it.live("removal cannot return while a child admitted after enumeration still owns a late tool effect", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const database = yield* Database.Service
      const parent = yield* sessions.create({ location: f.location })
      f.state.removing = parent.id
      const removing = yield* sessions.remove(parent.id).pipe(Effect.forkChild)
      // The delegate is the actual coordinator interrupt, paused at the old enumeration/hold boundary.
      yield* Deferred.await(f.removeEntered)
      const child = yield* sessions.create({ location: f.location, parentID: parent.id }).pipe(Effect.result)
      if (child._tag === "Failure") {
        expect(child.failure).toMatchObject({ _tag: "Session.NotFoundError", sessionID: parent.id })
        yield* Deferred.succeed(f.removeRelease, undefined)
        yield* Fiber.join(removing)
        expect(yield* sessions.active).toEqual(new Set())
        expect(yield* Effect.promise(() => Bun.file(f.marker).text())).toBe("untouched")
        return
      }
      const running = yield* sessions.resume(child.success.id).pipe(Effect.exit, Effect.forkChild)
      expect(yield* Queue.take(f.started)).toBe(child.success.id)
      expect((yield* sessions.active).has(child.success.id)).toBe(true)
      yield* Deferred.succeed(f.removeRelease, undefined)
      yield* Fiber.join(removing)
      const activeAtReturn = yield* sessions.active
      const rows = yield* database.db
        .select()
        .from(SessionTable)
        .where(eq(SessionTable.id, child.success.id))
        .all()
        .pipe(Effect.orDie)
      yield* Deferred.succeed(f.toolRelease, undefined)
      yield* Fiber.join(running)
      expect(rows).toEqual([])
      expect(activeAtReturn.has(child.success.id)).toBe(false)
      expect(yield* Effect.promise(() => Bun.file(f.marker).text())).toBe("untouched")
    }).pipe(Effect.ensuring(f.release()), Effect.provide(f.layer))
  }),
)

it.live("a child creation paused after parent lookup cannot publish an orphan after removal", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const database = yield* Database.Service
      const parent = yield* sessions.create({ location: f.location })
      const childID = SessionV2.ID.create()
      f.state.pauseProject = true
      const creating = yield* sessions
        .create({ id: childID, location: f.location, parentID: parent.id })
        .pipe(Effect.result, Effect.forkChild)
      yield* Deferred.await(f.projectEntered)
      yield* sessions.remove(parent.id)
      expect(yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, parent.id)).all()).toEqual([])
      yield* Deferred.succeed(f.projectRelease, undefined)
      const result = yield* Fiber.join(creating)
      expect(yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, childID)).all()).toEqual([])
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "Session.NotFoundError", sessionID: parent.id },
      })
    }).pipe(Effect.ensuring(f.release()), Effect.provide(f.layer))
  }),
)

it.live("a stored ID is not adopted while its removal is held", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const parent = yield* sessions.create({ location: f.location })
      f.state.removing = parent.id
      const removing = yield* sessions.remove(parent.id).pipe(Effect.forkChild)
      yield* Deferred.await(f.removeEntered)
      const adopted = yield* sessions.create({ id: parent.id, location: f.location }).pipe(Effect.result)
      yield* Deferred.succeed(f.removeRelease, undefined)
      yield* Fiber.join(removing)
      expect(adopted).toMatchObject({
        _tag: "Failure",
        failure: {
          _tag: "Session.NotFoundError",
          sessionID: parent.id,
        },
      })
    }).pipe(Effect.ensuring(f.release()), Effect.provide(f.layer))
  }),
)

for (const first of ["parent", "child"] as const) {
  it.live(`overlapping removals reject before the held ${first} removal can finish`, () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      yield* Effect.gen(function* () {
        const sessions = yield* SessionV2.Service
        const parent = yield* sessions.create({ location: f.location })
        const child = yield* sessions.create({ location: f.location, parentID: parent.id })
        const firstID = first === "parent" ? parent.id : child.id
        const secondID = first === "parent" ? child.id : parent.id
        f.state.removing = firstID
        const removing = yield* sessions.remove(firstID).pipe(Effect.exit, Effect.forkChild)
        yield* Deferred.await(f.removeEntered)
        const overlapping = yield* sessions.remove(secondID).pipe(Effect.exit, Effect.forkChild)
        // Only the observer times out; the independently owned operation is still joined after releasing its gate.
        const beforeRelease = yield* Fiber.await(overlapping).pipe(Effect.timeoutOption("500 millis"))
        const retained = yield* sessions.create({ id: child.id, location: f.location }).pipe(Effect.result)
        yield* Deferred.succeed(f.removeRelease, undefined)
        const firstResult = yield* Fiber.join(removing)
        const result = yield* Fiber.join(overlapping)
        expect(Option.isSome(beforeRelease)).toBe(true)
        expect(firstResult._tag).toBe("Success")
        expect(result._tag === "Failure" && Cause.squash(result.cause)).toMatchObject({
          _tag: "Session.NotFoundError",
          sessionID: secondID,
        })
        expect(retained).toMatchObject({
          _tag: "Failure",
          failure: {
            _tag: "Session.NotFoundError",
            sessionID: child.id,
          },
        })
      }).pipe(Effect.ensuring(f.release()), Effect.provide(f.layer))
    }),
  )
}

it.live("a held removal does not block creation in an unrelated tree", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const parent = yield* sessions.create({ location: f.location })
      const unrelated = yield* sessions.create({ location: f.location })
      f.state.removing = parent.id
      const removing = yield* sessions.remove(parent.id).pipe(Effect.forkChild)
      yield* Deferred.await(f.removeEntered)
      const creating = yield* sessions.create({ location: f.location, parentID: unrelated.id }).pipe(Effect.forkChild)
      const beforeRelease = yield* Fiber.await(creating).pipe(Effect.timeoutOption("500 millis"))
      yield* Deferred.succeed(f.removeRelease, undefined)
      yield* Fiber.join(removing)
      const child = yield* Fiber.join(creating)
      expect(Option.isSome(beforeRelease)).toBe(true)
      expect(child.parentID).toBe(unrelated.id)
      expect((yield* sessions.get(child.id)).parentID).toBe(unrelated.id)
    }).pipe(Effect.ensuring(f.release()), Effect.provide(f.layer))
  }),
)

it.live("caller cancellation retains closing admission until the destructive owner actually finishes", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const cancelRequested = yield* Deferred.make<void>()
    const progress = { afterGate: 0 }
    yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const database = yield* Database.Service
      const parent = yield* sessions.create({ location: f.location })
      f.state.beforeDelete = (sessionID) =>
        sessionID !== parent.id
          ? Effect.void
          : Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.andThen(
                Effect.sync(() => {
                  progress.afterGate++
                }),
              ),
            )
      const removing = yield* sessions.remove(parent.id).pipe(Effect.forkChild)
      const boundary = yield* Deferred.await(entered).pipe(
        Effect.as("entered"),
        Effect.raceFirst(
          Fiber.await(removing).pipe(
            Effect.map((exit) =>
              exit._tag === "Failure" ? Cause.pretty(exit.cause) : "remove returned before Deleted",
            ),
          ),
        ),
        Effect.timeoutOption("2 seconds"),
      )
      expect(boundary).toEqual(Option.some("entered"))
      expect((yield* sessions.active).has(parent.id)).toBe(true)
      const cancelling = yield* Deferred.succeed(cancelRequested, undefined).pipe(
        Effect.andThen(Fiber.interrupt(removing)),
        Effect.forkChild({ startImmediately: true }),
      )
      yield* Deferred.await(cancelRequested)
      // This observes cancellation completion, not elapsed time as a substitute for reaching the delete boundary.
      const early = yield* Fiber.await(cancelling).pipe(Effect.timeoutOption("100 millis"))
      const adopted = yield* sessions.create({ id: parent.id, location: f.location }).pipe(Effect.result)
      const child = yield* sessions.create({ location: f.location, parentID: parent.id }).pipe(Effect.result)
      const messageID = SessionMessage.ID.create()
      const admitted = yield* sessions
        .prompt({
          id: messageID,
          sessionID: parent.id,
          prompt: { text: "must stay outside closing admission" },
          resume: false,
        })
        .pipe(Effect.result)
      const inputBeforeRelease = yield* database.db
        .select()
        .from(SessionInputTable)
        .where(eq(SessionInputTable.id, messageID))
        .all()
        .pipe(Effect.orDie)
      const afterGateBeforeRelease = progress.afterGate
      const activeBeforeRelease = yield* sessions.active
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(cancelling)
      const exit = yield* Fiber.await(removing)
      // A waiter may observe cancellation while the old implementation's detached owner is still settling.
      yield* f.coordinator.exclusive(parent.id, Effect.void, { wait: true })
      expect(Option.isNone(early)).toBe(true)
      expect(activeBeforeRelease.has(parent.id)).toBe(true)
      expect(afterGateBeforeRelease).toBe(0)
      for (const result of [adopted, child, admitted])
        expect(result).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "Session.NotFoundError", sessionID: parent.id },
        })
      expect(inputBeforeRelease).toEqual([])
      expect(exit._tag === "Failure" && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
      expect(progress.afterGate).toBe(1)
      expect(yield* sessions.active).toEqual(new Set())
      expect((yield* sessions.get(parent.id).pipe(Effect.result))._tag).toBe("Failure")
      // Cleanup also frees this exact identity for a later deliberate creation.
      expect((yield* sessions.create({ id: parent.id, location: f.location })).id).toBe(parent.id)
    }).pipe(
      Effect.ensuring(Deferred.succeed(release, undefined)),
      Effect.ensuring(f.release()),
      Effect.provide(f.layer),
    )
  }),
)

it.live("a failed removal cleans only its own tokens while another destructive owner is held", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const failure = new Error("before-delete acquisition failed")
    yield* Effect.gen(function* () {
      const sessions = yield* SessionV2.Service
      const held = yield* sessions.create({ location: f.location })
      const failing = yield* sessions.create({ location: f.location })
      f.state.beforeDelete = (sessionID) => {
        if (sessionID === held.id)
          return Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))
        if (sessionID === failing.id) return Effect.die(failure)
        return Effect.void
      }
      const removing = yield* sessions.remove(held.id).pipe(Effect.exit, Effect.forkChild)
      const boundary = yield* Deferred.await(entered).pipe(
        Effect.as("entered"),
        Effect.raceFirst(
          Fiber.join(removing).pipe(
            Effect.map((exit) =>
              exit._tag === "Failure" ? Cause.pretty(exit.cause) : "remove returned before Deleted",
            ),
          ),
        ),
        Effect.timeoutOption("2 seconds"),
      )
      expect(boundary).toEqual(Option.some("entered"))
      const failed = yield* sessions.remove(failing.id).pipe(Effect.exit)
      const adopted = yield* sessions.create({ id: failing.id, location: f.location })
      const newChild = yield* sessions.create({ location: f.location, parentID: failing.id })
      const heldAdoption = yield* sessions.create({ id: held.id, location: f.location }).pipe(Effect.result)
      const heldChild = yield* sessions.create({ location: f.location, parentID: held.id }).pipe(Effect.result)
      const activeBeforeRelease = yield* sessions.active
      yield* Deferred.succeed(release, undefined)
      const completed = yield* Fiber.join(removing)
      expect(failed._tag === "Failure" && Cause.squash(failed.cause)).toBe(failure)
      expect(adopted.id).toBe(failing.id)
      expect(newChild.parentID).toBe(failing.id)
      expect(activeBeforeRelease.has(held.id)).toBe(true)
      for (const result of [heldAdoption, heldChild])
        expect(result).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "Session.NotFoundError", sessionID: held.id },
        })
      expect(completed._tag).toBe("Success")
      expect((yield* sessions.get(held.id).pipe(Effect.result))._tag).toBe("Failure")
      expect((yield* sessions.get(failing.id)).id).toBe(failing.id)
      expect((yield* sessions.get(newChild.id)).parentID).toBe(failing.id)
    }).pipe(
      Effect.ensuring(Deferred.succeed(release, undefined)),
      Effect.ensuring(f.release()),
      Effect.provide(f.layer),
    )
  }),
)

it.live("an explicit resume whose row vanishes after validation fails typed before placement lookup", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.gen(function* () {
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      const store = yield* SessionStore.Service
      const locations = yield* LocationServiceMap.Service
      const placements = { lookups: 0 }
      const capturedLocations = Layer.succeed(LocationServiceMap.Service, {
        ...locations,
        get: (ref) => {
          placements.lookups++
          return locations.get(ref)
        },
      })
      const replacements = [
        [Database.node, Layer.succeed(Database.Service, database)],
        [EventV2.node, Layer.succeed(EventV2.Service, events)],
        [SessionStore.node, Layer.succeed(SessionStore.Service, store)],
        [LocationServiceMap.node, capturedLocations],
        [ProjectV2.node, f.projects],
      ] as const
      const local = Context.get(
        yield* Layer.build(AppNodeBuilder.build(SessionExecutionLocal.node, replacements).pipe(Layer.fresh)),
        SessionExecution.Service,
      )
      expect(local).not.toBe(yield* SessionExecution.Service)
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const decorated = Layer.succeed(
        SessionExecution.Service,
        SessionExecution.Service.of({
          ...local,
          resume: (sessionID, options) =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.andThen(local.resume(sessionID, options)),
            ),
        }),
      )
      const sessions = Context.get(
        yield* Layer.build(
          AppNodeBuilder.build(SessionV2.node, [...replacements, [SessionExecution.node, decorated]]).pipe(Layer.fresh),
        ),
        SessionV2.Service,
      )
      expect(sessions).not.toBe(yield* SessionV2.Service)
      yield* Effect.gen(function* () {
        const created = yield* sessions.create({ location: f.location })
        placements.lookups = 0
        const running = yield* sessions
          .resume(created.id)
          .pipe(Effect.matchCause({ onSuccess: () => undefined, onFailure: Cause.squash }), Effect.forkChild)
        yield* Deferred.await(entered)
        yield* sessions.remove(created.id)
        yield* Deferred.succeed(release, undefined)
        const failure = yield* Fiber.join(running)
        expect(failure).toMatchObject({ _tag: "Session.NotFoundError", sessionID: created.id })
        expect(placements.lookups).toBe(0)
        expect(yield* local.active).toEqual(new Set())
      }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)))
    }).pipe(Effect.ensuring(f.release()), Effect.provide(f.layer))
  }),
)

function fixture() {
  return Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const marker = `${tmp.path}/effect.txt`
    yield* Effect.promise(() => Bun.write(marker, "untouched"))
    const location = Location.Ref.make({ directory: AbsolutePath.make(tmp.path) })
    const removeEntered = yield* Deferred.make<void>()
    const removeRelease = yield* Deferred.make<void>()
    const projectEntered = yield* Deferred.make<void>()
    const projectRelease = yield* Deferred.make<void>()
    const toolRelease = yield* Deferred.make<void>()
    const started = yield* Queue.unbounded<SessionV2.ID>()
    const state = {
      removing: undefined as SessionV2.ID | undefined,
      pauseProject: false,
      beforeDelete: undefined as ((sessionID: SessionV2.ID) => Effect.Effect<void>) | undefined,
    }
    const database = Context.get(yield* Layer.build(Database.layerFromPath(":memory:")), Database.Service)
    const databaseLayer = Layer.succeed(Database.Service, database)
    const events = Context.get(
      yield* Layer.build(AppNodeBuilder.build(EventV2.node, [[Database.node, databaseLayer]]).pipe(Layer.fresh)),
      EventV2.Service,
    )
    const observedEvents = Layer.succeed(
      EventV2.Service,
      EventV2.Service.of({
        ...events,
        // Observe before the real publish begins: no transaction or projector is held while the test gate waits.
        publish: (definition, data, options) =>
          Effect.gen(function* () {
            if (definition.type === SessionEvent.Deleted.type && state.beforeDelete) {
              const deleted = Schema.decodeUnknownSync(Schema.toType(SessionEvent.Deleted.data))(data)
              yield* state.beforeDelete(deleted.sessionID)
            }
            return yield* events.publish(definition, data, options)
          }),
      }),
    )
    const tool = Tool.make({
      description: "Lifecycle acceptance effect",
      input: Schema.Struct({}),
      output: Schema.Struct({}),
      execute: (_, context) =>
        Queue.offer(started, context.sessionID).pipe(
          Effect.andThen(Deferred.await(toolRelease)),
          Effect.andThen(Effect.promise(() => Bun.write(marker, "tool completed"))),
          Effect.as({}),
        ),
    })
    const coordinator = yield* SessionRunCoordinator.make<SessionV2.ID, never>({
      drain: (sessionID) =>
        Tool.settle(
          tool,
          ToolCall.make({
            type: "tool-call",
            id: "call_lifecycle",
            name: "lifecycle",
            input: {},
          }),
          {
            sessionID,
            agent: AgentV2.ID.make("general"),
            assistantMessageID: SessionMessage.ID.make("msg_lifecycle"),
            toolCallID: "call_lifecycle",
          },
        ).pipe(Effect.orDie, Effect.asVoid),
    })
    const execution = Layer.succeed(
      SessionExecution.Service,
      SessionExecution.Service.of({
        active: coordinator.active,
        resume: coordinator.run,
        wake: coordinator.wake,
        interrupt: (sessionID, options) =>
          Effect.gen(function* () {
            if (state.removing === sessionID) {
              yield* Deferred.succeed(removeEntered, undefined)
              yield* Deferred.await(removeRelease)
            }
            yield* coordinator.interrupt(sessionID, options)
          }),
        exclusive: coordinator.exclusive,
        withRunner: () => Effect.die("Lifecycle fixture does not resolve providers"),
      }),
    )
    const projects = Layer.succeed(
      ProjectV2.Service,
      ProjectV2.Service.of({
        resolve: (directory) =>
          Effect.gen(function* () {
            if (state.pauseProject) {
              yield* Deferred.succeed(projectEntered, undefined)
              yield* Deferred.await(projectRelease)
            }
            return { id: ProjectV2.ID.global, directory }
          }),
        list: () => Effect.succeed([]),
        directories: () => Effect.succeed([]),
        commit: () => Effect.void,
      }),
    )
    const layer = AppNodeBuilder.build(
      LayerNode.group([
        Database.node,
        EventV2.node,
        SessionExecution.node,
        SessionV2.node,
        SessionStore.node,
        LocationServiceMap.node,
      ]),
      [
        [Database.node, databaseLayer],
        [EventV2.node, observedEvents],
        [ProjectV2.node, projects],
        [SessionExecution.node, execution],
      ],
    )
    const release = () =>
      Effect.all(
        [
          Deferred.succeed(removeRelease, undefined),
          Deferred.succeed(projectRelease, undefined),
          Deferred.succeed(toolRelease, undefined),
        ],
        { discard: true },
      )
    return {
      layer,
      projects,
      coordinator,
      location,
      marker,
      state,
      removeEntered,
      removeRelease,
      projectEntered,
      projectRelease,
      toolRelease,
      started,
      release,
    }
  })
}

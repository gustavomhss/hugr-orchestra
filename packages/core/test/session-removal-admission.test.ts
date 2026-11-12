import { expect } from "bun:test"
import { ToolCall } from "@orchestra/llm"
import { eq } from "drizzle-orm"
import { Deferred, Effect, Fiber, Layer, Queue, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { ProjectV2 } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionRunCoordinator } from "@orchestra/core/session/run-coordinator"
import { SessionTable } from "@orchestra/core/session/sql"
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
      const rows = yield* database.db.select().from(SessionTable)
        .where(eq(SessionTable.id, child.success.id)).all().pipe(Effect.orDie)
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
      const creating = yield* sessions.create({ id: childID, location: f.location, parentID: parent.id })
        .pipe(Effect.result, Effect.forkChild)
      yield* Deferred.await(f.projectEntered)
      yield* sessions.remove(parent.id)
      expect(yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, parent.id)).all()).toEqual([])
      yield* Deferred.succeed(f.projectRelease, undefined)
      const result = yield* Fiber.join(creating)
      expect(yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, childID)).all()).toEqual([])
      expect(result).toMatchObject({ _tag: "Failure", failure: { _tag: "Session.NotFoundError", sessionID: parent.id } })
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
    const state = { removing: undefined as SessionV2.ID | undefined, pauseProject: false }
    const tool = Tool.make({
      description: "Lifecycle acceptance effect",
      input: Schema.Struct({}),
      output: Schema.Struct({}),
      execute: (_, context) => Queue.offer(started, context.sessionID).pipe(
        Effect.andThen(Deferred.await(toolRelease)),
        Effect.andThen(Effect.promise(() => Bun.write(marker, "tool completed"))),
        Effect.as({}),
      ),
    })
    const coordinator = yield* SessionRunCoordinator.make<SessionV2.ID, never>({
      drain: (sessionID) => Tool.settle(tool, ToolCall.make({
        type: "tool-call", id: "call_lifecycle", name: "lifecycle", input: {},
      }), {
        sessionID, agent: AgentV2.ID.make("general"),
        assistantMessageID: SessionMessage.ID.make("msg_lifecycle"), toolCallID: "call_lifecycle",
      }).pipe(Effect.orDie, Effect.asVoid),
    })
    const execution = Layer.succeed(SessionExecution.Service, SessionExecution.Service.of({
      active: coordinator.active,
      resume: coordinator.run,
      wake: coordinator.wake,
      interrupt: (sessionID, options) => Effect.gen(function* () {
        if (state.removing === sessionID) {
          yield* Deferred.succeed(removeEntered, undefined)
          yield* Deferred.await(removeRelease)
        }
        yield* coordinator.interrupt(sessionID, options)
      }),
      exclusive: coordinator.exclusive,
      withRunner: () => Effect.die("Lifecycle fixture does not resolve providers"),
    }))
    const projects = Layer.succeed(ProjectV2.Service, ProjectV2.Service.of({
      resolve: (directory) => Effect.gen(function* () {
        if (state.pauseProject) {
          yield* Deferred.succeed(projectEntered, undefined)
          yield* Deferred.await(projectRelease)
        }
        return { id: ProjectV2.ID.global, directory }
      }),
      list: () => Effect.succeed([]), directories: () => Effect.succeed([]), commit: () => Effect.void,
    }))
    const layer = AppNodeBuilder.build(LayerNode.group([
      Database.node, EventV2.node, SessionExecution.node, SessionV2.node,
    ]), [
      [Database.node, Database.layerFromPath(":memory:")],
      [ProjectV2.node, projects], [SessionExecution.node, execution],
    ])
    const release = () => Effect.all([
      Deferred.succeed(removeRelease, undefined), Deferred.succeed(projectRelease, undefined),
      Deferred.succeed(toolRelease, undefined),
    ], { discard: true })
    return { layer, location, marker, state, removeEntered, removeRelease, projectEntered, projectRelease,
      toolRelease, started, release }
  })
}

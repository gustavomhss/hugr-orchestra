import { $ } from "bun"
import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { DateTime, Deferred, Effect, Fiber, Layer, Schema } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath, NonNegativeInt, RelativePath } from "@orchestra/core/schema"
import { Session } from "@orchestra/schema/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { SessionRunner } from "@orchestra/core/session/runner"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionInput } from "@orchestra/core/session/input"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionRunCoordinator } from "@orchestra/core/session/run-coordinator"
import { SessionRevert } from "../src/session/revert"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { Snapshot } from "@orchestra/core/snapshot"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const encode = Schema.encodeSync(SessionMessage.Message)
const model = { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }
const created = DateTime.makeUnsafe(0)
const sessionID = Session.ID.make("ses_revert_files")

const layer = (data: string, directory: string) =>
  AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionProjector.node, Snapshot.node]), [
    [Location.node, Location.boundNode(Location.Ref.make({ directory: AbsolutePath.make(directory) }))],
    [Global.node, Global.layerWith({ data, config: path.join(data, "config") })],
  ])

describe("SessionRevert", () => {
  testEffect(Layer.empty).live("recomputes an omitted file list and does not recompute a stored empty one", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) =>
        Effect.gen(function* () {
          const project = path.join(tmp.path, "project")
          yield* Effect.promise(async () => {
            await fs.mkdir(project, { recursive: true })
            await fs.writeFile(path.join(project, "omitted.txt"), "one\n")
            await fs.writeFile(path.join(project, "listed.txt"), "one\n")
            await $`git init`.cwd(project).quiet()
            await $`git config core.fsmonitor false`.cwd(project).quiet()
            await $`git config commit.gpgsign false`.cwd(project).quiet()
            await $`git config user.email test@orchestra.test`.cwd(project).quiet()
            await $`git config user.name Test`.cwd(project).quiet()
            await $`git add .`.cwd(project).quiet()
            await $`git commit -m initial`.cwd(project).quiet()
          })
          yield* Effect.gen(function* () {
            const snapshot = yield* Snapshot.Service
            const start = yield* captured(snapshot)
            yield* Effect.promise(() => fs.writeFile(path.join(project, "omitted.txt"), "two\n"))
            const omittedEnd = yield* captured(snapshot)
            expect(yield* snapshot.files({ from: start, to: omittedEnd })).toEqual([RelativePath.make("omitted.txt")])
            yield* Effect.promise(() => fs.writeFile(path.join(project, "listed.txt"), "two\n"))
            const listedEnd = yield* captured(snapshot)
            yield* stored(project)
            yield* assistant(2, "msg_omitted", { start, end: omittedEnd })
            yield* assistant(4, "msg_listed", { start, end: listedEnd, files: [] })
            const session = info(project)
            yield* SessionRevert.stage({ session, messageID: SessionMessage.ID.make("msg_boundary_omitted") })
            yield* SessionRevert.stage({ session, messageID: SessionMessage.ID.make("msg_boundary_listed") })
            expect(yield* read(path.join(project, "omitted.txt"))).toBe("one\n")
            expect(yield* read(path.join(project, "listed.txt"))).toBe("two\n")
          }).pipe(Effect.provide(layer(tmp.path, project)))
        }),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )
})

const captured = (snapshot: Snapshot.Interface) =>
  snapshot.capture().pipe(
    Effect.flatMap((id) => (id ? Effect.succeed(id) : Effect.die(new Error("snapshot capture returned nothing")))),
  )

const read = (file: string) =>
  Effect.promise(() => fs.readFile(file, "utf8")).pipe(Effect.map((content) => content.replaceAll("\r\n", "\n")))

const stored = (project: string) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    yield* db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: AbsolutePath.make(project), sandboxes: [] })
      .run()
      .pipe(Effect.orDie)
    yield* db
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: Project.ID.global,
        slug: "test",
        directory: project,
        title: "test",
        version: "test",
      })
      .run()
      .pipe(Effect.orDie)
    yield* db
      .insert(SessionMessageTable)
      .values([
        boundary("msg_boundary_omitted", 1),
        boundary("msg_boundary_listed", 3),
      ])
      .run()
      .pipe(Effect.orDie)
  })

function boundary(id: string, seq: number) {
  const messageID = SessionMessage.ID.make(id)
  const { id: _id, type, ...data } = encode(
    SessionMessage.User.make({ id: messageID, type: "user", text: "", time: { created } }),
  )
  return { id: messageID, session_id: sessionID, type, seq, time_created: 0, data }
}

const assistant = (
  seq: number,
  id: string,
  snapshot: { start: string; end: string; files?: readonly RelativePath[] },
) =>
  Effect.gen(function* () {
    const messageID = SessionMessage.ID.make(id)
    const { id: _id, type, ...data } = encode(
      SessionMessage.Assistant.make({
        id: messageID,
        type: "assistant",
        agent: "maestro",
        model,
        content: [],
        time: { created },
        snapshot,
      }),
    )
    yield* (yield* Database.Service).db
      .insert(SessionMessageTable)
      .values({ id: messageID, session_id: sessionID, type, seq, time_created: 0, data })
      .run()
      .pipe(Effect.orDie)
  })

function info(project: string): Session.Info {
  return {
    id: sessionID,
    projectID: Project.ID.global,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created, updated: created },
    title: "test",
    location: Location.Ref.make({ directory: AbsolutePath.make(project) }),
  }
}

// A capture gate forces a second client's request into the first stage's filesystem window.
for (const operation of ["stage", "clear", "commit"] as const) {
  testEffect(Layer.empty).live(`idle stage excludes concurrent ${operation} and retains the original redo snapshot`, () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
      const drainEntered = yield* Deferred.make<void>()
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      let captures = 0
      const restores: string[] = []
      const snapshot = Layer.succeed(Snapshot.Service, Snapshot.Service.of({
        capture: () => Effect.gen(function* () {
          captures++
          if (captures === 1) {
            yield* Deferred.succeed(entered, undefined)
            yield* Deferred.await(release)
          }
          return Snapshot.ID.make("original")
        }),
        files: () => Effect.succeed([RelativePath.make("changed.txt")]),
        diff: () => Effect.succeed([{ path: RelativePath.make("changed.txt"), status: "modified", patch: "patch", additions: NonNegativeInt.make(1), deletions: NonNegativeInt.make(1) }]),
        restore: ({ files }) => Effect.sync(() => { restores.push(...files.values()) }),
        preview: () => Effect.succeed([]), checkout: () => Effect.void,
      }))
      const execution = Layer.effect(SessionExecution.Service, Effect.gen(function* () {
        const coordinator = yield* SessionRunCoordinator.make<SessionV2.ID, never>({ drain: () => Deferred.succeed(drainEntered, undefined).pipe(Effect.andThen(Effect.never)) })
        return SessionExecution.Service.of({
          active: coordinator.active, exclusive: coordinator.exclusive, interrupt: coordinator.interrupt,
          wake: coordinator.wake, resume: coordinator.run, withRunner: () => Effect.die("unused"),
        })
      }))
      yield* Effect.gen(function* () {
        yield* stored(tmp.path)
        yield* assistant(2, "msg_race_answer", { start: "before", end: "after", files: [RelativePath.make("changed.txt")] })
        const session = yield* SessionV2.Service
        const id = SessionMessage.ID.make("msg_boundary_omitted")
        const owner = yield* session.resume(sessionID).pipe(Effect.forkScoped)
        yield* Deferred.await(drainEntered)
        const busy = yield* (operation === "stage" ? session.revert.stage({ sessionID, messageID: id })
          : session.revert[operation](sessionID)).pipe(Effect.flip)
        expect(busy._tag).toBe("Session.BusyError")
        expect(captures).toBe(0)
        yield* session.interrupt(sessionID)
        yield* Fiber.await(owner)
        const first = yield* session.revert.stage({ sessionID, messageID: id }).pipe(Effect.forkScoped)
        yield* Effect.raceFirst(Deferred.await(entered), Fiber.join(first).pipe(
          Effect.andThen(Effect.die("stage completed without entering the capture gate")),
        ))
        const error = yield* (operation === "stage"
          ? session.revert.stage({ sessionID, messageID: SessionMessage.ID.make("msg_boundary_listed") })
          : session.revert[operation](sessionID)).pipe(Effect.flip)
        expect(error._tag).toBe("Session.BusyError")
        expect(captures).toBe(1)
        expect(restores).toEqual([])
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(first)
        yield* session.wait(sessionID)
        expect((yield* session.get(sessionID)).revert?.snapshot).toBe("original")
        yield* session.revert.clear(sessionID)
        expect(restores).toEqual(["before", "original"])
        expect((yield* session.get(sessionID)).revert).toBeUndefined()
      }).pipe(Effect.provide(AppNodeBuilder.build(LayerNode.group([
        Database.node, EventV2.node, SessionProjector.node, SessionV2.node, SessionExecution.node,
      ]), [[Snapshot.node, snapshot], [SessionExecution.node, execution]])))
    }),
  )
}

for (const next of ["clear", "replacement"] as const) {
  testEffect(Layer.empty).live(`admission during stage stays pending until ${next}; staged explicit resume is busy`, () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      let runs = 0
      const snapshot = Layer.succeed(Snapshot.Service, Snapshot.Service.of({
        capture: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as(undefined)),
        files: () => Effect.succeed([]), diff: () => Effect.succeed([]), restore: () => Effect.void,
        preview: () => Effect.succeed([]), checkout: () => Effect.void,
      }))
      const runnerModule = yield* Effect.promise(() => import("../src/session/runner/llm"))
      const runner = Layer.succeed(SessionRunner.Service, SessionRunner.Service.of({
        run: () => Effect.sync(() => { runs++ }), compact: () => Effect.succeed(false),
        generate: () => Effect.succeed(""), shell: () => Effect.void, skill: () => Effect.succeed(false),
      }))
      yield* Effect.gen(function* () {
        yield* stored(tmp.path)
        const { db } = yield* Database.Service
        const events = yield* EventV2.Service
        const session = yield* SessionV2.Service
        yield* db.delete(SessionMessageTable).run().pipe(Effect.orDie)
        const boundary = SessionMessage.ID.make("msg_boundary_omitted")
        yield* events.publish(SessionEvent.Prompted, {
          sessionID, messageID: boundary, timestamp: created, prompt: { text: "original" }, delivery: "steer",
        })
        const first = yield* session.revert.stage({ sessionID, messageID: boundary, files: false }).pipe(Effect.forkScoped)
        yield* Effect.raceFirst(Deferred.await(entered), Fiber.join(first).pipe(Effect.andThen(Effect.die("capture gate bypassed"))))
        const pending = { sessionID, id: SessionMessage.ID.make("msg_during_stage"), prompt: { text: "during stage" } }
        const submitted = yield* session.prompt(pending).pipe(Effect.forkScoped)
        yield* Fiber.join(submitted).pipe(Effect.timeout("3 seconds"), Effect.ensuring(Deferred.succeed(release, undefined)))
        yield* Fiber.join(first)
        yield* session.wait(sessionID)
        expect(runs).toBe(0)
        expect((yield* SessionInput.find(db, pending.id))?.promotedSeq).toBeUndefined()
        expect((yield* session.resume(sessionID).pipe(Effect.flip))._tag).toBe("Session.BusyError")
        yield* session.prompt(pending)
        yield* session.wait(sessionID)
        expect(runs).toBe(0)
        if (next === "clear") {
          yield* session.revert.clear(sessionID)
          yield* session.wait(sessionID)
          expect(runs).toBe(0)
          yield* session.resume(sessionID)
        } else {
          yield* session.prompt({ sessionID, id: SessionMessage.ID.make("msg_after_stage"), prompt: { text: "replacement" } })
          yield* session.wait(sessionID)
          expect(yield* SessionInput.find(db, pending.id)).toBeUndefined()
        }
        expect(runs).toBe(1)
      }).pipe(Effect.provide(AppNodeBuilder.build(LayerNode.group([
        Database.node, EventV2.node, SessionProjector.node, SessionV2.node, SessionExecution.node,
      ]), [[Snapshot.node, snapshot], [SessionExecution.node, SessionExecutionLocal.node], [runnerModule.node, runner]])))
    }).pipe(Effect.timeout("10 seconds")),
  )
}

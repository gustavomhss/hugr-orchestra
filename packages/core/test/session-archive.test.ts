import { describe, expect } from "bun:test"
import path from "path"
import { asc, eq } from "drizzle-orm"
import { DateTime, Deferred, Effect, Fiber, Layer, Stream } from "effect"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { Location } from "@orchestra/core/location"
import { ProjectV2 } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath, RelativePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionInput } from "@orchestra/core/session/input"
import { SessionRunCoordinator } from "@orchestra/core/session/run-coordinator"
import { SessionInputTable, SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { WorkspaceV2 } from "@orchestra/core/workspace"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const projects = Layer.succeed(
  ProjectV2.Service,
  ProjectV2.Service.of({
    resolve: () => Effect.succeed({ id: ProjectV2.ID.global, directory: AbsolutePath.make("/project") }),
    directories: () => Effect.succeed([]),
    commit: () => Effect.void,
  }),
)
const nodes = LayerNode.group([Database.node, EventV2.node, SessionV2.node])
const replacements = [
  [ProjectV2.node, projects],
  [SessionExecution.node, SessionExecution.noopLayer],
] as const
const it = testEffect(AppNodeBuilder.build(nodes, [...replacements]))
const location = Location.Ref.make({ directory: AbsolutePath.make("/project") })
const rows = (db: Database.Interface["db"], sessionID: SessionV2.ID) =>
  db
    .select()
    .from(EventTable)
    .where(eq(EventTable.aggregate_id, sessionID))
    .orderBy(asc(EventTable.seq))
    .all()
    .pipe(Effect.orDie)

describe("SessionV2 archive", () => {
  it.live("keeps process-local active ownership through archive and restore", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      const execution = Layer.effect(
        SessionExecution.Service,
        Effect.gen(function* () {
          const coordinator = yield* SessionRunCoordinator.make<SessionV2.ID, never>({
            drain: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(gate))),
          })
          return SessionExecution.Service.of({
            active: coordinator.active,
            resume: coordinator.run,
            wake: coordinator.wake,
            interrupt: coordinator.interrupt,
          })
        }),
      )
      yield* Effect.gen(function* () {
        const session = yield* SessionV2.Service
        const created = yield* session.create({ location })
        const owner = yield* session.resume(created.id).pipe(Effect.forkChild)
        yield* Deferred.await(started)
        expect(yield* session.active).toEqual(new Set([created.id]))
        yield* session.archive({ sessionID: created.id, archived: true })
        expect(yield* session.active).toEqual(new Set([created.id]))
        yield* session.archive({ sessionID: created.id, archived: false })
        expect(yield* session.active).toEqual(new Set([created.id]))
        yield* Deferred.succeed(gate, undefined)
        yield* Fiber.join(owner)
        expect(yield* session.active).toEqual(new Set())
      }).pipe(
        Effect.provide(
          Layer.fresh(
            AppNodeBuilder.build(nodes, [
              [ProjectV2.node, projects],
              [SessionExecution.node, execution],
            ]),
          ),
        ),
      )
    }),
  )

  it.live("durably archives/restores once and preserves messages, inbox, children and adoption", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const events = yield* EventV2.Service
      const database = yield* Database.Service
      const db = database.db
      const parent = yield* session.create({ location })
      const child = yield* session.create({ location, parentID: parent.id })
      const visible = yield* session.prompt({ sessionID: parent.id, prompt: { text: "Visible" }, resume: false })
      yield* SessionInput.promoteSteers(db, events, parent.id, Number.MAX_SAFE_INTEGER)
      const queued = yield* session.prompt({
        sessionID: parent.id,
        prompt: { text: "Pending" },
        delivery: "queue",
        resume: false,
      })
      const messages = yield* db.select().from(SessionMessageTable).all()
      const inputs = yield* db.select().from(SessionInputTable).all()
      const before = yield* rows(db, parent.id)

      yield* session.archive({ sessionID: parent.id, archived: true })
      const archived = yield* session.get(parent.id)
      expect(archived.time.archived).toBeDefined()
      if (!archived.time.archived) return yield* Effect.die("Archive timestamp missing")
      const timestamp = DateTime.toEpochMillis(archived.time.archived)
      yield* session.archive({ sessionID: parent.id, archived: true })
      expect((yield* session.get(parent.id)).time.archived).toEqual(archived.time.archived)
      expect(yield* session.create({ id: parent.id, location: { directory: AbsolutePath.make("/other") } })).toEqual(
        archived,
      )
      expect((yield* session.list()).map((item) => item.id)).toEqual([child.id])
      expect((yield* rows(db, parent.id)).slice(before.length)).toMatchObject([
        {
          type: EventV2.versionedType(SessionEvent.ArchiveChanged.type, 1),
          data: { sessionID: parent.id, timestamp, archived: timestamp },
        },
      ])

      yield* session.archive({ sessionID: parent.id, archived: false })
      yield* session.archive({ sessionID: parent.id, archived: false })
      expect((yield* session.get(parent.id)).time.archived).toBeUndefined()
      expect((yield* rows(db, parent.id)).slice(before.length)).toMatchObject([
        { data: { archived: timestamp } },
        { data: { archived: null } },
      ])
      expect(yield* db.select().from(SessionMessageTable).all()).toEqual(messages)
      expect(yield* db.select().from(SessionInputTable).all()).toEqual(inputs)
      expect(yield* session.get(child.id)).toEqual(child)
      expect(yield* SessionInput.find(db, visible.id)).toMatchObject({ promotedSeq: expect.any(Number) })
      expect(yield* SessionInput.find(db, queued.id)).toMatchObject({ delivery: "queue" })
      expect((yield* SessionInput.find(db, queued.id))?.promotedSeq).toBeUndefined()
      expect((yield* rows(db, parent.id)).slice(0, before.length)).toEqual(before)
      expect(
        (yield* session.history({ sessionID: parent.id, limit: 100 })).events.filter(
          (event) => event.type === SessionEvent.ArchiveChanged.type,
        ),
      ).toHaveLength(2)
      expect(
        Array.from(
          yield* session
            .events({ sessionID: parent.id, after: before.at(-1)?.seq })
            .pipe(Stream.take(2), Stream.runCollect),
        ),
      ).toMatchObject([
        { type: SessionEvent.ArchiveChanged.type, data: { archived: expect.any(Object) } },
        { type: SessionEvent.ArchiveChanged.type, data: { archived: null } },
      ])
    }),
  )

  it.live("serializes concurrent retries and treats epoch zero as archived", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const database = yield* Database.Service
      const db = database.db
      const created = yield* session.create({ location })
      yield* Effect.all(
        Array.from({ length: 4 }, () => session.archive({ sessionID: created.id, archived: true })),
        { concurrency: "unbounded" },
      )
      expect(yield* rows(db, created.id)).toHaveLength(2)
      yield* db.update(SessionTable).set({ time_archived: 0 }).where(eq(SessionTable.id, created.id)).run()
      yield* session.archive({ sessionID: created.id, archived: true })
      expect(yield* rows(db, created.id)).toHaveLength(2)
      expect(yield* session.list()).toEqual([])
      expect((yield* session.list({ includeArchived: true })).map((item) => item.id)).toEqual([created.id])
      yield* Effect.all(
        Array.from({ length: 4 }, () => session.archive({ sessionID: created.id, archived: false })),
        { concurrency: "unbounded" },
      )
      expect(yield* rows(db, created.id)).toHaveLength(3)
      expect(yield* session.list()).toHaveLength(1)
    }),
  )

  it.live("replays archive and restore into a fresh database without losing prompt lifecycle", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const events = yield* EventV2.Service
      const database = yield* Database.Service
      const created = yield* session.create({ location })
      const admitted = yield* session.prompt({ sessionID: created.id, prompt: { text: "Keep" }, resume: false })
      yield* SessionInput.promoteSteers(database.db, events, created.id, Number.MAX_SAFE_INTEGER)
      yield* session.archive({ sessionID: created.id, archived: true })
      const archived = yield* session.get(created.id)
      yield* session.archive({ sessionID: created.id, archived: false })
      const serialized = (yield* rows(database.db, created.id)).map((event) => ({
        id: event.id,
        aggregateID: event.aggregate_id,
        seq: event.seq,
        type: event.type,
        data: event.data,
      }))
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      const target = AppNodeBuilder.build(nodes, [
        ...replacements,
        [Database.node, Database.layerFromPath(path.join(tmp.path, "target.sqlite"))],
      ])
      yield* Effect.gen(function* () {
        const database = yield* Database.Service
        const events = yield* EventV2.Service
        const session = yield* SessionV2.Service
        yield* database.db
          .insert(ProjectTable)
          .values({ id: ProjectV2.ID.global, worktree: location.directory, sandboxes: [] })
          .run()
        yield* events.replayAll(serialized.slice(0, -1))
        expect(yield* session.get(created.id)).toEqual(archived)
        expect(yield* session.list()).toEqual([])
        expect(yield* session.context(created.id)).toMatchObject([{ id: admitted.id, text: "Keep" }])
        yield* events.replayAll(serialized.slice(-1))
        expect((yield* session.get(created.id)).time.archived).toBeUndefined()
        expect(yield* session.list()).toHaveLength(1)
        expect(yield* SessionInput.find(database.db, admitted.id)).toMatchObject({ admittedSeq: 1, promotedSeq: 2 })
        expect(yield* rows(database.db, created.id)).toHaveLength(serialized.length)
        yield* events.replayAll(serialized)
        expect(yield* rows(database.db, created.id)).toHaveLength(serialized.length)
      }).pipe(Effect.provide(Layer.fresh(target)))
    }),
  )

  it.live("filters archive visibility before scoped limits in both cursor directions", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const database = yield* Database.Service
      const workspaceID = WorkspaceV2.ID.make("wrk_archive")
      const entries = yield* Effect.forEach([0, 1, 2, 3, 4, 5], (index) =>
        Effect.gen(function* () {
          const created = yield* session.create({
            id: SessionV2.ID.make(`ses_archive_${index}`),
            location: {
              directory: AbsolutePath.make(index === 5 ? "/other" : "/project/sub"),
              workspaceID: index === 4 ? undefined : workspaceID,
            },
          })
          yield* database.db
            .update(SessionTable)
            .set({ time_created: index < 4 ? 10 : 20, title: "Archive paging" })
            .where(eq(SessionTable.id, created.id))
            .run()
          if (index === 1 || index === 3) yield* session.archive({ sessionID: created.id, archived: true })
          return created
        }),
      )
      const expected = [entries[0], entries[2]].sort((a, b) => a.id.localeCompare(b.id)).map((item) => item.id)
      const scope = {
        project: ProjectV2.ID.global,
        subpath: RelativePath.make("sub"),
        workspaceID,
        search: "paging",
        limit: 1,
      }
      yield* Effect.forEach(["asc", "desc"] as const, (order) =>
        Effect.gen(function* () {
          const ids = order === "asc" ? expected : expected.toReversed()
          const first = yield* session.list({ ...scope, order })
          expect(first.map((item) => item.id)).toEqual(ids.slice(0, 1))
          const second = yield* session.list({
            ...scope,
            order,
            anchor: { id: first[0].id, time: 10, direction: "next" },
          })
          expect(second.map((item) => item.id)).toEqual(ids.slice(1))
          expect(
            (yield* session.list({
              ...scope,
              order,
              anchor: { id: second[0].id, time: 10, direction: "previous" },
            })).map((item) => item.id),
          ).toEqual(ids.slice(0, 1))
          expect(
            yield* session.list({ ...scope, order, anchor: { id: second[0].id, time: 10, direction: "next" } }),
          ).toEqual([])
        }),
      )
      expect(yield* session.list({ ...scope, includeArchived: true, limit: 10 })).toHaveLength(4)
      expect(yield* session.list({ directory: AbsolutePath.make("/project/sub"), limit: 10 })).toHaveLength(3)
    }),
  )

  it.live("returns typed NotFound without writing a missing aggregate", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const database = yield* Database.Service
      const sessionID = SessionV2.ID.make("ses_archive_missing")
      yield* Effect.forEach([true, false], (archived) =>
        Effect.gen(function* () {
          expect(yield* session.archive({ sessionID, archived }).pipe(Effect.flip)).toEqual(
            new SessionV2.NotFoundError({ sessionID }),
          )
        }),
      )
      expect(yield* rows(database.db, sessionID)).toEqual([])
    }),
  )
})

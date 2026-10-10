import { describe, expect } from "bun:test"
import { Project } from "@orchestra/schema/project"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { eq } from "drizzle-orm"
import { Deferred, Effect, Fiber } from "effect"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityRequestTable, CapabilityTargetTable } from "../src/capability/sql"
import { ProjectTable } from "../src/project/sql"
import { SessionTable } from "../src/session/sql"
import { CapabilityConnectionManagementFixture } from "./fixture/capability-connection-management"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionManagementFixture.layer)

describe("CapabilityConnectionManagement writer verification", () => {
  it.live("writer-held parent ownership and deletion fence fresh AND replay receipts", () => Effect.forEach(
    ["directory", "project", "workspace", "deleted"] as const, (change) => Effect.forEach(["fresh", "replay"] as const, (mode) => Effect.gen(function* () {
      const f = yield* CapabilityConnectionManagementFixture.fixture()
      const foreignProject = Project.ID.make("foreign-project")
      yield* f.database.db.insert(ProjectTable).values({ id: foreignProject,
        worktree: CapabilityConnectionManagementFixture.foreign.location.directory, sandboxes: [] }).onConflictDoNothing().run()
      const input = { connection: f.parent, input: { environment: "test", resource: {} } }
      if (mode === "replay") yield* f.run(f.management.createTarget(input), "original")
      const before = yield* f.database.db.select().from(CapabilityRequestTable)
      const hold = yield* CapabilityConnectionManagementFixture.writerCheckpoint(f.database, (tx) =>
        change === "deleted" ? tx.delete(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, f.parent.id)).run().pipe(Effect.asVoid)
          : tx.update(CapabilityConnectionTable).set(change === "directory" ? { directory: CapabilityConnectionManagementFixture.foreign.location.directory }
            : change === "project" ? { project_id: foreignProject } : { workspace_id: WorkspaceID.make("wrk_foreign") })
            .where(eq(CapabilityConnectionTable.id, f.parent.id)).run().pipe(Effect.asVoid))
      const completed = yield* Deferred.make<void>()
      const pending = yield* f.run(f.management.createTarget(input), mode === "replay" ? "original" : "fresh").pipe(
        Effect.withTracer(hold.tracer), Effect.exit, Effect.tap(() => Deferred.succeed(completed, undefined)), Effect.forkChild)
      yield* Effect.raceFirst(Deferred.await(hold.entered), Fiber.join(pending).pipe(
        Effect.andThen(Effect.die("PARENT_WRITER_CHECKPOINT_NOT_HELD"))))
      yield* Effect.yieldNow
      expect(hold.state.starts).toBe(1)
      expect(yield* Deferred.isDone(completed)).toBe(false)
      if (!hold.state.writer) return yield* Effect.die("Missing parent writer")
      yield* Deferred.succeed(hold.release, undefined)
      yield* Fiber.join(hold.state.writer)
      CapabilityConnectionManagementFixture.expectCode(yield* Fiber.join(pending), "connection_unavailable")
      expect(yield* f.database.db.select().from(CapabilityRequestTable)).toEqual(before)
      expect(yield* f.database.db.select().from(CapabilityTargetTable).where(eq(CapabilityTargetTable.connection_id, f.parent.id)))
        .toHaveLength(change === "deleted" ? 0 : mode === "replay" ? 2 : 1)
    }))).pipe(Effect.timeout("15 seconds")))

  it.live("writer-held actor switch/null fence bind AND unbind, fresh AND replay", () => Effect.forEach(
    ["bind", "unbind"] as const, (operation) => Effect.forEach(["fresh", "replay"] as const, (mode) => Effect.forEach(
      ["switched", "null"] as const, (change) => Effect.gen(function* () {
        const f = yield* CapabilityConnectionManagementFixture.fixture()
        const input = { target: f.child, input: { sessionID: f.sessionID, actions: ["read"] } }
        if (operation === "unbind") yield* f.run(f.management.bind(input), "setup")
        const effect = operation === "bind" ? () => f.management.bind(input)
          : () => f.management.unbind({ target: f.child, sessionID: f.sessionID })
        if (mode === "replay") yield* f.run(effect(), "original")
        const before = yield* f.database.db.select().from(CapabilityRequestTable)
        const bindings = yield* f.database.db.select().from(CapabilityBindingTable)
        const hold = yield* CapabilityConnectionManagementFixture.writerCheckpoint(f.database, (tx) =>
          tx.update(SessionTable).set({ agent: change === "switched" ? "new-actor" : null })
            .where(eq(SessionTable.id, f.sessionID)).run().pipe(Effect.asVoid))
        const completed = yield* Deferred.make<void>()
        const pending = yield* f.run(effect(), mode === "replay" ? "original" : "fresh").pipe(
          Effect.withTracer(hold.tracer), Effect.exit, Effect.tap(() => Deferred.succeed(completed, undefined)), Effect.forkChild)
        yield* Effect.raceFirst(Deferred.await(hold.entered), Fiber.join(pending).pipe(
          Effect.andThen(Effect.die("ACTOR_WRITER_CHECKPOINT_NOT_HELD"))))
        yield* Effect.yieldNow
        expect(hold.state.starts).toBe(1)
        expect(yield* Deferred.isDone(completed)).toBe(false)
        if (!hold.state.writer) return yield* Effect.die("Missing actor writer")
        yield* Deferred.succeed(hold.release, undefined)
        yield* Fiber.join(hold.state.writer)
        CapabilityConnectionManagementFixture.expectCode(yield* Fiber.join(pending), "connection_unavailable")
        expect(yield* f.database.db.select().from(CapabilityRequestTable)).toEqual(before)
        expect(yield* f.database.db.select().from(CapabilityBindingTable)).toEqual(bindings)
      })))).pipe(Effect.timeout("15 seconds")))

  it.live("writer-held target-parent reassociation fences exact replay", () => Effect.gen(function* () {
    const f = yield* CapabilityConnectionManagementFixture.fixture()
    const input = { target: f.child, input: { environment: "new", resource: {} } }
    yield* f.run(f.management.retargetTarget(input))
    const other = yield* f.connection()
    const hold = yield* CapabilityConnectionManagementFixture.writerCheckpoint(f.database, (tx) =>
      tx.update(CapabilityTargetTable).set({ connection_id: other.id }).where(eq(CapabilityTargetTable.id, f.child.id)).run().pipe(Effect.asVoid))
    const pending = yield* f.run(f.management.retargetTarget(input)).pipe(Effect.withTracer(hold.tracer), Effect.exit, Effect.forkChild)
    yield* Effect.raceFirst(Deferred.await(hold.entered), Fiber.join(pending).pipe(Effect.andThen(Effect.die("TARGET_WRITER_CHECKPOINT_NOT_HELD"))))
    yield* Effect.yieldNow
    if (!hold.state.writer) return yield* Effect.die("Missing target writer")
    yield* Deferred.succeed(hold.release, undefined)
    yield* Fiber.join(hold.state.writer)
    CapabilityConnectionManagementFixture.expectCode(yield* Fiber.join(pending), "connection_unavailable")
  }).pipe(Effect.timeout("5 seconds")))
})

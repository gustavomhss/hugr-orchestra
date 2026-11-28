import { expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { eq } from "drizzle-orm"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { Location } from "@orchestra/core/location"
import { AppProcess } from "@orchestra/core/process"
import { ProjectV2 } from "@orchestra/core/project"
import { AbsolutePath, RelativePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { WorkspaceV2 } from "@orchestra/core/workspace"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

// Create/placement acceptance uses the real Session, Project, Event, SQL and Git paths.
// No drain or LLM is requested; this is the same execution replacement as session-create.test.ts.
const it = testEffect(AppNodeBuilder.build(
  LayerNode.group([AppProcess.node, Database.node, EventV2.node, ProjectV2.node,
    SessionProjector.node, SessionStore.node, SessionV2.node]),
  [[SessionExecution.node, SessionExecution.noopLayer]],
))

// The common existing field makes these variables structurally assignable to the unchanged baseline API.
// The future flag remains host-only in the second argument; it is never added to the create input.
const inherit = { beforeCommit: Effect.void, inheritParentPlacement: true }
const ordinary = { beforeCommit: Effect.void, inheritParentPlacement: false }

function fixture() {
  return Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(tmpdir),
      (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
    )
    const app = yield* AppProcess.Service
    const git = (...args: string[]) => app.run(ChildProcess.make("git", [
      "-c", "core.fsmonitor=false", "-c", "commit.gpgsign=false",
      "-c", "core.hooksPath=" + path.join(tmp.path, ".git", "empty-hooks"),
      "-c", "user.name=Placement", "-c", "user.email=placement@example.test", ...args,
    ], { cwd: tmp.path }), {
      timeout: "15 seconds", maxOutputBytes: 16_384, maxErrorBytes: 16_384,
      maxRssBytes: 512 * 1024 * 1024,
    }).pipe(Effect.flatMap(AppProcess.requireSuccess), Effect.map((result) => {
      expect(result.stdoutTruncated || result.stderrTruncated).toBe(false)
      return result.stdout.toString("utf8").trim()
    }))
    yield* git("init", "--quiet", "--object-format=sha1")
    yield* Effect.promise(() => fs.mkdir(path.join(tmp.path, ".git", "empty-hooks"), { recursive: true }))
    yield* Effect.promise(() => fs.mkdir(path.join(tmp.path, ".git", "info"), { recursive: true }))
    yield* Effect.promise(() => fs.mkdir(path.join(tmp.path, "nested")))
    yield* Effect.promise(() => fs.mkdir(path.join(tmp.path, "other")))
    const file = path.join(tmp.path, "nested", "source.txt")
    yield* Effect.promise(() => fs.writeFile(file, "first\n"))
    yield* git("add", "--", "nested/source.txt")
    yield* git("commit", "--quiet", "--no-verify", "-m", "first")
    const first = yield* git("rev-parse", "HEAD")
    yield* Effect.promise(() => fs.writeFile(file, "second\n"))
    yield* git("add", "--", "nested/source.txt")
    yield* git("commit", "--quiet", "--no-verify", "-m", "second")
    const second = yield* git("rev-parse", "HEAD")
    expect(first).toMatch(/^[0-9a-f]{40}$/)
    expect(second).toMatch(/^[0-9a-f]{40}$/)
    expect(second).not.toBe(first)
    expect(yield* git("rev-list", "--count", "HEAD")).toBe("2")
    const location = Location.Ref.make({ directory: AbsolutePath.make(path.join(tmp.path, "nested")) })
    const other = Location.Ref.make({ directory: AbsolutePath.make(path.join(tmp.path, "other")) })
    return { directory: tmp.path, first, second, location, other }
  })
}

const durable = (sessionID: SessionV2.ID) => Effect.gen(function* () {
  const { db } = yield* Database.Service
  const sessions = yield* db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).all().pipe(Effect.orDie)
  const events = yield* db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID)).all().pipe(Effect.orDie)
  return { sessions, events }
})

for (const overlay of ["shallow", "graft"] as const) {
  it.live(`parent placement survives a real ${overlay} identity change while default creation still resolves live`, () => Effect.gen(function* () {
    const f = yield* fixture()
    const sessions = yield* SessionV2.Service
    const projects = yield* ProjectV2.Service
    const parent = yield* sessions.create({ location: f.location })
    expect(parent.projectID).toBe(ProjectV2.ID.make(f.first))
    expect(parent.subpath).toBe(RelativePath.make("nested"))
    const overlayPath = path.join(f.directory, ".git", ...(overlay === "shallow" ? ["shallow"] : ["info", "grafts"]))
    yield* Effect.promise(() => fs.writeFile(overlayPath, f.second + "\n"))

    const fresh = yield* projects.resolve(f.location.directory)
    expect(fresh.id).toBe(ProjectV2.ID.make(f.second))
    expect(fresh.id).not.toBe(parent.projectID)
    // These controls precede the new behavior so they also execute on the unchanged baseline.
    const root = yield* sessions.create({ location: f.location })
    const childDefault = yield* sessions.create({ location: f.location, parentID: parent.id })
    const childFalse = yield* sessions.create({ location: f.location, parentID: parent.id }, ordinary)
    const different = yield* sessions.create({ location: f.other, parentID: parent.id })
    for (const item of [root, childDefault, childFalse, different]) expect(item.projectID).toBe(fresh.id)
    expect(root.parentID).toBeUndefined()
    expect(different.location).toEqual(f.other)
    expect(different.subpath).toBe(RelativePath.make("other"))

    const child = yield* sessions.create({ location: f.location, parentID: parent.id }, inherit)
    expect(child.projectID).toBe(parent.projectID)
    expect(child.subpath).toBe(parent.subpath)
    expect(child.location).toEqual(parent.location)
    expect(child.parentID).toBe(parent.id)
    expect((yield* sessions.get(child.id))).toEqual(child)
    const stored = yield* durable(child.id)
    expect(stored.sessions).toHaveLength(1)
    expect(stored.events).toHaveLength(1)
    const event = stored.events[0]
    if (!event) throw new Error("created event absent")
    expect(event.type).toBe(EventV2.versionedType(SessionEvent.Created.type, 1))
    expect(event.data).toMatchObject({ sessionID: child.id, parentID: parent.id,
      projectID: parent.projectID, subdirectory: parent.subpath, location: { directory: parent.location.directory } })
    expect(event.data).not.toHaveProperty("inheritParentPlacement")
  }), 60_000)
}

it.live("parent-placement opt-in refuses a root request before creating a row or event", () => Effect.gen(function* () {
  const f = yield* fixture()
  const sessions = yield* SessionV2.Service
  expect((yield* sessions.create({ location: f.location })).projectID).toBe(ProjectV2.ID.make(f.first))
  const sessionID = SessionV2.ID.create()
  const result = yield* sessions.create({ id: sessionID, location: f.location }, inherit).pipe(Effect.result)
  const stored = yield* durable(sessionID)
  expect(result._tag).toBe("Failure")
  if (result._tag !== "Failure") throw new Error("root request unexpectedly inherited placement")
  expect(result.failure._tag).toBe("Session.NotFoundError")
  expect(result.failure.sessionID).toBe(sessionID)
  expect(stored.sessions).toEqual([])
  expect(stored.events).toEqual([])
}), 60_000)

it.live("parent-placement opt-in refuses a missing parent without publishing a child", () => Effect.gen(function* () {
  const f = yield* fixture()
  const sessions = yield* SessionV2.Service
  const parent = yield* sessions.create({ location: f.location })
  expect((yield* sessions.create({ location: f.location, parentID: parent.id })).parentID).toBe(parent.id)
  const parentID = SessionV2.ID.create()
  const sessionID = SessionV2.ID.create()
  const result = yield* sessions.create({ id: sessionID, location: f.location, parentID }, inherit).pipe(Effect.result)
  const stored = yield* durable(sessionID)
  expect(result._tag).toBe("Failure")
  if (result._tag !== "Failure") throw new Error("missing parent unexpectedly admitted a child")
  expect(result.failure._tag).toBe("Session.NotFoundError")
  expect(result.failure.sessionID).toBe(parentID)
  expect(stored.sessions).toEqual([])
  expect(stored.events).toEqual([])
}), 60_000)

for (const mismatch of ["directory", "workspace"] as const) {
  it.live(`parent-placement opt-in refuses a ${mismatch} mismatch while default creation preserves that location`, () => Effect.gen(function* () {
    const f = yield* fixture()
    const sessions = yield* SessionV2.Service
    const parent = yield* sessions.create({ location: f.location })
    const location = mismatch === "directory" ? f.other : Location.Ref.make({
      directory: f.location.directory, workspaceID: WorkspaceV2.ID.make("wrk_parent_placement_test"),
    })
    const control = yield* sessions.create({ location, parentID: parent.id })
    expect(control.location).toEqual(location)
    expect(control.projectID).toBe(parent.projectID)
    expect(control.subpath).toBe(mismatch === "directory" ? RelativePath.make("other") : parent.subpath)
    const sessionID = SessionV2.ID.create()
    const result = yield* sessions.create({ id: sessionID, location, parentID: parent.id }, inherit).pipe(Effect.result)
    const stored = yield* durable(sessionID)
    expect(result._tag).toBe("Failure")
    if (result._tag !== "Failure") throw new Error("mismatched location unexpectedly inherited placement")
    expect(result.failure._tag).toBe("Session.NotFoundError")
    expect(result.failure.sessionID).toBe(parent.id)
    expect(stored.sessions).toEqual([])
    expect(stored.events).toEqual([])
  }), 60_000)
}

it.live("parent-placement opt-in keeps an existing Session ID's recorded identity and event", () => Effect.gen(function* () {
  const f = yield* fixture()
  const sessions = yield* SessionV2.Service
  const parent = yield* sessions.create({ location: f.location })
  const child = yield* sessions.create({ location: f.location, parentID: parent.id })
  const recorded = yield* durable(child.id)
  const retried = yield* sessions.create({ id: child.id, location: f.other,
    parentID: SessionV2.ID.create() }, inherit)
  expect(retried).toEqual(child)
  expect(yield* sessions.get(child.id)).toEqual(child)
  expect(yield* durable(child.id)).toEqual(recorded)
  expect(recorded.events).toHaveLength(1)
  expect(recorded.events[0]?.data).not.toHaveProperty("inheritParentPlacement")
}), 60_000)

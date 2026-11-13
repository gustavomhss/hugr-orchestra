import { describe, expect } from "bun:test"
import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { MoveSession } from "@orchestra/core/control-plane/move-session"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { ProjectDirectories } from "@orchestra/core/project/directories"
import { AppProcess } from "@orchestra/core/process"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { expectSpawn } from "./fixture/omni-expect"
import { MoveSessionWriter } from "./fixture/move-session-writer"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      MoveSession.node,
      Database.node,
      EventV2.node,
      ProjectDirectories.node,
      Project.node,
      SessionProjector.node,
      SessionStore.node,
      AppProcess.node,
    ]),
  ),
)

function abs(input: string) {
  return AbsolutePath.make(input)
}

async function initRepo(directory: string) {
  await $`git init`.cwd(directory).quiet()
  await $`git config core.autocrlf false`.cwd(directory).quiet()
  await $`git config core.fsmonitor false`.cwd(directory).quiet()
  await $`git config commit.gpgsign false`.cwd(directory).quiet()
  await $`git config user.email test@orchestra.test`.cwd(directory).quiet()
  await $`git config user.name Test`.cwd(directory).quiet()
  await fs.writeFile(path.join(directory, "tracked.txt"), "initial\n")
  await $`git add tracked.txt`.cwd(directory).quiet()
  await $`git commit -m root`.cwd(directory).quiet()
}

describe("MoveSession", () => {
  // Windows Git setup and transfer can exceed Bun's default five-second fixture budget.
  it.live("copies session changes to another project directory and retains the source", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const root = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
      )
      yield* Effect.promise(() => initRepo(root.path))
      const source = abs(yield* Effect.promise(() => fs.realpath(root.path)))
      const destination = abs(`${root.path}-move-destination`)
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => fs.rm(destination, { recursive: true, force: true })).pipe(Effect.ignore),
      )
      yield* Effect.promise(() => $`git worktree add --detach ${destination} HEAD`.cwd(root.path).quiet())
      const moved = abs(yield* Effect.promise(() => fs.realpath(destination)))
      yield* Effect.promise(() => fs.writeFile(path.join(source, "tracked.txt"), "changed\n"))
      yield* Effect.promise(() => fs.writeFile(path.join(source, "untracked.txt"), "new\n"))

      const projectID = (yield* Project.Service.use((service) => service.resolve(source))).id
      const sessionID = SessionV2.ID.make("ses_move")
      const { db } = yield* Database.Service
      yield* db
        .insert(ProjectTable)
        .values({ id: projectID, worktree: source, sandboxes: [], time_created: 1, time_updated: 1 })
        .run()
        .pipe(Effect.orDie)
      yield* db
        .insert(SessionTable)
        .values({
          id: sessionID,
          project_id: projectID,
          slug: "move",
          directory: source,
          title: "move",
          version: "test",
          time_created: 1,
          time_updated: 1,
        })
        .run()
        .pipe(Effect.orDie)

      yield* MoveSession.Service.use((service) =>
        service.moveSession({ sessionID, destination: { directory: moved }, moveChanges: true }),
      )

      expect(yield* Effect.promise(() => fs.readFile(path.join(moved, "tracked.txt"), "utf8"))).toBe("changed\n")
      expect(yield* Effect.promise(() => fs.readFile(path.join(moved, "untracked.txt"), "utf8"))).toBe("new\n")
      expect(yield* Effect.promise(() => fs.readFile(path.join(source, "tracked.txt"), "utf8"))).toBe("changed\n")
      expect(yield* Effect.promise(() => fs.readFile(path.join(source, "untracked.txt"), "utf8"))).toBe("new\n")
      expect(
        yield* db
          .select({ directory: SessionTable.directory, path: SessionTable.path })
          .from(SessionTable)
          .where(eq(SessionTable.id, sessionID))
          .get(),
      ).toEqual({ directory: moved, path: "" })
    }),
    process.platform === "win32" ? 30_000 : 5_000,
  )

  it.live("moves within a checkout without transferring existing changes", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const root = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
      )
      yield* Effect.promise(() => initRepo(root.path))
      const source = abs(yield* Effect.promise(() => fs.realpath(root.path)))
      const destination = abs(path.join(source, "packages"))
      yield* Effect.promise(() => fs.mkdir(destination))
      yield* Effect.promise(() => fs.writeFile(path.join(source, "tracked.txt"), "changed\n"))
      yield* Effect.promise(() => fs.writeFile(path.join(source, "untracked.txt"), "new\n"))

      const projectID = (yield* Project.Service.use((service) => service.resolve(source))).id
      const sessionID = SessionV2.ID.make("ses_move_nested")
      const { db } = yield* Database.Service
      yield* db
        .insert(ProjectTable)
        .values({ id: projectID, worktree: source, sandboxes: [], time_created: 1, time_updated: 1 })
        .run()
        .pipe(Effect.orDie)
      yield* db
        .insert(SessionTable)
        .values({
          id: sessionID,
          project_id: projectID,
          slug: "move-nested",
          directory: source,
          title: "move nested",
          version: "test",
          time_created: 1,
          time_updated: 1,
        })
        .run()
        .pipe(Effect.orDie)

      yield* MoveSession.Service.use((service) =>
        service.moveSession({ sessionID, destination: { directory: destination }, moveChanges: true }),
      )

      expect(yield* Effect.promise(() => fs.readFile(path.join(source, "tracked.txt"), "utf8"))).toBe("changed\n")
      expect(yield* Effect.promise(() => fs.readFile(path.join(source, "untracked.txt"), "utf8"))).toBe("new\n")
      expect(
        yield* db
          .select({ directory: SessionTable.directory, path: SessionTable.path })
          .from(SessionTable)
          .where(eq(SessionTable.id, sessionID))
          .get(),
      ).toEqual({ directory: destination, path: "packages" })
    }),
    process.platform === "win32" ? 30_000 : 5_000,
  )

  it.live("copies nested session changes and retains source and unrelated files", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const root = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
      )
      yield* Effect.promise(() => initRepo(root.path))
      const source = abs(yield* Effect.promise(() => fs.realpath(root.path)))
      const sourceDirectory = abs(path.join(source, "packages"))
      yield* Effect.promise(() => fs.mkdir(sourceDirectory))
      yield* Effect.promise(() => fs.writeFile(path.join(sourceDirectory, "tracked.txt"), "initial\n"))
      yield* Effect.promise(() => fs.writeFile(path.join(sourceDirectory, "staged.txt"), "initial\n"))
      yield* Effect.promise(() => $`git add packages/tracked.txt packages/staged.txt`.cwd(source).quiet())
      yield* Effect.promise(() => $`git commit -m packages`.cwd(source).quiet())
      const destination = abs(`${root.path}-move-nested-destination`)
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => fs.rm(destination, { recursive: true, force: true })).pipe(Effect.ignore),
      )
      yield* Effect.promise(() => $`git worktree add --detach ${destination} HEAD`.cwd(source).quiet())
      const moved = abs(path.join(yield* Effect.promise(() => fs.realpath(destination)), "packages"))
      yield* Effect.promise(() => fs.writeFile(path.join(sourceDirectory, "tracked.txt"), "changed\n"))
      yield* Effect.promise(() => fs.writeFile(path.join(sourceDirectory, "staged.txt"), "staged\n"))
      yield* Effect.promise(() => $`git add packages/staged.txt`.cwd(source).quiet())
      yield* Effect.promise(() => fs.writeFile(path.join(sourceDirectory, "untracked.txt"), "new\n"))
      yield* Effect.promise(() => fs.writeFile(path.join(source, "tracked.txt"), "unrelated\n"))
      yield* Effect.promise(() => fs.writeFile(path.join(source, "untracked.txt"), "unrelated\n"))

      const projectID = (yield* Project.Service.use((service) => service.resolve(source))).id
      const sessionID = SessionV2.ID.make("ses_move_nested_checkout")
      const { db } = yield* Database.Service
      yield* db
        .insert(ProjectTable)
        .values({ id: projectID, worktree: source, sandboxes: [], time_created: 1, time_updated: 1 })
        .run()
        .pipe(Effect.orDie)
      yield* db
        .insert(SessionTable)
        .values({
          id: sessionID,
          project_id: projectID,
          slug: "move-nested-checkout",
          directory: sourceDirectory,
          title: "move nested checkout",
          version: "test",
          time_created: 1,
          time_updated: 1,
        })
        .run()
        .pipe(Effect.orDie)

      yield* MoveSession.Service.use((service) =>
        service.moveSession({ sessionID, destination: { directory: moved }, moveChanges: true }),
      )

      expect(yield* Effect.promise(() => fs.readFile(path.join(moved, "tracked.txt"), "utf8"))).toBe("changed\n")
      expect(yield* Effect.promise(() => fs.readFile(path.join(moved, "staged.txt"), "utf8"))).toBe("staged\n")
      expect(yield* Effect.promise(() => fs.readFile(path.join(moved, "untracked.txt"), "utf8"))).toBe("new\n")
      expect(yield* Effect.promise(() => fs.readFile(path.join(sourceDirectory, "tracked.txt"), "utf8"))).toBe(
        "changed\n",
      )
      expect(yield* Effect.promise(() => fs.readFile(path.join(sourceDirectory, "untracked.txt"), "utf8"))).toBe("new\n")
      expect(yield* Effect.promise(() => fs.readFile(path.join(sourceDirectory, "staged.txt"), "utf8"))).toBe(
        "staged\n",
      )
      expect(yield* Effect.promise(() => $`git status --porcelain -- packages/staged.txt`.cwd(source).text())).toBe(
        "M  packages/staged.txt\n",
      )
      expect(yield* Effect.promise(() => fs.readFile(path.join(source, "tracked.txt"), "utf8"))).toBe("unrelated\n")
      expect(yield* Effect.promise(() => fs.readFile(path.join(source, "untracked.txt"), "utf8"))).toBe("unrelated\n")
    }),
    process.platform === "win32" ? 30_000 : 5_000,
  )

  it.live("retains every acknowledged independent writer byte after Session Moved, including an already-open descriptor", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const root = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
      )
      const control = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
      )
      yield* Effect.promise(() => initRepo(root.path))
      const source = abs(yield* Effect.promise(() => fs.realpath(root.path)))
      yield* Effect.promise(async () => {
        await fs.writeFile(path.join(source, "renamed.txt"), "initial rename\n")
        await fs.writeFile(path.join(source, "open-fd.txt"), "initial descriptor\n")
        await $`git add renamed.txt open-fd.txt`.cwd(source).quiet()
        await $`git commit -m writer-baseline`.cwd(source).quiet()
      })
      const destination = abs(`${root.path}-move-writer-destination`)
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => fs.rm(destination, { recursive: true, force: true })).pipe(Effect.ignore),
      )
      yield* Effect.promise(() => $`git worktree add --detach ${destination} HEAD`.cwd(source).quiet())
      const moved = abs(yield* Effect.promise(() => fs.realpath(destination)))
      const captured = {
        "tracked.txt": "captured tracked\n",
        "untracked.txt": "captured untracked\n",
        "renamed.txt": "captured rename\n",
        "open-fd.txt": "captured descriptor\n",
      }
      yield* Effect.promise(() => Promise.all(Object.entries(captured).map(([name, value]) =>
        fs.writeFile(path.join(source, name), value))))
      yield* Effect.promise(() => $`git add renamed.txt`.cwd(source).quiet())
      const indexBefore = yield* Effect.promise(() => $`git diff --cached --binary`.cwd(source).text())
      const projectID = (yield* Project.Service.use((service) => service.resolve(source))).id
      const sessionID = SessionV2.ID.make("ses_move_independent_writer")
      const database = yield* Database.Service
      yield* database.db.insert(ProjectTable)
        .values({ id: projectID, worktree: source, sandboxes: [], time_created: 1, time_updated: 1 })
        .run().pipe(Effect.orDie)
      yield* database.db.insert(SessionTable).values({
        id: sessionID, project_id: projectID, slug: "move-writer", directory: source,
        title: "move writer", version: "test", time_created: 1, time_updated: 1,
      }).run().pipe(Effect.orDie)

      const writer = yield* MoveSessionWriter.start(source, control.path)
      expect(writer.ready.descriptorOpen).toBe(true)
      expect(writer.ready.pid).not.toBe(process.pid)
      const observed = { deliveries: 0, acknowledged: false }
      const events = yield* EventV2.Service
      const unsubscribe = yield* events.listen((event) => {
        if (event.type !== SessionEvent.Moved.type || (event.data as { sessionID: string }).sessionID !== sessionID)
          return Effect.void
        return Effect.gen(function* () {
          observed.deliveries++
          // Real publication follows capture/apply; hold its callback until the independent writer ACK and exit.
          const result = yield* writer.release
          expect(result.ack.pid).toBe(writer.ready.pid)
          expect(result.ack.writes).toBe(5)
          expect(result.ack.descriptorClosed).toBe(true)
          expect(result.exitCode).toBe(0)
          observed.acknowledged = true
        }).pipe(Effect.orDie)
      })
      yield* Effect.addFinalizer(() => unsubscribe)
      const move = yield* MoveSession.Service
      yield* move.moveSession({ sessionID, destination: { directory: moved }, moveChanges: true })

      expect(observed).toEqual({ deliveries: 1, acknowledged: true })
      const retained = yield* Effect.promise(() => Promise.all(Object.keys(MoveSessionWriter.contents).map(async (name) =>
        [name, await Bun.file(path.join(source, name)).exists() ? await Bun.file(path.join(source, name)).text() : null] as const)))
      expect(Object.fromEntries(retained)).toEqual(MoveSessionWriter.contents)
      yield* Effect.forEach(Object.entries(captured), ([name, value]) => Effect.gen(function* () {
        expect(yield* Effect.promise(() => fs.readFile(path.join(moved, name), "utf8"))).toBe(value)
      }))
      expect(yield* Effect.promise(() => Bun.file(path.join(moved, "late.txt")).exists())).toBe(false)
      expect(yield* Effect.promise(() => $`git diff --cached --binary`.cwd(source).text())).toBe(indexBefore)
      expect(yield* database.db.select({ directory: SessionTable.directory, path: SessionTable.path })
        .from(SessionTable).where(eq(SessionTable.id, sessionID)).get()).toEqual({ directory: moved, path: "" })
    }),
    60_000,
  )

  for (const moveChanges of [undefined, false]) {
    it.live(`moves only the Session and retains source changes when moveChanges is ${moveChanges}`, () =>
      Effect.gen(function* () {
        expectSpawn(import.meta.path)
        const root = yield* Effect.acquireRelease(
          Effect.promise(() => tmpdir()),
          (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
        )
        yield* Effect.promise(() => initRepo(root.path))
        const source = abs(yield* Effect.promise(() => fs.realpath(root.path)))
        const destination = abs(`${root.path}-move-without-changes`)
        yield* Effect.addFinalizer(() =>
          Effect.promise(() => fs.rm(destination, { recursive: true, force: true })).pipe(Effect.ignore),
        )
        yield* Effect.promise(() => $`git worktree add --detach ${destination} HEAD`.cwd(source).quiet())
        const moved = abs(yield* Effect.promise(() => fs.realpath(destination)))
        yield* Effect.promise(() => fs.writeFile(path.join(source, "tracked.txt"), "changed\n"))
        yield* Effect.promise(() => fs.writeFile(path.join(source, "untracked.txt"), "new\n"))
        const projectID = (yield* Project.Service.use((service) => service.resolve(source))).id
        const sessionID = SessionV2.ID.make(`ses_move_without_changes_${moveChanges}`)
        const database = yield* Database.Service
        yield* database.db.insert(ProjectTable)
          .values({ id: projectID, worktree: source, sandboxes: [], time_created: 1, time_updated: 1 })
          .run().pipe(Effect.orDie)
        yield* database.db.insert(SessionTable).values({
          id: sessionID, project_id: projectID, slug: "move-without-changes", directory: source,
          title: "move without changes", version: "test", time_created: 1, time_updated: 1,
        }).run().pipe(Effect.orDie)
        const move = yield* MoveSession.Service
        yield* move.moveSession({ sessionID, destination: { directory: moved }, moveChanges })

        expect(yield* Effect.promise(() => fs.readFile(path.join(source, "tracked.txt"), "utf8"))).toBe("changed\n")
        expect(yield* Effect.promise(() => fs.readFile(path.join(source, "untracked.txt"), "utf8"))).toBe("new\n")
        expect(yield* Effect.promise(() => fs.readFile(path.join(moved, "tracked.txt"), "utf8"))).toBe("initial\n")
        expect(yield* Effect.promise(() => Bun.file(path.join(moved, "untracked.txt")).exists())).toBe(false)
        expect(yield* database.db.select({ directory: SessionTable.directory, path: SessionTable.path })
          .from(SessionTable).where(eq(SessionTable.id, sessionID)).get()).toEqual({ directory: moved, path: "" })
      }),
      process.platform === "win32" ? 30_000 : 5_000,
    )
  }

})

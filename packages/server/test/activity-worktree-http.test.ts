import { expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { ActivityDisk } from "@orchestra/core/activity-disk"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { it, serve } from "./activity-worktree-fixture"

it.live("W05 HTTP inventory authenticates and selects only persisted git worktree roots", () =>
  Effect.gen(function* () {
    const server = yield* serve()
    yield* Effect.promise(async () => {
      for (const strategy of [undefined, "root", "copy"]) {
        await Effect.runPromise(
          server.registrations.create({
            projectID: server.projectID,
            directory: AbsolutePath.make(path.join(server.root.path, strategy ?? "main")),
            strategy,
          }),
        )
      }
      const nongit = Project.ID.make("nongit")
      await Effect.runPromise(
        server.database.db.insert(ProjectTable).values({ id: nongit, worktree: server.directory, sandboxes: [] }).run(),
      )
      await Effect.runPromise(
        server.registrations.create({ projectID: nongit, directory: server.directory, strategy: "git_worktree" }),
      )
      await fs.mkdir(path.join(server.root.path, "unregistered"))
      const stored = await Effect.runPromise(
        server.database.db.all(sql`SELECT * FROM project_directory ORDER BY project_id, directory`),
      )
      expect((await server.request("/api/activity/worktrees", {}, false)).status).toBe(401)
      expect((await server.request("/api/activity/worktrees/unknown/read", { method: "POST" }, false)).status).toBe(401)
      const inventory = await server.inventory()
      expect(inventory.records).toHaveLength(1)
      const row = inventory.records[0]!
      expect(row.directory).toBe(server.directory)
      expect(row.projectID).toBe(server.projectID)
      const persisted = await Effect.runPromise(
        server.registrations.getRegistration({ projectID: server.projectID, directory: server.directory }),
      )
      expect(persisted).toBeDefined()
      expect(row.registrationID).toBe(persisted!.registrationID)
      expect(row.owner).toBe("")
      expect(Object.hasOwn(row, "logical")).toBe(false)
      expect(Object.hasOwn(row, "attempt")).toBe(false)
      for (const id of ["unknown", server.directory, path.join(server.root.path, "unregistered")])
        expect((await server.read(id)).status).toBe(400)
      expect(server.calls.walks).toBe(0)
      const injected = await server.request(`/api/activity/worktrees?path=${encodeURIComponent(server.root.path)}`)
      expect(injected.status).toBe(200)
      expect(Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(await injected.json()).records).toEqual(
        inventory.records,
      )
      expect((await server.inventory()).records).toEqual(inventory.records)
      expect(
        await Effect.runPromise(
          server.database.db.all(sql`SELECT * FROM project_directory ORDER BY project_id, directory`),
        ),
      ).toEqual(stored)
    })
  }),
)

it.live("W07 generated Client measures real worktrees and retains complete bytes after partial HTTP reads", () =>
  Effect.gen(function* () {
    const limits = { limited: false }
    const server = yield* serve({
      measure: (directory, budget) =>
        ActivityDisk.measure(directory, limits.limited ? { ...budget, maxEntries: 1 } : budget),
    })
    yield* Effect.promise(async () => {
      await fs.mkdir(path.join(server.directory, "nested"))
      await Bun.write(path.join(server.directory, "nested", "file"), "abc")
      await fs.link(path.join(server.directory, "nested", "file"), path.join(server.directory, "hardlink"))
      const stored = await Effect.runPromise(
        server.database.db.all(sql`SELECT * FROM project_directory ORDER BY directory`),
      )
      const initial = Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(
        await server.client.activity.worktrees(),
      )
      expect(initial.records).toHaveLength(1)
      expect(Object.hasOwn(initial.records[0]!, "logical")).toBe(false)
      const id = initial.records[0]!.recordID
      const measured = Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(
        await server.client.activity.readWorktree({ recordID: id }),
      )
      expect(measured.records[0]?.logical?.bytes).toBe(6)
      expect(measured.records[0]?.attempt?.state).toBe("complete")
      expect(measured.source).toBe("node.fs.lstat")
      expect(measured.records[0]?.owner).toBe("")
      expect(Object.hasOwn(measured.records[0]!, "unique")).toBe(false)
      expect(Object.hasOwn(measured.records[0]!, "useProof")).toBe(false)
      expect(BigInt(measured.snapshotRevision) - BigInt(initial.snapshotRevision)).toBe(3n)
      limits.limited = true
      const partial = Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(
        await server.client.activity.readWorktree({ recordID: id }),
      )
      expect(partial.records[0]?.attempt?.state).toBe("partial")
      expect(partial.records[0]?.attempt?.issues.some((issue) => issue.reason === "limit")).toBe(true)
      expect(partial.records[0]?.logical).toEqual(measured.records[0]?.logical)
      limits.limited = false
      await fs.mkdir(path.join(server.root.path, "external"))
      await fs.symlink(path.join(server.root.path, "external"), path.join(server.directory, "escape"), "junction")
      const gap = Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(
        await server.client.activity.readWorktree({ recordID: id }),
      )
      expect(gap.records[0]?.attempt?.issues.some((issue) => issue.reason === "symlink")).toBe(true)
      expect(gap.records[0]?.logical).toEqual(measured.records[0]?.logical)
      const missing = AbsolutePath.make(path.join(server.root.path, "missing"))
      await Effect.runPromise(
        server.registrations.create({ projectID: server.projectID, directory: missing, strategy: "git_worktree" }),
      )
      const row = (await server.inventory()).records.find((record) => record.directory === missing)!
      const response = await server.read(row.recordID, {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: server.directory }),
      })
      expect(response.status).toBe(200)
      const missingSnapshot = Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(await response.json())
      const unread = missingSnapshot.records.find((record) => record.recordID === row.recordID)!
      expect(unread.attempt?.state).toBe("partial")
      expect(Object.hasOwn(unread, "logical")).toBe(false)
      expect(missingSnapshot.records.find((record) => record.recordID === id)?.logical).toEqual(
        measured.records[0]?.logical,
      )
      await Effect.runPromise(server.registrations.remove({ projectID: server.projectID, directory: missing }))
      expect(
        await Effect.runPromise(server.database.db.all(sql`SELECT * FROM project_directory ORDER BY directory`)),
      ).toEqual(stored)
      expect(await Bun.file(path.join(server.directory, "hardlink")).text()).toBe("abc")
      expect(await Bun.file(path.join(server.directory, "nested", "file")).text()).toBe("abc")
      expect((await fs.lstat(path.join(server.directory, "escape"))).isSymbolicLink()).toBe(true)
      expect(server.calls.walks).toBe(4)
    })
  }),
)

it.live(
  "W08 registry failure is explicit HTTP failure and recovery preserves readings and server lifetime isolation",
  () =>
    Effect.gen(function* () {
      const measurement = { reject: false }
      const server = yield* serve({
        measure: async (directory, limits) => {
          const actual = await ActivityDisk.measure(directory, limits)
          if (measurement.reject) throw new Error("sensitive-measurement-internal")
          return actual
        },
      })
      yield* Effect.promise(async () => {
        await Bun.write(path.join(server.directory, "file"), "12")
        const first = await server.inventory()
        expect(first.records).toHaveLength(1)
        const response = await server.read(first.records[0]!.recordID)
        expect(response.status).toBe(200)
        const complete = Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(await response.json())
        measurement.reject = true
        const rejected = await server.read(first.records[0]!.recordID)
        expect(rejected.status).toBe(503)
        const rejection = await rejected.json()
        expect(rejection._tag).toBe("ServiceUnavailableError")
        expect(JSON.stringify(rejection)).not.toContain("sensitive-measurement-internal")
        expect(server.snapshot().records).toEqual(complete.records)
        measurement.reject = false
        const retried = await server.read(first.records[0]!.recordID)
        expect(retried.status).toBe(200)
        const recovered = Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(await retried.json())
        expect(recovered.records[0]?.logical?.bytes).toBe(2)
        const stored = await Effect.runPromise(
          server.database.db.all(sql`SELECT * FROM project_directory ORDER BY directory`),
        )
        await Effect.runPromise(
          server.database.db.run(sql`ALTER TABLE project_directory RENAME TO unavailable_registry`),
        )
        try {
          for (const failure of [
            await server.request("/api/activity/worktrees"),
            await server.read(first.records[0]!.recordID),
          ]) {
            expect(failure.status).toBe(503)
            const body = await failure.json()
            expect(body._tag).toBe("ServiceUnavailableError")
            expect(Object.hasOwn(body, "records")).toBe(false)
            expect(JSON.stringify(body)).not.toContain("unavailable_registry")
          }
          expect(server.calls.walks).toBe(3)
        } finally {
          await Effect.runPromise(
            server.database.db.run(sql`ALTER TABLE unavailable_registry RENAME TO project_directory`),
          )
        }
        expect((await server.inventory()).records).toEqual(recovered.records)
        expect(
          await Effect.runPromise(server.database.db.all(sql`SELECT * FROM project_directory ORDER BY directory`)),
        ).toEqual(stored)
        expect(await Bun.file(path.join(server.directory, "file")).text()).toBe("12")
      })
      const replacement = yield* serve({ fixture: server })
      yield* Effect.promise(async () => {
        const prior = await server.inventory()
        const reset = await replacement.inventory()
        expect(reset.instanceID).not.toBe(prior.instanceID)
        expect(reset.records).toHaveLength(1)
        expect(reset.records[0]?.recordID).not.toBe(prior.records[0]?.recordID)
        expect(Object.hasOwn(reset.records[0]!, "logical")).toBe(false)
        expect(reset.records[0]?.registrationID).toBe(prior.records[0]?.registrationID)
        expect(replacement.calls.walks).toBe(0)
        expect((await server.inventory()).records).toEqual(prior.records)
      })
    }),
)

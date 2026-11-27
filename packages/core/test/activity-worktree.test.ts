import { expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { ActivityDisk } from "@orchestra/core/activity-disk"
import { ActivityWorktree } from "@orchestra/core/activity-worktree"
import { AbsolutePath } from "@orchestra/core/schema"
import { it, setup } from "./fixture/activity-worktree"

it.effect("W01 cached snapshots and registry inventory never measure disk or invent readings", () =>
  Effect.gen(function* () {
    const fixture = yield* setup
    yield* fixture.registrations.create({
      projectID: fixture.projectID,
      directory: AbsolutePath.make(path.join(fixture.root.path, "copy")),
      strategy: "copy",
    })
    yield* fixture.registrations.create({
      projectID: fixture.projectID,
      directory: AbsolutePath.make(path.join(fixture.root.path, "main")),
    })
    yield* Effect.promise(async () => {
      const calls = { queries: 0, walks: 0 }
      const stored = await Effect.runPromise(
        fixture.database.db.all(sql`SELECT * FROM project_directory ORDER BY directory`),
      )
      const monitor = ActivityWorktree.make({
        registrations: async () => {
          calls.queries++
          return (await fixture.load()).map((row) => ({ ...row, owner: "unproved owner" }))
        },
        measure: async (directory, limits) => {
          calls.walks++
          return ActivityDisk.measure(directory, limits)
        },
      })
      const initial = Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(monitor.snapshot())
      expect(initial.records).toEqual([])
      expect(initial.snapshotRevision).toBe("0")
      expect(Object.hasOwn(initial, "inventoryAt")).toBe(false)
      expect(calls).toEqual({ queries: 0, walks: 0 })
      await fs.rm(fixture.directory, { recursive: true })
      const first = monitor.inventory()
      expect(monitor.inventory()).toBe(first)
      const inventory = Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(await first)
      expect(inventory.records).toHaveLength(1)
      expect(inventory.snapshotRevision).toBe("1")
      expect(inventory.inventoryAt).toBeDefined()
      expect(inventory.records[0]?.directory).toBe(fixture.directory)
      expect(inventory.records[0]?.owner).toBe("")
      expect(Object.hasOwn(inventory.records[0]!, "attempt")).toBe(false)
      expect(Object.hasOwn(inventory.records[0]!, "logical")).toBe(false)
      Reflect.set(inventory.records[0]!, "owner", "mutated")
      expect(monitor.snapshot().records[0]?.owner).toBe("")
      expect(monitor.snapshot().snapshotRevision).toBe(inventory.snapshotRevision)
      expect(calls).toEqual({ queries: 1, walks: 0 })
      const before = Date.now()
      const response = monitor.snapshot()
      expect(response.readAt).toBeGreaterThanOrEqual(before)
      expect(response.readAt).toBeLessThanOrEqual(Date.now())
      expect(response.snapshotRevision).toBe("1")
      expect((await monitor.inventory()).snapshotRevision).toBe("2")
      expect(await monitor.read("unknown")).toBeUndefined()
      expect(await monitor.read(fixture.directory)).toBeUndefined()
      expect(monitor.snapshot().snapshotRevision).toBe("2")
      expect(calls.walks).toBe(0)
      expect(
        await Effect.runPromise(fixture.database.db.all(sql`SELECT * FROM project_directory ORDER BY directory`)),
      ).toEqual(stored)
      expect(
        [ActivityMonitor.WorktreeRevision, ActivityMonitor.WorktreeRecord, ActivityMonitor.WorktreeSnapshot].map(
          (value) => value.ast.annotations?.identifier,
        ),
      ).toEqual([
        "ActivityMonitor.WorktreeRevision",
        "ActivityMonitor.WorktreeRecord",
        "ActivityMonitor.WorktreeSnapshot",
      ])
      expect(Schema.decodeUnknownSync(ActivityMonitor.WorktreeRevision)("9007199254740993")).toBe("9007199254740993")
      for (const value of ["", "01", "00", "+1", "-1", "1.0", "1\n"])
        expect(() => Schema.decodeUnknownSync(ActivityMonitor.WorktreeRevision)(value)).toThrow()
    })
  }),
)

it.effect("W02 real logical readings retain complete values through partial attempts and registry failures", () =>
  Effect.gen(function* () {
    const fixture = yield* setup
    yield* Effect.promise(async () => {
      await fs.mkdir(path.join(fixture.directory, "nested"))
      await fs.mkdir(path.join(fixture.directory, "empty"))
      await Bun.write(path.join(fixture.directory, "nested", "file"), "abc")
      await fs.link(path.join(fixture.directory, "nested", "file"), path.join(fixture.directory, "link"))
      const source: { limited: boolean; conflict?: Awaited<ReturnType<typeof fixture.load>> } = { limited: false }
      const monitor = ActivityWorktree.make({
        registrations: async () => {
          const rows = await fixture.load()
          return source.conflict ? [...rows, ...source.conflict] : rows
        },
        measure: (directory, limits) =>
          ActivityDisk.measure(directory, source.limited ? { ...limits, maxEntries: 1 } : limits),
      })
      const inventory = await monitor.inventory()
      const id = inventory.records[0]!.recordID
      const registered = await Effect.runPromise(
        fixture.database.db.all(sql`SELECT * FROM project_directory ORDER BY directory`),
      )
      const complete = (await monitor.read(id))!
      expect(complete.source).toBe("node.fs.lstat")
      expect(complete.records[0]?.logical?.bytes).toBe(6)
      expect(complete.records[0]?.attempt?.state).toBe("complete")
      expect(BigInt(complete.snapshotRevision)).toBeGreaterThan(BigInt(inventory.snapshotRevision))
      expect(BigInt(complete.snapshotRevision) - BigInt(inventory.snapshotRevision)).toBe(3n)
      expect(Object.hasOwn(complete.records[0]!, "unique")).toBe(false)
      expect(Object.hasOwn(complete.records[0]!, "useProof")).toBe(false)
      const responseAt = Date.now()
      const cached = monitor.snapshot()
      expect(cached.readAt).toBeGreaterThanOrEqual(responseAt)
      expect(cached.readAt).toBeLessThanOrEqual(Date.now())
      expect(cached.records[0]?.logical).toEqual(complete.records[0]?.logical)
      expect(cached.snapshotRevision).toBe(complete.snapshotRevision)
      source.limited = true
      const limited = (await monitor.read(id))!
      expect(limited.records[0]?.attempt?.issues.some((issue) => issue.reason === "limit")).toBe(true)
      expect(limited.records[0]?.attempt?.state).toBe("partial")
      expect(limited.records[0]?.logical).toEqual(complete.records[0]?.logical)
      expect(BigInt(limited.snapshotRevision) - BigInt(complete.snapshotRevision)).toBe(3n)
      source.limited = false
      await fs.mkdir(path.join(fixture.root.path, "outside"))
      await fs.symlink(path.join(fixture.root.path, "outside"), path.join(fixture.directory, "escape"), "junction")
      const partial = (await monitor.read(id))!
      expect(partial.records[0]?.logical).toEqual(complete.records[0]?.logical)
      expect(BigInt(partial.snapshotRevision) - BigInt(limited.snapshotRevision)).toBe(3n)
      expect(partial.records[0]?.attempt?.state).toBe("partial")
      expect(partial.records[0]?.attempt?.issues.some((issue) => issue.reason === "symlink")).toBe(true)
      expect(partial.records[0]?.attempt?.sampledAt).toBeGreaterThanOrEqual(complete.records[0]!.logical!.sampledAt)
      Reflect.set(partial.records[0]!.logical!, "bytes", 999)
      Reflect.set(partial.records[0]!.attempt!.issues[0]!, "path", "tampered")
      expect(monitor.snapshot().records[0]?.logical?.bytes).toBe(6)
      expect(monitor.snapshot().records[0]?.attempt?.issues[0]?.path).not.toBe("tampered")
      expect(
        await Effect.runPromise(fixture.database.db.all(sql`SELECT * FROM project_directory ORDER BY directory`)),
      ).toEqual(registered)
      const missing = AbsolutePath.make(path.join(fixture.root.path, "missing"))
      await Effect.runPromise(
        fixture.registrations.create({ projectID: fixture.projectID, directory: missing, strategy: "git_worktree" }),
      )
      const added = await monitor.inventory()
      const missingID = added.records.find((row) => row.directory === missing)!.recordID
      const failed = (await monitor.read(missingID))!.records.find((row) => row.recordID === missingID)!
      expect(failed.attempt?.state).toBe("partial")
      expect(Object.hasOwn(failed, "logical")).toBe(false)
      const stable = monitor.snapshot()
      await Effect.runPromise(
        fixture.database.db.run(sql`ALTER TABLE project_directory RENAME TO unavailable_registry`),
      )
      try {
        await expect(monitor.inventory()).rejects.toThrow()
        expect(monitor.snapshot().records).toEqual(stable.records)
        expect(monitor.snapshot().inventoryAt).toBe(stable.inventoryAt)
        expect(monitor.snapshot().snapshotRevision).toBe(stable.snapshotRevision)
      } finally {
        await Effect.runPromise(
          fixture.database.db.run(sql`ALTER TABLE unavailable_registry RENAME TO project_directory`),
        )
      }
      expect((await monitor.inventory()).records).toEqual(stable.records)
      expect(await Bun.file(path.join(fixture.directory, "nested", "file")).text()).toBe("abc")
      expect(await Bun.file(path.join(fixture.directory, "link")).text()).toBe("abc")
      expect((await fs.lstat(path.join(fixture.directory, "escape"))).isSymbolicLink()).toBe(true)
      source.conflict = await fixture.load()
      await Effect.runPromise(
        fixture.registrations.remove({ projectID: fixture.projectID, directory: fixture.directory }),
      )
      await Effect.runPromise(
        fixture.registrations.create({
          projectID: fixture.projectID,
          directory: fixture.directory,
          strategy: "git_worktree",
        }),
      )
      const prior = monitor.snapshot()
      await expect(monitor.inventory()).rejects.toThrow()
      expect(monitor.snapshot().records).toEqual(prior.records)
      expect(monitor.snapshot().inventoryAt).toBe(prior.inventoryAt)
      expect(monitor.snapshot().snapshotRevision).toBe(prior.snapshotRevision)
      source.conflict = undefined
      const refreshed = (await monitor.inventory()).records.find((row) => row.directory === fixture.directory)!
      expect(refreshed.registrationID).not.toBe(
        prior.records.find((row) => row.directory === fixture.directory)?.registrationID,
      )
      expect(refreshed.logical).toBeUndefined()
    })
  }),
)

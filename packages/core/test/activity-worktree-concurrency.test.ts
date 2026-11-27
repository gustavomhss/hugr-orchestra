import { expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { sql } from "drizzle-orm"
import { Effect } from "effect"
import { ActivityDisk } from "@orchestra/core/activity-disk"
import { ActivityWorktree } from "@orchestra/core/activity-worktree"
import { AbsolutePath } from "@orchestra/core/schema"
import { it, setup, bounded, entered, traced } from "./fixture/activity-worktree"

it.effect("W04 bounded singleflight reads revalidate real walks and recover validation capacity", () =>
  Effect.gen(function* () {
    const fixture = yield* setup
    yield* Effect.promise(async () => {
      await Bun.write(path.join(fixture.directory, "file"), "1")
      await Promise.all(
        Array.from({ length: 4 }, async (_, index) => {
          const directory = AbsolutePath.make(path.join(fixture.root.path, `extra-${index}`))
          await fs.mkdir(directory)
          await Bun.write(path.join(directory, "file"), "1")
          await Effect.runPromise(
            fixture.registrations.create({ projectID: fixture.projectID, directory, strategy: "git_worktree" }),
          )
        }),
      )

      for (const mode of ["recreate", "aba"]) {
        const ready = Promise.withResolvers<void>()
        const release = Promise.withResolvers<void>()
        const source = traced(fixture)
        const measured: string[] = []
        const monitor = ActivityWorktree.make({
          registrations: source.registrations,
          measure: async (directory, limits) => {
            const result = await ActivityDisk.measure(directory, limits)
            measured.push(directory)
            if (measured.length === 4) ready.resolve()
            await release.promise
            return result
          },
        })
        const inventory = await monitor.inventory()
        expect(inventory.records).toHaveLength(5)
        expect(measured).toHaveLength(0)
        const target = inventory.records.find((row) => row.directory === fixture.directory)!
        const others = inventory.records.filter((row) => row.recordID !== target.recordID)
        const requests: ReturnType<ActivityWorktree.Monitor["read"]>[] = []
        const cleanup: Promise<unknown>[] = []
        try {
          requests.push(monitor.read(target.recordID))
          const joined = monitor.read(target.recordID)
          cleanup.push(joined)
          expect(joined).toBe(requests[0])
          others.slice(0, 3).forEach((row) => requests.push(monitor.read(row.recordID)))
          await entered(ready.promise, requests)
          const fifth = monitor.read(others[3]!.recordID)
          cleanup.push(fifth)
          await expect(bounded(fifth)).rejects.toBeInstanceOf(ActivityWorktree.ReadCapacityError)
          expect(measured).toHaveLength(4)
          const concurrentInventory = monitor.inventory()
          cleanup.push(concurrentInventory)
          expect((await bounded(concurrentInventory)).records.every((row) => !row.logical)).toBe(true)
          if (mode === "recreate") {
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
          }
          if (mode === "aba") {
            await Effect.runPromise(
              fixture.registrations.create({
                projectID: fixture.projectID,
                directory: fixture.directory,
                strategy: "copy",
                behavior: "replace",
              }),
            )
            await Effect.runPromise(
              fixture.registrations.create({
                projectID: fixture.projectID,
                directory: fixture.directory,
                strategy: "git_worktree",
                behavior: "replace",
              }),
            )
          }
        } finally {
          release.resolve()
          await bounded(Promise.allSettled([...requests, ...cleanup]))
        }
        const results = await Promise.all(requests)
        expect(results[0]).toBeUndefined()
        const completed = results
          .filter((result) => result !== undefined)
          .sort((a, b) => (BigInt(a.snapshotRevision) < BigInt(b.snapshotRevision) ? -1 : 1))
        expect(completed.map((result) => result.records.filter((row) => row.logical).length)).toEqual([1, 2, 3])
        expect(new Set(completed.map((result) => result.snapshotRevision)).size).toBe(3)
        expect(monitor.snapshot().records.find((row) => row.directory === fixture.directory)?.logical).toBeUndefined()
        expect(monitor.snapshot().records).toHaveLength(5)
        expect(monitor.snapshot().records.find((row) => row.directory === fixture.directory)?.registrationID).toBe(
          (
            await Effect.runPromise(
              fixture.registrations.getRegistration({ projectID: fixture.projectID, directory: fixture.directory }),
            )
          )?.registrationID,
        )
        expect(monitor.snapshot().records.find((row) => row.directory === fixture.directory)?.recordID).not.toBe(
          target.recordID,
        )
        expect((await monitor.read(others[3]!.recordID))!.records.filter((row) => row.logical)).toHaveLength(4)
        // Re-admit all four slots: even the retired operation must have released its slot.
        const reused = await bounded(
          Promise.all(
            monitor
              .snapshot()
              .records.slice(0, 4)
              .map((row) => monitor.read(row.recordID)),
          ),
        )
        expect(reused.every((result) => result !== undefined)).toBe(true)
        expect(source.calls.maximum).toBe(1)
        expect(measured).toHaveLength(9)
        expect(BigInt(monitor.snapshot().snapshotRevision)).toBe(BigInt(source.calls.succeeded + 8))
      }

      // A held authoritative precheck occupies a slot; failures before/after real I/O free every slot.
      {
        const source = traced(fixture)
        const walks = { count: 0 }
        const monitor = ActivityWorktree.make({
          registrations: source.registrations,
          measure: async (directory, limits) => {
            walks.count++
            return ActivityDisk.measure(directory, limits)
          },
        })
        const before = await monitor.inventory()
        expect(before.records).toHaveLength(5)
        const gate = source.hold()
        const requests: ReturnType<ActivityWorktree.Monitor["read"]>[] = []
        const cleanup: Promise<unknown>[] = []
        const table = { renamed: false }
        try {
          before.records.slice(0, 4).forEach((row) => requests.push(monitor.read(row.recordID)))
          await entered(gate.entered.promise, requests)
          const fifth = monitor.read(before.records[4]!.recordID)
          cleanup.push(fifth)
          await expect(bounded(fifth)).rejects.toBeInstanceOf(ActivityWorktree.ReadCapacityError)
          expect(walks.count).toBe(0)
          await Effect.runPromise(fixture.database.db.run(sql`ALTER TABLE project_directory RENAME TO failed_registry`))
          table.renamed = true
        } finally {
          gate.release.resolve()
          try {
            await bounded(Promise.allSettled([...requests, ...cleanup]))
          } finally {
            if (table.renamed)
              await Effect.runPromise(
                fixture.database.db.run(sql`ALTER TABLE failed_registry RENAME TO project_directory`),
              )
          }
        }
        const failed = await Promise.allSettled(requests)
        expect(failed.map((result) => result.status)).toEqual(["rejected", "rejected", "rejected", "rejected"])
        expect(walks.count).toBe(1)
        expect(monitor.snapshot().records).toEqual(before.records)
        const retried = await bounded(Promise.all(before.records.slice(0, 4).map((row) => monitor.read(row.recordID))))
        expect(retried.every((result) => result !== undefined)).toBe(true)
        expect(walks.count).toBe(5)
        expect(source.calls.maximum).toBe(1)
        expect(BigInt(monitor.snapshot().snapshotRevision)).toBe(BigInt(source.calls.succeeded + 4))
      }

      // A held postcheck also occupies its slot until publication.
      {
        const source = traced(fixture)
        const announced = Promise.withResolvers<ReturnType<typeof source.hold>>()
        const gates: ReturnType<typeof source.hold>[] = []
        const state = { disposed: false }
        const monitor = ActivityWorktree.make({
          registrations: source.registrations,
          measure: async (directory, limits) => {
            const result = await ActivityDisk.measure(directory, limits)
            if (!gates.length && !state.disposed) {
              const gate = source.hold()
              gates.push(gate)
              announced.resolve(gate)
            }
            return result
          },
        })
        const inventory = await monitor.inventory()
        expect(inventory.records).toHaveLength(5)
        const requests: ReturnType<ActivityWorktree.Monitor["read"]>[] = []
        const cleanup: Promise<unknown>[] = []
        try {
          requests.push(monitor.read(inventory.records[0]!.recordID))
          const gate = await bounded(announced.promise)
          await entered(gate.entered.promise, requests)
          inventory.records.slice(1, 4).forEach((row) => requests.push(monitor.read(row.recordID)))
          const fifth = monitor.read(inventory.records[4]!.recordID)
          cleanup.push(fifth)
          await expect(bounded(fifth)).rejects.toBeInstanceOf(ActivityWorktree.ReadCapacityError)
          expect(monitor.snapshot().records.every((row) => !row.logical)).toBe(true)
        } finally {
          state.disposed = true
          gates.forEach((gate) => gate.release.resolve())
          await bounded(Promise.allSettled([...requests, ...cleanup]))
        }
        expect((await Promise.all(requests)).every((result) => result !== undefined)).toBe(true)
        expect(monitor.snapshot().records.filter((row) => row.logical)).toHaveLength(4)
        expect(source.calls.maximum).toBe(1)
      }
      const defaults = ActivityWorktree.make({ registrations: fixture.load })
      const row = (await defaults.inventory()).records[0]!
      expect(
        (await defaults.read(row.recordID))!.records.find((item) => item.recordID === row.recordID)?.logical?.bytes,
      ).toBe(1)
    })
  }),
)

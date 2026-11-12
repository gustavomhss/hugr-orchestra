import { expect } from "bun:test"
import path from "node:path"
import { sql } from "drizzle-orm"
import { Effect } from "effect"
import { ActivityWorktree } from "@orchestra/core/activity-worktree"
import { ActivityDisk } from "@orchestra/core/activity-disk"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { it, setup, bounded, entered, traced } from "./fixture/activity-worktree"

it.effect("W03 persisted incarnation controls retention across projects, unobserved recreation and strategy ABA", () =>
  Effect.gen(function* () {
    const fixture = yield* setup
    yield* Effect.promise(async () => {
      await Bun.write(path.join(fixture.directory, "file"), "123")
      await Effect.runPromise(fixture.database.db.run(sql`UPDATE project_directory SET time_created = 7`))
      const source = traced(fixture)
      const walks = { count: 0 }
      const monitor = ActivityWorktree.make({
        registrations: source.registrations,
        measure: async (directory, limits) => {
          walks.count++
          return ActivityDisk.measure(directory, limits)
        },
      })
      const first = (await monitor.inventory()).records[0]!
      expect(first.registrationID).toBe((await fixture.load())[0]?.registrationID)
      const held = (await monitor.read(first.recordID))!
      expect((await monitor.inventory()).records[0]).toEqual(held.records[0])
      const secondProject = Project.ID.make("second-worktree-project")
      await Effect.runPromise(
        fixture.database.db
          .insert(ProjectTable)
          .values({ id: secondProject, worktree: fixture.directory, vcs: "git", sandboxes: [] })
          .run(),
      )
      await Effect.runPromise(
        fixture.registrations.create({
          projectID: secondProject,
          directory: fixture.directory,
          strategy: "git_worktree",
        }),
      )
      const shared = await monitor.inventory()
      expect(shared.records).toHaveLength(2)
      const second = shared.records.find((row) => row.projectID === secondProject)!
      expect(second.recordID).not.toBe(first.recordID)
      expect(second.registrationID).not.toBe(first.registrationID)
      expect(second.logical).toBeUndefined()
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
      await Effect.runPromise(fixture.database.db.run(sql`UPDATE project_directory SET time_created = 7`))
      const recreated = await monitor.inventory()
      const current = recreated.records.find((row) => row.projectID === fixture.projectID)!
      expect(current.recordID).not.toBe(first.recordID)
      expect(current.registrationID).not.toBe(first.registrationID)
      expect(Object.hasOwn(current, "logical")).toBe(false)
      expect(await monitor.read(first.recordID)).toBeUndefined()
      expect(recreated.records.find((row) => row.projectID === secondProject)).toEqual(second)
      expect(held.records[0]?.recordID).toBe(first.recordID)
      expect(held.records[0]?.logical?.bytes).toBe(3)
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
      await Effect.runPromise(fixture.database.db.run(sql`UPDATE project_directory SET time_created = 7`))
      const roundTrip = (await monitor.inventory()).records.find((row) => row.projectID === fixture.projectID)!
      expect(roundTrip.recordID).not.toBe(current.recordID)
      expect(roundTrip.registrationID).not.toBe(current.registrationID)
      expect(roundTrip.logical).toBeUndefined()
      await Effect.runPromise(fixture.registrations.remove({ projectID: secondProject, directory: fixture.directory }))
      expect((await monitor.inventory()).records).toHaveLength(1)
      expect(await monitor.read(second.recordID)).toBeUndefined()
      const reset = ActivityWorktree.make({ registrations: fixture.load })
      expect(reset.snapshot().instanceID).not.toBe(monitor.snapshot().instanceID)
      expect(reset.snapshot().snapshotRevision).toBe("0")
      expect(reset.snapshot().inventoryAt).toBeUndefined()
      const resetRows = await reset.inventory()
      expect(resetRows.records).toHaveLength(1)
      expect(resetRows.records[0]?.recordID).not.toBe(roundTrip.recordID)
      const nonempty = monitor.snapshot()
      await Effect.runPromise(
        fixture.registrations.remove({ projectID: fixture.projectID, directory: fixture.directory }),
      )
      const empty = await monitor.inventory()
      expect(empty.records).toEqual([])
      expect(empty.inventoryAt).toBeDefined()
      expect(BigInt(empty.snapshotRevision) - BigInt(nonempty.snapshotRevision)).toBe(1n)
      expect(await monitor.read(roundTrip.recordID)).toBeUndefined()
      await Effect.runPromise(
        fixture.registrations.create({
          projectID: fixture.projectID,
          directory: fixture.directory,
          strategy: "git_worktree",
        }),
      )
      await Effect.runPromise(fixture.database.db.run(sql`UPDATE project_directory SET time_created = 7`))
      const old = (await monitor.inventory()).records[0]!
      const gate = source.hold()
      const lateInventory = monitor.inventory()
      const requests: Promise<unknown>[] = [lateInventory]
      const priorWalks = walks.count
      try {
        await entered(gate.entered.promise, requests)
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
        await Effect.runPromise(fixture.database.db.run(sql`UPDATE project_directory SET time_created = 7`))
        requests.push(monitor.read(old.recordID))
      } finally {
        gate.release.resolve()
        await bounded(Promise.allSettled(requests))
      }
      expect((await lateInventory).records[0]?.recordID).toBe(old.recordID)
      expect(await requests[1]).toBeUndefined()
      expect(walks.count).toBe(priorWalks)
      expect(monitor.snapshot().records).toHaveLength(1)
      expect(monitor.snapshot().records[0]?.registrationID).toBe((await fixture.load())[0]?.registrationID)
      expect(monitor.snapshot().records[0]?.registrationID).not.toBe(old.registrationID)
      expect(monitor.snapshot().records[0]?.logical).toBeUndefined()
      expect(source.calls.maximum).toBe(1)
    })
  }),
)

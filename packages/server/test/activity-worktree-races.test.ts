import { expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { ActivityDisk } from "@orchestra/core/activity-disk"
import { AbsolutePath } from "@orchestra/core/schema"
import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { it, serve, bounded, entered } from "./activity-worktree-fixture"

it.live("W06 real HTTP walks coalesce, enforce capacity and reject retired incarnations before publication", () =>
  Effect.gen(function* () {
    const base = yield* serve()
    yield* Effect.promise(async () => {
      await Bun.write(path.join(base.directory, "file"), "1")
      await Promise.all(
        Array.from({ length: 4 }, async (_, index) => {
          const directory = AbsolutePath.make(path.join(base.root.path, `extra-${index}`))
          await fs.mkdir(directory)
          await Bun.write(path.join(directory, "file"), "1")
          await Effect.runPromise(
            base.registrations.create({ projectID: base.projectID, directory, strategy: "git_worktree" }),
          )
        }),
      )
    })
    // Each validation must query after admission, including an older GET held across replacement.
    for (const boundary of ["pre", "post"]) {
      const gate = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
      const walk = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
      const source: { next?: typeof gate; active: number; maximum: number; total: number } = {
        active: 0,
        maximum: 0,
        total: 0,
      }
      const admitted = Promise.withResolvers<void>()
      const server = yield* serve({
        fixture: base,
        afterReadAdmission: () => admitted.resolve(),
        afterRegistryRead: async () => {
          source.total++
          source.active++
          source.maximum = Math.max(source.maximum, source.active)
          const held = source.next
          delete source.next
          try {
            if (held) {
              held.entered.resolve()
              await held.release.promise
            }
          } finally {
            source.active--
          }
        },
        measure: async (directory, limits) => {
          const actual = await ActivityDisk.measure(directory, limits)
          if (boundary === "post") {
            walk.entered.resolve()
            await walk.release.promise
          }
          return actual
        },
      })
      yield* Effect.promise(async () => {
        const initial = await server.inventory()
        const target = initial.records.find((row) => row.directory === server.directory)!
        const requests: Promise<Response>[] = []
        try {
          if (boundary === "post") {
            requests.push(server.read(target.recordID))
            await entered(walk.entered.promise, requests)
          }
          source.next = gate
          requests.push(server.request("/api/activity/worktrees"))
          await entered(gate.entered.promise, requests)
          await Effect.runPromise(
            server.registrations.remove({ projectID: server.projectID, directory: server.directory }),
          )
          await Effect.runPromise(
            server.registrations.create({
              projectID: server.projectID,
              directory: server.directory,
              strategy: "git_worktree",
            }),
          )
          if (boundary === "pre") {
            requests.push(server.read(target.recordID))
            await entered(admitted.promise, requests)
          }
        } finally {
          delete source.next
          walk.release.resolve()
          gate.release.resolve()
          await bounded(Promise.allSettled(requests))
        }
        const read = await requests[boundary === "pre" ? 1 : 0]!
        const inventory = await requests[boundary === "pre" ? 0 : 1]!
        expect(read.status).toBe(400)
        expect(inventory.status).toBe(200)
        expect(
          Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(await inventory.json()).records.find(
            (row) => row.directory === server.directory,
          )?.recordID,
        ).toBe(target.recordID)
        expect(server.calls.walks).toBe(boundary === "pre" ? 0 : 1)
        expect(source.total).toBe(boundary === "pre" ? 3 : 4)
        expect(source.maximum).toBe(1)
        const current = server.snapshot().records.find((row) => row.directory === server.directory)!
        const persisted = await Effect.runPromise(
          server.registrations.getRegistration({ projectID: server.projectID, directory: server.directory }),
        )
        expect(persisted).toBeDefined()
        expect(current.registrationID).toBe(persisted!.registrationID)
        expect(current.recordID).not.toBe(target.recordID)
        expect(Object.hasOwn(current, "logical")).toBe(false)
        expect((await server.inventory()).records.find((row) => row.directory === server.directory)).toEqual(current)
      })
    }
    for (const mode of ["recreate", "aba"]) {
      const gate = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>(), arrivals: 0 }
      const phase = { holding: true }
      const server = yield* serve({
        fixture: base,
        measure: async (directory, limits) => {
          const result = await ActivityDisk.measure(directory, limits)
          if (phase.holding) {
            gate.arrivals++
            if (gate.arrivals === 4) gate.entered.resolve()
            await gate.release.promise
          }
          return result
        },
      })
      yield* Effect.promise(async () => {
        await Effect.runPromise(server.database.db.run(sql`UPDATE project_directory SET time_created = 7`))
        const initial = await server.inventory()
        expect(initial.records).toHaveLength(5)
        const target = initial.records.find((row) => row.directory === server.directory)!
        const others = initial.records.filter((row) => row.recordID !== target.recordID)
        const requests: Promise<Response>[] = []
        const cleanup: Promise<Response>[] = []
        try {
          requests.push(server.read(target.recordID))
          cleanup.push(server.read(target.recordID))
          others.slice(0, 3).forEach((row) => requests.push(server.read(row.recordID)))
          await entered(gate.entered.promise, [...requests, ...cleanup])
          const fifth = server.read(others[3]!.recordID)
          cleanup.push(fifth)
          const denied = await bounded(fifth)
          expect(denied.status).toBe(409)
          expect((await denied.json())._tag).toBe("ConflictError")
          const inventory = server.request("/api/activity/worktrees")
          cleanup.push(inventory)
          const cached = await bounded(inventory)
          expect(cached.status).toBe(200)
          expect(
            Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(await cached.json()).records.every(
              (row) => !row.logical,
            ),
          ).toBe(true)
          expect(server.calls.walks).toBe(4)
          if (mode === "recreate")
            await Effect.runPromise(
              server.registrations.remove({ projectID: server.projectID, directory: server.directory }),
            )
          if (mode === "aba")
            await Effect.runPromise(
              server.registrations.create({
                projectID: server.projectID,
                directory: server.directory,
                strategy: "copy",
                behavior: "replace",
              }),
            )
          await Effect.runPromise(
            server.registrations.create({
              projectID: server.projectID,
              directory: server.directory,
              strategy: "git_worktree",
              behavior: "replace",
            }),
          )
          await Effect.runPromise(server.database.db.run(sql`UPDATE project_directory SET time_created = 7`))
        } finally {
          phase.holding = false
          gate.release.resolve()
          await bounded(Promise.allSettled([...requests, ...cleanup]))
        }
        const responses = await Promise.all(requests)
        expect(responses.map((response) => response.status)).toEqual([400, 200, 200, 200])
        expect((await cleanup[0]!).status).toBe(400)
        const completed = await Promise.all(
          responses
            .slice(1)
            .map(async (response) => Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(await response.json())),
        )
        completed.sort((a, b) => (BigInt(a.snapshotRevision) < BigInt(b.snapshotRevision) ? -1 : 1))
        expect(completed.map((snapshot) => snapshot.records.filter((row) => row.logical).length)).toEqual([1, 2, 3])
        expect(new Set(completed.map((snapshot) => snapshot.snapshotRevision)).size).toBe(3)
        const current = await server.inventory()
        const replacement = current.records.find((row) => row.directory === server.directory)!
        expect(replacement.recordID).not.toBe(target.recordID)
        expect(replacement.registrationID).not.toBe(target.registrationID)
        const persisted = await Effect.runPromise(
          server.registrations.getRegistration({ projectID: server.projectID, directory: server.directory }),
        )
        expect(persisted).toBeDefined()
        expect(replacement.registrationID).toBe(persisted!.registrationID)
        expect(Object.hasOwn(replacement, "logical")).toBe(false)
        expect((await server.read(target.recordID)).status).toBe(400)
        expect((await server.read(others[3]!.recordID)).status).toBe(200)
        const reused = await bounded(Promise.all(current.records.slice(0, 4).map((row) => server.read(row.recordID))))
        expect(reused.every((response) => response.status === 200)).toBe(true)
        expect(server.calls.walks).toBe(9)
        const before = await server.inventory()
        const stale = before.records.find((row) => row.directory === server.directory)!
        await Effect.runPromise(
          server.registrations.create({
            projectID: server.projectID,
            directory: server.directory,
            strategy: "copy",
            behavior: "replace",
          }),
        )
        expect((await server.read(stale.recordID)).status).toBe(400)
        expect(server.calls.walks).toBe(9)
        await Effect.runPromise(
          server.registrations.create({
            projectID: server.projectID,
            directory: server.directory,
            strategy: "git_worktree",
            behavior: "replace",
          }),
        )
        const restored = (await server.inventory()).records.find((row) => row.directory === server.directory)!
        expect(restored.recordID).not.toBe(stale.recordID)
        expect(restored.logical).toBeUndefined()
        expect(await Bun.file(path.join(server.directory, "file")).text()).toBe("1")
      })
    }
  }),
)

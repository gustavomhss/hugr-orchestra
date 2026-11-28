import { expect } from "bun:test"
import { Effect } from "effect"
import { it, serve, bounded, entered } from "./activity-worktree-fixture"

it.live("worktree use proof selects the registered directory and reports held without exposing details", () =>
  Effect.gen(function* () {
    const calls: { objectID: string; directory: string }[] = []
    const input = {
      observeCwd: async (observation: { objectID: string; directory: string }) => {
        calls.push(observation)
        return { objectID: observation.objectID, method: "cwd" as const, outcome: "holder" as const }
      },
    }
    const server = yield* serve(input)
    yield* Effect.promise(async () => {
      const inventory = await server.inventory()
      expect(calls).toEqual([])
      const row = inventory.records[0]!
      expect(row).toBeDefined()
      const response = await server.request(`/api/activity/worktrees/${encodeURIComponent(row.recordID)}/use-proof?path=%2Fother`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: "/other", recordID: "other", pid: 987654321 }),
      })
      expect(response.status).toBe(200)
      const report = await response.json()
      expect(report.recordID).toBe(row.recordID)
      expect(typeof report.sampledAt).toBe("number")
      expect(report.state).toBe("held")
      expect(report.checks).toEqual(expect.arrayContaining([expect.objectContaining({ method: "cwd", outcome: "holder" })]))
      expect(report.checks.map((check: { method: string }) => check.method).sort()).toEqual(["cwd", "git-c", "live-lock", "open-file"])
      expect(calls).toEqual([{ objectID: row.recordID, directory: server.directory }])
      expect(JSON.stringify(report)).not.toContain(server.directory)
      expect(JSON.stringify(report)).not.toContain("987654321")
      expect(JSON.stringify(report)).not.toContain("/other")
    })
  }),
)

it.live("worktree use proof rejects unauthenticated, unknown, and retired IDs before observation", () =>
  Effect.gen(function* () {
    const calls: string[] = []
    const input = {
      observeCwd: async (observation: { objectID: string; directory: string }) => {
        calls.push(observation.objectID)
        return { objectID: observation.objectID, method: "cwd" as const, outcome: "holder" as const }
      },
    }
    const server = yield* serve(input)
    yield* Effect.promise(async () => {
      const row = (await server.inventory()).records[0]!
      const route = (id: string) => `/api/activity/worktrees/${encodeURIComponent(id)}/use-proof`
      expect((await server.request(route(row.recordID), { method: "POST" }, false)).status).toBe(401)
      expect((await server.request(route("unknown"), { method: "POST" })).status).toBe(400)
      await Effect.runPromise(server.registrations.remove({ projectID: server.projectID, directory: server.directory }))
      expect((await server.request(route(row.recordID), { method: "POST" })).status).toBe(400)
      expect(calls).toEqual([])
    })
  }),
)


it.live("worktree use proof rejects a registration replaced during observation", () =>
  Effect.gen(function* () {
    const gate = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
    const input = {
      observeCwd: async (observation: { objectID: string; directory: string }) => {
        gate.entered.resolve()
        await gate.release.promise
        return { objectID: observation.objectID, method: "cwd" as const, outcome: "holder" as const }
      },
    }
    const server = yield* serve(input)
    yield* Effect.promise(async () => {
      const initial = (await server.inventory()).records.find((row) => row.directory === server.directory)!
      const request = server.request(`/api/activity/worktrees/${encodeURIComponent(initial.recordID)}/use-proof`, { method: "POST" })
      try {
        await entered(gate.entered.promise, [request])
        await Effect.runPromise(server.registrations.remove({ projectID: server.projectID, directory: server.directory }))
        await Effect.runPromise(server.registrations.create({
          projectID: server.projectID,
          directory: server.directory,
          strategy: "git_worktree",
        }))
      } finally {
        gate.release.resolve()
        await bounded(Promise.allSettled([request]))
      }
      expect((await request).status).toBe(400)
      const replacement = (await server.inventory()).records.find((row) => row.directory === server.directory)!
      expect(replacement.recordID).not.toBe(initial.recordID)
      expect(replacement.registrationID).not.toBe(initial.registrationID)
      expect(Object.hasOwn(replacement, "useProof")).toBe(false)
      expect((await server.request(`/api/activity/worktrees/${encodeURIComponent(initial.recordID)}/use-proof`, { method: "POST" })).status).toBe(400)
    })
  }),
)

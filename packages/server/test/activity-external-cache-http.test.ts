import { expect } from "bun:test"
import { Effect } from "effect"
import { it, serve } from "./activity-worktree-fixture"

it.live("external cache inventory is authenticated, cached, and reports unavailable explicitly", () =>
  Effect.gen(function* () {
    const calls: string[] = []
    const snapshot = {
      instanceID: "instance",
      snapshotRevision: "0",
      readAt: 123,
      source: "node.fs.lstat" as const,
      coverage: "operator-declared-external-caches" as const,
      status: "unavailable" as const,
      records: [],
    }
    const input = { externalCaches: { snapshot: () => snapshot, read: async (id: string) => { calls.push(id); return { status: "unknown" as const } } } }
    const server = yield* serve(input)
    yield* Effect.promise(async () => {
      expect((await server.request("/api/activity/external-caches", {}, false)).status).toBe(401)
      expect((await server.request("/api/activity/external-caches/unknown/read", { method: "POST" }, false)).status).toBe(401)
      const response = await server.request("/api/activity/external-caches?path=%2Fsecret")
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(snapshot)
      expect(calls).toEqual([])
    })
  }),
)

it.live("external cache read forwards only the selected opaque ID and maps admission failures", () =>
  Effect.gen(function* () {
    const calls: string[] = []
    const snapshot = {
      instanceID: "instance",
      snapshotRevision: "1",
      readAt: 123,
      source: "node.fs.lstat" as const,
      coverage: "operator-declared-external-caches" as const,
      status: "ready" as const,
      records: [
        { id: "opaque id+1", name: "one", owner: "" as const, useProof: "unproved" as const, unique: "not-collapsed" as const },
        { id: "sibling", name: "two", owner: "" as const, useProof: "unproved" as const, unique: "not-collapsed" as const },
      ],
    }
    const input = { externalCaches: {
      snapshot: () => snapshot,
      read: async (id: string) => {
        calls.push(id)
        if (id === "unknown") return { status: "unknown" as const }
        if (id === "busy") return { status: "busy" as const }
        return { status: "observed" as const, snapshot }
      },
    } }
    const server = yield* serve(input)
    yield* Effect.promise(async () => {
      const response = await server.request(`/api/activity/external-caches/${encodeURIComponent("opaque id+1")}/read?path=%2Fsecret`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "/secret", id: "sibling" }),
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(snapshot)
      expect(calls).toEqual(["opaque id+1"])
      expect((await server.request("/api/activity/external-caches/unknown/read", { method: "POST" })).status).toBe(400)
      expect((await server.request("/api/activity/external-caches/busy/read", { method: "POST" })).status).toBe(409)
      expect(calls).toEqual(["opaque id+1", "unknown", "busy"])
      expect(JSON.stringify(snapshot)).not.toContain("/secret")
    })
  }),
)

import { expect, test } from "bun:test"
import { ServiceUnavailableError } from "@orchestra/protocol/errors"
import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { Effect, Schema } from "effect"
import { it, serve } from "./activity-worktree-fixture"

const decodeSnapshot = Schema.decodeUnknownSync(ActivityMonitor.DockerSnapshot)

it.live("Docker anchors expose authenticated cached reads and an explicit unavailable stub", () =>
  Effect.gen(function* () {
    const server = yield* serve()
    yield* Effect.promise(async () => {
      expect((await server.request("/api/activity/docker", {}, false)).status).toBe(401)
      expect((await server.request("/api/activity/docker/read", { method: "POST" }, false)).status).toBe(401)

      const before = decodeSnapshot(await server.client.activity.docker())
      expect(before.coverage).toBe("containers")
      expect(before.source).toBe("docker container ls --all --no-trunc --size --format json")
      expect(before.snapshotRevision).toBe("0")
      expect(before).not.toHaveProperty("inventory")
      expect(before).not.toHaveProperty("attempt")

      const response = await server.request("/api/activity/docker/read", { method: "POST" })
      expect(response.status).toBe(503)
      const error = Schema.decodeUnknownSync(ServiceUnavailableError)(await response.json())
      expect(error.service).toBe("activity.docker")
      await expect(server.client.activity.readDocker()).rejects.toMatchObject({
        _tag: "ServiceUnavailableError",
        service: "activity.docker",
      })

      const after = decodeSnapshot(await server.client.activity.docker())
      expect(after).toEqual({ ...before, readAt: after.readAt })
    })
  }),
)

test("Docker schema separates unread, complete empty, and retained inventory", () => {
  const header = {
    instanceID: "docker-instance",
    source: "docker container ls --all --no-trunc --size --format json",
    coverage: "containers",
    readAt: 300,
  }
  const unread = { ...header, snapshotRevision: "0" }
  const empty = {
    ...header,
    snapshotRevision: "9007199254740993",
    inventory: { sampledAt: 200, containers: [] },
    attempt: { startedAt: 199, sampledAt: 200, state: "complete", gaps: [] },
  }
  const partial = {
    ...empty,
    snapshotRevision: "9007199254740994",
    attempt: { startedAt: 209, sampledAt: 210, state: "partial", gaps: ["stdout-truncated", "row-limit"] },
  }
  expect(decodeSnapshot(unread)).toEqual(unread)
  expect(decodeSnapshot(empty)).toEqual(empty)
  expect(decodeSnapshot(partial)).toEqual(partial)
  expect(() => decodeSnapshot({ ...empty, snapshotRevision: 1 })).toThrow()
  expect(() => decodeSnapshot({ ...empty, snapshotRevision: "01" })).toThrow()
  expect(() => decodeSnapshot({ ...unread, inventory: empty.inventory })).toThrow()
  expect(() => decodeSnapshot({ ...unread, attempt: empty.attempt })).toThrow()
  expect(() => decodeSnapshot({ ...unread, snapshotRevision: "1" })).toThrow()
  expect(() => decodeSnapshot({ ...unread, snapshotRevision: "1", attempt: empty.attempt })).toThrow()
  expect(() => decodeSnapshot({ ...partial, attempt: { ...partial.attempt, gaps: [] } })).toThrow()
})

test("Docker rows expose formatted size only as text, with explicit unread logical bytes", () => {
  const row = {
    containerID: "full-container-id",
    owner: "",
    logical: null,
    unique: "não colapsei",
    useProof: "unproved",
  }
  const decodeRow = Schema.decodeUnknownSync(ActivityMonitor.DockerContainer)
  expect(decodeRow(row)).not.toHaveProperty("sizeText")
  const observed = { ...row, sizeText: "35.58 kB (virtual 109.2 MB)" }
  expect(decodeRow(observed)).toEqual(observed)
  expect(() => decodeRow({ ...row, sizeText: 0 })).toThrow()
  expect(() => decodeRow({ ...row, logical: 0 })).toThrow()
  expect(() => decodeRow({ ...row, owner: "guessed" })).toThrow()
})

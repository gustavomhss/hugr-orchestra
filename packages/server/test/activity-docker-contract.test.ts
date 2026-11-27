import { expect, test } from "bun:test"
import { AppProcess } from "@orchestra/core/process"
import { ServiceUnavailableError } from "@orchestra/protocol/errors"
import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { Effect, Schema } from "effect"
import { systemError } from "effect/PlatformError"
import { ChildProcess } from "effect/unstable/process"
import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { ActivityGroup } from "@orchestra/protocol/groups/activity"
import { bounded, it, serve } from "./activity-worktree-fixture"
import { dockerProcess, dockerResult } from "./activity-docker-process-fixture"

const decodeSnapshot = Schema.decodeUnknownSync(ActivityMonitor.DockerSnapshot)

const dockerPath = "/api/activity/docker"
const dockerReadPath = "/api/activity/docker/read"
const post = { method: "POST" }

it.live("Docker GET stays unread and auth rejects both endpoints without running the process", () =>
  Effect.gen(function* () {
    let calls = 0
    const server = yield* serve({
      dockerProcess: dockerProcess(() => {
        calls++
        return Effect.succeed(dockerResult())
      }),
    })
    yield* Effect.promise(async () => {
      for (const request of [
        { path: dockerPath, init: {} },
        { path: dockerReadPath, init: post },
      ]) {
        expect((await server.request(request.path, request.init, false)).status).toBe(401)
        expect(
          (
            await server.request(
              request.path,
              {
                ...request.init,
                headers: { Authorization: "Basic " + btoa("orchestra:wrong-password") },
              },
              false,
            )
          ).status,
        ).toBe(401)
      }
      const unread = decodeSnapshot(await server.client.activity.docker())
      expect(unread.snapshotRevision).toBe("0")
      expect(unread.coverage).toBe("containers")
      expect(unread.source).toBe("docker container ls --all --no-trunc --size --format json")
      expect(unread).not.toHaveProperty("inventory")
      expect(unread).not.toHaveProperty("attempt")
      const again = decodeSnapshot(await server.client.activity.docker())
      expect(again).toEqual({ ...unread, readAt: again.readAt })
      expect(calls).toBe(0)
    })
  }),
)

it.live("Docker POST uses the fixed process request and publishes a sample the generated GET can recall", () =>
  Effect.gen(function* () {
    const calls: { command: ChildProcess.Command; options: AppProcess.RunOptions | undefined }[] = []
    const server = yield* serve({
      dockerProcess: dockerProcess((command, options) => {
        calls.push({ command, options })
        return Effect.succeed(dockerResult('{"ID":"container-full-id","Size":"35.58 kB (virtual 109.2 MB)"}\n'))
      }),
    })
    yield* Effect.promise(async () => {
      const before = decodeSnapshot(await server.client.activity.docker())
      expect(calls).toHaveLength(0)
      const raw = await server.request(dockerReadPath + "?path=untrusted&context=untrusted", {
        ...post,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ argv: ["system", "df"], path: "untrusted", effect: "quarantine" }),
      })
      expect(raw.status).toBe(200)
      const body: unknown = await raw.json()
      const snapshot = decodeSnapshot(body)
      expect(body).toEqual(snapshot)
      expect(snapshot).toMatchObject({
        instanceID: before.instanceID,
        snapshotRevision: "1",
        attempt: { state: "complete", gaps: [] },
      })
      expect(snapshot.inventory?.sampledAt).toBe(snapshot.attempt?.sampledAt)
      expect(snapshot.inventory?.containers).toEqual([
        {
          containerID: "container-full-id",
          sizeText: "35.58 kB (virtual 109.2 MB)",
          owner: "",
          logical: null,
          unique: "não colapsei",
          useProof: "unproved",
        },
      ])

      const cached = decodeSnapshot(await server.client.activity.docker())
      expect(cached).toEqual({ ...snapshot, readAt: cached.readAt })
      expect(calls).toEqual([
        {
          command: ChildProcess.make("docker", [
            "container",
            "ls",
            "--all",
            "--no-trunc",
            "--size",
            "--format",
            "json",
          ]),
          options: { timeout: 5_000, maxOutputBytes: 262_144, maxErrorBytes: 16_384 },
        },
      ])
    })
  }),
)

it.live("overlapping authenticated Docker POSTs share one flight while GET reads only the previous revision", () =>
  Effect.gen(function* () {
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const secondDispatched = Promise.withResolvers<void>()
    let calls = 0
    let dispatched = 0
    const server = yield* serve({
      afterDockerPostDispatch: () => {
        if (++dispatched === 2) secondDispatched.resolve()
      },
      dockerProcess: dockerProcess(() =>
        Effect.promise(async () => {
          calls++
          started.resolve()
          await release.promise
          return dockerResult('{"ID":"coalesced-container"}')
        }),
      ),
    })

    yield* Effect.promise(async () => {
      const unread = decodeSnapshot(await server.client.activity.docker())
      const first = server.request(dockerReadPath, post)
      const pending = [first]
      try {
        await bounded(
          Promise.race([
            started.promise,
            first.then(({ status }) => {
              throw new Error("Docker POST answered " + status + " before starting the collector")
            }),
          ]),
        )
        const second = server.request(dockerReadPath, post)
        pending.push(second)
        await bounded(secondDispatched.promise)
        const cached = decodeSnapshot(await bounded(server.client.activity.docker()))
        expect(cached).toEqual({ ...unread, readAt: cached.readAt })
        expect(calls).toBe(1)
        release.resolve()
        const responses = await bounded(Promise.all(pending))
        expect(responses.map((res) => res.status)).toEqual([200, 200])
        const firstSample = decodeSnapshot(await responses[0]?.json())
        const secondSample = decodeSnapshot(await responses[1]?.json())
        expect(firstSample.snapshotRevision).toBe("1")
        expect(secondSample).toEqual(firstSample)
        expect(calls).toBe(1)

        const next = decodeSnapshot(await bounded(server.client.activity.readDocker()))
        expect(next).toMatchObject({ instanceID: firstSample.instanceID, snapshotRevision: "2" })
        expect(calls).toBe(2)
      } finally {
        release.resolve()
        await bounded(Promise.allSettled(pending))
      }
    })
  }),
)

const failed = () => Effect.succeed(dockerResult('{"ID":"ignored"}', { exitCode: 17 }))
const partial = () => Effect.succeed(dockerResult('{"ID":"ignored"}\n{"ID":', { stdoutTruncated: true }))
const unavailable = () =>
  Effect.fail(
    new AppProcess.AppProcessError({
      command: "docker",
      cause: systemError({ _tag: "NotFound", module: "ChildProcess", method: "spawn" }),
    }),
  )
const unsuccessful = [
  { state: "failed", gap: "nonzero-exit", run: failed },
  { state: "partial", gap: "stdout-truncated", run: partial },
  { state: "unavailable", gap: "executable-missing", run: unavailable },
] as const

for (const result of unsuccessful) {
  it.live("first " + result.state + " Docker POST reports an attempt without publishing an empty inventory", () =>
    Effect.gen(function* () {
      const server = yield* serve({ dockerProcess: dockerProcess(result.run) })
      yield* Effect.promise(async () => {
        const response = await server.request(dockerReadPath, post)
        expect(response.status).toBe(200)
        const wire: unknown = await response.json()
        const snapshot = decodeSnapshot(wire)
        expect(wire).toEqual(snapshot)
        expect(snapshot.snapshotRevision).toBe("1")
        expect(snapshot.attempt).toMatchObject({ state: result.state, gaps: [result.gap] })
        expect(snapshot).not.toHaveProperty("inventory")
        const cached = decodeSnapshot(await server.client.activity.docker())
        expect(cached).toEqual({ ...snapshot, readAt: cached.readAt })
      })
    }),
  )
}

it.live("Docker POST retains the complete sample across failures until a successful empty reading replaces it", () =>
  Effect.gen(function* () {
    const results = [
      () => Effect.succeed(dockerResult('{"ID":"retained-container"}')),
      ...unsuccessful.map((result) => result.run),
      () => Effect.succeed(dockerResult()),
    ]
    let calls = 0
    const server = yield* serve({
      dockerProcess: dockerProcess(() => results[calls++]?.() ?? Effect.die("Unexpected Docker read")),
    })
    yield* Effect.promise(async () => {
      const complete = decodeSnapshot(await server.client.activity.readDocker())
      expect(complete.snapshotRevision).toBe("1")
      expect(complete.inventory?.containers.map((row) => row.containerID)).toEqual(["retained-container"])
      for (const [index, result] of unsuccessful.entries()) {
        const snapshot = decodeSnapshot(await server.client.activity.readDocker())
        expect(snapshot).toMatchObject({
          instanceID: complete.instanceID,
          snapshotRevision: String(index + 2),
          attempt: { state: result.state, gaps: [result.gap] },
        })
        expect(snapshot.inventory).toEqual(complete.inventory)
        const cached = decodeSnapshot(await server.client.activity.docker())
        expect(cached).toEqual({ ...snapshot, readAt: cached.readAt })
        expect(calls).toBe(index + 2)
      }

      const empty = decodeSnapshot(await server.client.activity.readDocker())
      expect(empty).toMatchObject({
        instanceID: complete.instanceID,
        snapshotRevision: "5",
        attempt: { state: "complete", gaps: [] },
      })
      expect(empty.inventory).toEqual({ sampledAt: empty.attempt?.sampledAt ?? -1, containers: [] })
      const cached = decodeSnapshot(await server.client.activity.docker())
      expect(cached).toEqual({ ...empty, readAt: cached.readAt })
      expect(calls).toBe(5)
    })
  }),
)

it.live("Docker POST maps a missing process service to typed 503 without advancing the cache", () =>
  Effect.gen(function* () {
    const server = yield* serve()
    yield* Effect.promise(async () => {
      const before = decodeSnapshot(await server.client.activity.docker())
      expect(before.snapshotRevision).toBe("0")
      expect((await server.request(dockerReadPath, post, false)).status).toBe(401)
      const response = await server.request(dockerReadPath, post)
      expect(response.status).toBe(503)
      const error = Schema.decodeUnknownSync(ServiceUnavailableError)(await response.json())
      expect(error.service).toBe("activity.docker")
      await expect(server.client.activity.readDocker()).rejects.toMatchObject({
        _tag: "ServiceUnavailableError",
        service: "activity.docker",
      })
      const cached = decodeSnapshot(await server.client.activity.docker())
      expect(cached).toEqual({ ...before, readAt: cached.readAt })
    })
  }),
)

test("Docker API advertises only a cache GET and a bodyless explicit POST", () => {
  const paths = OpenApi.fromApi(HttpApi.make("activity").add(ActivityGroup)).paths
  expect(
    Object.keys(paths)
      .filter((path) => path.startsWith(dockerPath))
      .sort(),
  ).toEqual([dockerPath, dockerReadPath])
  expect(Object.keys(paths[dockerPath] ?? {})).toEqual(["get"])
  expect(Object.keys(paths[dockerReadPath] ?? {})).toEqual(["post"])
  expect(paths[dockerReadPath]?.post?.requestBody).toBeUndefined()
  expect(paths[dockerReadPath]?.post?.parameters).toHaveLength(0)
})

test("Docker schema separates unread, complete empty, and retained inventory", () => {
  const header = {
    instanceID: "docker-instance",
    source: "docker container ls --all --no-trunc --size --format json",
    coverage: "containers",
    readAt: 300,
  } as const
  const unread = { ...header, snapshotRevision: "0" } as const
  const empty = {
    ...header,
    snapshotRevision: "9007199254740993",
    inventory: { sampledAt: 200, containers: [] },
    attempt: { startedAt: 199, sampledAt: 200, state: "complete", gaps: [] },
  } as const
  const partial = {
    ...empty,
    snapshotRevision: "9007199254740994",
    attempt: { startedAt: 209, sampledAt: 210, state: "partial", gaps: ["stdout-truncated", "row-limit"] },
  } as const
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
  } as const
  const decodeRow = Schema.decodeUnknownSync(ActivityMonitor.DockerContainer)
  expect(decodeRow(row)).not.toHaveProperty("sizeText")
  const observed = { ...row, sizeText: "35.58 kB (virtual 109.2 MB)" }
  expect(decodeRow(observed)).toEqual(observed)
  expect(() => decodeRow({ ...row, sizeText: 0 })).toThrow()
  expect(() => decodeRow({ ...row, logical: 0 })).toThrow()
  expect(() => decodeRow({ ...row, owner: "guessed" })).toThrow()
})

import { expect } from "bun:test"
import { ActivityDocker } from "@orchestra/core/activity-docker"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { Deferred, Effect, Fiber } from "effect"
import { systemError } from "effect/PlatformError"
import { TestClock } from "effect/testing"
import { ChildProcess } from "effect/unstable/process"
import { expectSpawn } from "./fixture/omni-expect"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))
const docker = "docker container ls --all --no-trunc --size --format json"

const result = (stdout: string, overrides: Partial<AppProcess.RunResult> = {}) => ({
  command: docker,
  exitCode: 0,
  stdout: Buffer.from(stdout),
  stderr: Buffer.alloc(0),
  stdoutTruncated: false,
  stderrTruncated: false,
  ...overrides,
})

const spawnError = (_tag: "NotFound" | "PermissionDenied") =>
  new AppProcess.AppProcessError({
    command: docker,
    cause: systemError({ _tag, module: "ChildProcess", method: "spawn" }),
  })

const withRun = <A, E>(read: Effect.Effect<A, E, AppProcess.Service>, run: AppProcess.Interface["run"]) =>
  Effect.gen(function* () {
    const processService = yield* AppProcess.Service
    return yield* read.pipe(Effect.provideService(AppProcess.Service, { ...processService, run }))
  })

it.live(
  "A02–A04 runs only the fixed capped command and keeps Docker size as labelled text",
  Effect.gen(function* () {
    const monitor = ActivityDocker.make()
    const calls: { command: ChildProcess.Command; options: AppProcess.RunOptions | undefined }[] = []
    const now = monitor.snapshot()
    expect(now).toMatchObject({ snapshotRevision: "0", source: docker, coverage: "containers" })
    expect(now.inventory).toBeUndefined()
    expect(now.attempt).toBeUndefined()
    expect(monitor.snapshot().snapshotRevision).toBe("0")
    expect(calls).toHaveLength(0)

    const read = yield* withRun(monitor.read(), (command, options) => {
      calls.push({ command, options })
      return Effect.succeed(
        result(
          '{"ID":"same-prefix-a","Names":"front","Size":"35.58 kB (virtual 109.2 MB)","State":"exited","Owner":"agent","Labels":"scope=agent","Mounts":"/tmp","UniqueSize":"42B"}\r\n' +
            '{"ID":"same-prefix-b"}\r\n',
        ),
      )
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toMatchObject({
      _tag: "StandardCommand",
      command: "docker",
      args: ["container", "ls", "--all", "--no-trunc", "--size", "--format", "json"],
      options: {},
    })
    expect(calls[0]?.command._tag === "StandardCommand" && calls[0].command.options.shell).toBeFalsy()
    expect(calls[0]?.options).toEqual({ timeout: 5_000, maxOutputBytes: 262_144, maxErrorBytes: 16_384 })
    expect(read).toMatchObject({
      instanceID: now.instanceID,
      snapshotRevision: "1",
      source: docker,
      coverage: "containers",
    })
    expect(read.attempt).toEqual({
      state: "complete",
      startedAt: expect.any(Number),
      sampledAt: read.inventory?.sampledAt,
      gaps: [],
    })
    expect(read.inventory?.containers).toEqual([
      {
        containerID: "same-prefix-a",
        name: "front",
        sizeText: "35.58 kB (virtual 109.2 MB)",
        owner: "",
        logical: null,
        unique: "não colapsei",
        useProof: "unproved",
      },
      { containerID: "same-prefix-b", owner: "", logical: null, unique: "não colapsei", useProof: "unproved" },
    ])
    expect(monitor.snapshot().snapshotRevision).toBe("1")
    expect(monitor.snapshot().inventory).toEqual(read.inventory)
    expect(calls).toHaveLength(1)
  }),
)

it.live(
  "A219 commits a complete zero-line inventory, explicitly distinct from unread",
  Effect.gen(function* () {
    const monitor = ActivityDocker.make()
    expect(monitor.snapshot().inventory).toBeUndefined()
    const read = yield* withRun(monitor.read(), () => Effect.succeed(result("")))
    expect(read.attempt?.state).toBe("complete")
    expect(read.inventory).toEqual({ sampledAt: read.attempt?.sampledAt ?? -1, containers: [] })
  }),
)

const thousand = Array.from({ length: 1_000 }, (_, index) => JSON.stringify({ ID: "id-" + index })).join("\n")

it.live(
  "A172 accepts exactly 1,000 records without requiring a final newline",
  Effect.gen(function* () {
    const read = yield* withRun(ActivityDocker.make().read(), () => Effect.succeed(result(thousand)))
    expect(read.attempt?.state).toBe("complete")
    expect(read.inventory?.containers).toHaveLength(1_000)
    expect(read.inventory?.containers.at(-1)?.containerID).toBe("id-999")
  }),
)

const scenarios: ReadonlyArray<{
  name: string
  run: AppProcess.Interface["run"]
  state: "failed" | "unavailable" | "partial"
  gaps: ReadonlyArray<ActivityMonitor.DockerGap>
}> = [
  {
    name: "missing executable before exit is unavailable",
    run: () => Effect.fail(spawnError("NotFound")),
    state: "unavailable",
    gaps: ["executable-missing"],
  },
  {
    name: "missing process permission is unavailable",
    run: () => Effect.fail(spawnError("PermissionDenied")),
    state: "unavailable",
    gaps: ["process-unavailable"],
  },
  {
    name: "a generic process error fails",
    run: () => Effect.fail(new AppProcess.AppProcessError({ command: docker, cause: new Error("fixture error") })),
    state: "failed",
    gaps: ["execution-failed"],
  },
  {
    name: "nonzero exit wins over truncation and retains its diagnostics",
    run: () => Effect.succeed(result("{", { exitCode: 17, stdoutTruncated: true, stderrTruncated: true })),
    state: "failed",
    gaps: ["nonzero-exit", "stderr-truncated", "stdout-truncated"],
  },
  {
    name: "stdout truncation wins over an invalid cut line",
    run: () => Effect.succeed(result('{"ID":"one"}\n{"ID":', { stdoutTruncated: true })),
    state: "partial",
    gaps: ["stdout-truncated"],
  },
  {
    name: "stderr truncation wins over a missing ID",
    run: () => Effect.succeed(result("{}", { stderrTruncated: true })),
    state: "partial",
    gaps: ["stderr-truncated"],
  },
  {
    name: "output truncation wins over a duplicate",
    run: () => Effect.succeed(result('{"ID":"one"}\n{"ID":"one"}', { outputTruncated: true })),
    state: "partial",
    gaps: ["output-truncated"],
  },
  {
    name: "more than 1,000 nonempty records wins before parsing malformed first and last records",
    run: () => Effect.succeed(result("{\n" + thousand + "\n{")),
    state: "partial",
    gaps: ["row-limit"],
  },
  {
    name: "an extra empty line does not count toward a partial row cap",
    run: () => Effect.succeed(result(thousand + "\n\n")),
    state: "failed",
    gaps: ["invalid-record"],
  },
  ...(
    [
      { name: "malformed", line: "{", gap: "invalid-record" },
      { name: "non-object", line: "[]", gap: "invalid-record" },
      { name: "blank interior", line: '\n{"ID":"two"}', gap: "invalid-record" },
      { name: "missing ID", line: "{}", gap: "missing-id" },
      { name: "non-string ID", line: '{"ID":12}', gap: "missing-id" },
      { name: "empty ID", line: '{"ID":""}', gap: "missing-id" },
      { name: "duplicate ID", line: '{"ID":"one"}', gap: "duplicate-id" },
    ] as const
  ).map((fixture) => ({
    name: "complete buffer fails on a " + fixture.name + " record",
    run: () => Effect.succeed(result('{"ID":"one"}\n' + fixture.line)),
    state: "failed" as const,
    gaps: [fixture.gap],
  })),
]

for (const scenario of scenarios) {
  it.live(
    "A172–A174/A219 " + scenario.name,
    Effect.gen(function* () {
      const monitor = ActivityDocker.make()
      const read = yield* withRun(monitor.read(), scenario.run)
      expect(read.snapshotRevision).toBe("1")
      expect(read.attempt?.state).toBe(scenario.state)
      expect(read.attempt?.gaps.toSorted()).toEqual(scenario.gaps.toSorted())
      expect(read.inventory).toBeUndefined()
      expect(monitor.snapshot().attempt).toEqual(read.attempt)
    }),
  )
}

it.effect(
  "A172–A174/A219 failed, partial and unavailable reads advance once and retain the complete sample and age",
  Effect.gen(function* () {
    const monitor = ActivityDocker.make()
    yield* TestClock.setTime(10_000)
    const complete = yield* withRun(monitor.read(), () => Effect.succeed(result('{"ID":"previous","Size":"0B"}')))
    expect(complete.attempt?.state).toBe("complete")
    expect(complete.inventory?.sampledAt).toBe(10_000)
    for (const [index, fixture] of [
      { state: "failed", run: () => Effect.succeed(result('{"ID":"ignored"}\n{')) },
      { state: "partial", run: () => Effect.succeed(result('{"ID":"ignored"}', { stderrTruncated: true })) },
      { state: "unavailable", run: () => Effect.fail(spawnError("NotFound")) },
    ].entries()) {
      const sampledAt = 20_000 + index
      yield* TestClock.setTime(sampledAt)
      const read = yield* withRun(monitor.read(), fixture.run)
      expect(read).toMatchObject({
        instanceID: complete.instanceID,
        snapshotRevision: String(index + 2),
        attempt: { state: fixture.state, sampledAt },
      })
      expect(read.inventory).toEqual(complete.inventory)
      expect(monitor.snapshot().snapshotRevision).toBe(read.snapshotRevision)
      expect(monitor.snapshot().inventory).toEqual(complete.inventory)
    }
    yield* TestClock.setTime(30_000)
    const empty = yield* withRun(monitor.read(), () => Effect.succeed(result("")))
    expect(empty).toMatchObject({
      instanceID: complete.instanceID,
      snapshotRevision: "5",
      attempt: { state: "complete", sampledAt: 30_000, gaps: [] },
    })
    expect(empty.inventory).toEqual({ sampledAt: 30_000, containers: [] })
    expect(monitor.snapshot().inventory).toEqual(empty.inventory)
  }),
)

it.live(
  "concurrent reads share one attempt across caller cancellation and refresh only on a later explicit read",
  Effect.gen(function* () {
    const monitor = ActivityDocker.make()
    const started = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    let calls = 0
    const read = withRun(monitor.read(), () =>
      Effect.gen(function* () {
        calls++
        yield* Deferred.succeed(started, undefined)
        yield* Deferred.await(release)
        return result('{"ID":"same-flight"}')
      }),
    )

    const first = yield* Effect.forkChild(read, { startImmediately: true })
    yield* Effect.raceFirst(Deferred.await(started), Fiber.join(first).pipe(Effect.asVoid))
    expect(monitor.snapshot().snapshotRevision).toBe("0")
    const second = yield* Effect.forkChild(read, { startImmediately: true })
    yield* Fiber.interrupt(first)
    const third = yield* Effect.forkChild(read, { startImmediately: true })
    expect(calls).toBe(1)
    yield* Deferred.succeed(release, undefined)
    const joined = yield* Fiber.join(second)
    expect(yield* Fiber.join(third)).toEqual(joined)
    expect(joined.snapshotRevision).toBe("1")
    expect(monitor.snapshot().snapshotRevision).toBe("1")
    expect(yield* read).toMatchObject({ snapshotRevision: "2" })
    expect(calls).toBe(2)
    expect(monitor.snapshot().snapshotRevision).toBe("2")
  }),
)

it.live(
  "Omni applies separate stdout and stderr caps to a daemon-free fixture and reports an actual missing executable",
  Effect.gen(function* () {
    const monitor = ActivityDocker.make()
    const processService = yield* AppProcess.Service
    const truncated = yield* withRun(monitor.read(), (_, options) => {
      expectSpawn(import.meta.path)
      return processService
        .run(
          ChildProcess.make(process.execPath, [
            "-e",
            "await Bun.write(Bun.stdout, 'x'.repeat(270000)); await Bun.write(Bun.stderr, 'y'.repeat(20000))",
          ]),
          options,
        )
        .pipe(
          Effect.tap((output) => {
            expect(output.stdout.length).toBe(262_144)
            expect(output.stderr.length).toBe(16_384)
            expect(output.stdoutTruncated).toBe(true)
            expect(output.stderrTruncated).toBe(true)
          }),
        )
    })
    expect(truncated.attempt?.state).toBe("partial")
    expect(truncated.attempt?.gaps.toSorted()).toEqual(["stderr-truncated", "stdout-truncated"])
    expect(truncated.inventory).toBeUndefined()

    const unavailable = yield* withRun(monitor.read(), (_, options) =>
      processService.run(ChildProcess.make("orchestra-missing-" + crypto.randomUUID()), options),
    )
    expect(unavailable.attempt).toMatchObject({ state: "unavailable", gaps: ["executable-missing"] })
  }),
)

it.live(
  "A172–A174 Omni deadline wins after a stream was truncated and preserves its diagnostic",
  Effect.gen(function* () {
    const processService = yield* AppProcess.Service
    const read = yield* withRun(ActivityDocker.make().read(), (_, options) => {
      expectSpawn(import.meta.path)
      return processService.run(
        ChildProcess.make(process.execPath, [
          "-e",
          "await Bun.write(Bun.stdout, 'x'.repeat(270000)); setInterval(() => {}, 1000)",
        ]),
        options,
      )
    })
    expect(read.attempt?.state).toBe("failed")
    expect(read.attempt?.gaps.toSorted()).toEqual(["stdout-truncated", "timeout"])
    expect(read.inventory).toBeUndefined()
  }),
  15_000,
)

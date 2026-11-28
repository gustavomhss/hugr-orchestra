import { expect } from "bun:test"
import { existsSync, renameSync } from "node:fs"
import { Effect, Fiber, Tracer } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { FSUtil } from "../../src/fs-util"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewLocalReadProcess } from "../../src/review-toolkit/local-read-process"
import { ToolSafetySandboxRuntime } from "../../src/tool-safety-sandbox-runtime"
import { expectSpawn } from "../fixture/omni-expect"
import { ReviewSandboxRemovalFixture } from "../fixture/review-sandbox-removal"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const native = process.platform === "linux" && process.arch === "x64"

if (!native) it.live("non-Linux-x64 local read refuses before source resolution, wrap or execution", () => Effect.gen(function* () {
  const source = { directory: "/unprepared-p1-runtime", dependencies: [], artifacts: [] }
  const calls: Parameters<typeof ResearchProcess.run>[0][] = []
  const result = yield* ReviewLocalReadProcess.run({ executable: "absent", root: "absent", args: [] }, (input) => {
    calls.push(input)
    return ResearchProcess.run(input)
  }).pipe(Effect.provideService(ToolSafetySandboxRuntime.Source, source))
  expect(result).toEqual({ denied: "read-sandbox-unsupported-host" })
  expect(calls).toEqual([])
  expect(existsSync(source.directory)).toBe(false)
}))

if (native) {
  it.live("default wrap really reacquires the pinned sandbox and completes a native confined read", () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* ReviewSandboxRemovalFixture.fixture
    yield* ReviewSandboxRemovalFixture.prepared(f)
    const positive = yield* f.inSource(ReviewLocalReadProcess.run(f.input))
    if ("denied" in positive) throw new Error(`P1 prerequisite failed: ${positive.denied}`)
    ReviewSandboxRemovalFixture.success(positive.outcome)
    const before = f.hits.length
    const cut = ReviewSandboxRemovalFixture.removal(f, "default")
    const outcome = yield* ReviewSandboxRemovalFixture.wrapped(f).pipe(
      Effect.withTracer(cut.tracer), Effect.ensuring(f.inSource(ToolSafetySandboxRuntime.settled())),
    )
    ReviewSandboxRemovalFixture.boundary(cut)
    ReviewSandboxRemovalFixture.success(outcome)
    expect(f.errors).toEqual([])
    expect(f.hits.length - before).toBe(f.source.artifacts.length)
    expect(existsSync(f.source.directory)).toBe(true)
  }), 600_000)

  it.live("actual local read refuses after real readiness and runtime removal at wrap without reacquiring", () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* ReviewSandboxRemovalFixture.fixture
    yield* ReviewSandboxRemovalFixture.prepared(f)
    const calls: Parameters<typeof ResearchProcess.run>[0][] = []
    const execute: typeof ResearchProcess.run = (input) => {
      calls.push(input)
      return ResearchProcess.run(input)
    }
    const positive = yield* f.inSource(ReviewLocalReadProcess.run(f.input, execute))
    if ("denied" in positive) throw new Error(`P1 prerequisite failed: ${positive.denied}`)
    ReviewSandboxRemovalFixture.success(positive.outcome)
    expect(calls).toHaveLength(1)
    const before = f.hits.length
    const cut = ReviewSandboxRemovalFixture.removal(f, "local-read")
    const result = yield* f.inSource(ReviewLocalReadProcess.run(f.input, execute)).pipe(
      Effect.withTracer(cut.tracer), Effect.ensuring(f.inSource(ToolSafetySandboxRuntime.settled())),
    )
    // The baseline must reach the intended cut after actual prerequisites; absence is not a qualified RED.
    ReviewSandboxRemovalFixture.boundary(cut)
    expect(f.errors).toEqual([])
    expect(result).toEqual({ denied: "read-sandbox-unavailable" })
    expect(f.hits.length).toBe(before)
    expect(calls).toHaveLength(1)
    expect(existsSync(f.source.directory)).toBe(false)
    const absent = yield* f.inSource(ReviewLocalReadProcess.run(f.input, execute))
    yield* f.inSource(ToolSafetySandboxRuntime.settled())
    expect(absent).toEqual({ denied: "read-sandbox-unavailable" })
    expect(f.hits.length).toBe(before)
    expect(calls).toHaveLength(1)
  }), 600_000)

  for (const endpoint of [false, true]) it.live(`explicit no-acquire wrap refuses the ${endpoint ? "pinned endpoint" : "ordinary read"} selection after real runtime removal`, () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* ReviewSandboxRemovalFixture.fixture
    yield* ReviewSandboxRemovalFixture.prepared(f)
    ReviewSandboxRemovalFixture.success(yield* ReviewSandboxRemovalFixture.wrapped(f, undefined, endpoint))
    const before = f.hits.length
    const cut = ReviewSandboxRemovalFixture.removal(f, endpoint ? "endpoint" : "read")
    // Structurally assignable on the baseline: the old host ignores acquire; no production shim is needed.
    const options = { prepareParents: false, acquire: false }
    const result = yield* ReviewSandboxRemovalFixture.wrapped(f, options, endpoint).pipe(
      Effect.withTracer(cut.tracer), Effect.exit,
      Effect.ensuring(f.inSource(ToolSafetySandboxRuntime.settled())),
    )
    ReviewSandboxRemovalFixture.boundary(cut)
    expect(f.errors).toEqual([])
    ReviewSandboxRemovalFixture.denied(result, endpoint
      ? "sandbox-loopback-endpoint-backend-unavailable"
      : "shell-read-sandbox-unavailable: sandbox-runtime-not-acquired")
    expect(f.hits.length).toBe(before)
    expect(existsSync(f.source.directory)).toBe(false)
  }), 600_000)

  it.live("no-acquire wrap refuses before releasing a separately owned real acquisition and leaves it able to finish", () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* ReviewSandboxRemovalFixture.fixture
    yield* ReviewSandboxRemovalFixture.prepared(f)
    ReviewSandboxRemovalFixture.success(yield* ReviewSandboxRemovalFixture.wrapped(f))
    const before = f.hits.length
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    const released = { value: false }
    yield* Effect.addFinalizer(() => Effect.sync(() => { released.value = true; release.resolve() }))
    f.transport.hold = { reached: () => started.resolve(), release: release.promise }
    yield* Effect.sync(() => renameSync(f.source.directory, `${f.source.directory}-inflight`))
    const preparation = yield* f.inSource(ToolSafetySandboxRuntime.ready()).pipe(Effect.forkChild)
    // The preparation really reached its first archive request and cannot complete before our release.
    yield* Effect.promise(() => started.promise).pipe(Effect.timeout("30 seconds"))
    expect(f.hits.length).toBe(before + 1)
    expect(yield* f.inSource(ToolSafetySandboxRuntime.resolve(false))).toEqual({ reason: "sandbox-runtime-acquiring" })
    expect(existsSync(f.source.directory)).toBe(false)
    const tracer = Tracer.make({ span: (options) => {
      if (options.name === "ToolSafetySandbox.wrap") entered.resolve()
      return new Tracer.NativeSpan(options)
    } })
    const options = { prepareParents: false, acquire: false }
    const wrapper = yield* ReviewSandboxRemovalFixture.selected(f, options).pipe(Effect.withTracer(tracer), Effect.exit, Effect.forkChild)
    yield* Effect.promise(() => entered.promise).pipe(Effect.timeout("30 seconds"))
    const observed = yield* Effect.raceFirst(
      Fiber.join(wrapper).pipe(Effect.map((exit) => ({ kind: "settled" as const, exit }))),
      Effect.sleep("5 seconds").pipe(Effect.as({ kind: "waited" as const })),
    )
    // Stop this caller if the baseline improperly waits. The independent preparation is never interrupted.
    yield* Fiber.interrupt(wrapper)
    expect(released.value).toBe(false)
    expect(f.hits.length).toBe(before + 1)
    expect(existsSync(f.source.directory)).toBe(false)
    yield* Effect.sync(() => { released.value = true; release.resolve() })
    yield* f.inSource(ToolSafetySandboxRuntime.settled())
    const completed = yield* Fiber.join(preparation)
    expect(completed.reason).toBeUndefined()
    if (completed.reason !== undefined) throw new Error(`P1 independent preparation failed: ${completed.reason}`)
    expect(completed.directory).toBe(f.source.directory)
    expect(f.errors).toEqual([])
    expect(f.hits.length - before).toBe(f.source.artifacts.length)
    ReviewSandboxRemovalFixture.success(yield* ReviewSandboxRemovalFixture.wrapped(f, options))
    expect(observed.kind).toBe("settled")
    if (observed.kind !== "settled") throw new Error("P1 opt-out incorrectly waited on another acquisition")
    ReviewSandboxRemovalFixture.denied(observed.exit, "shell-read-sandbox-unavailable: sandbox-runtime-acquiring")
  }), 600_000)
}

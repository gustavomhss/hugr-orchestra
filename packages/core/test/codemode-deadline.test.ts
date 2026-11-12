import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Deferred, Effect, Exit, Fiber, Schema, Stream, type Scope } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { AppProcess } from "../src/process"
import { expectSpawn } from "./fixture/omni-expect"

const source = path.resolve(import.meta.dir, "../../codemode/src")
const fixture = path.join(import.meta.dir, "fixture/codemode-deadline.mjs")
const Envelope = Schema.Struct({ type: Schema.String, payload: Schema.Unknown })
const maxBytes = 64 * 1024
const watchdogMs = 6500
const layer = AppNodeBuilder.build(AppProcess.node)

const runChild = Effect.fn("CodeModeDeadline.runChild")(function* (index: string, scenario: string, cpu = false) {
  const processes = yield* AppProcess.Service
  const child = yield* processes.spawn(ChildProcess.make(process.execPath, [fixture, pathToFileURL(index).href, scenario], {
    stdin: "ignore", stdout: "pipe", stderr: "pipe", killSignal: "SIGKILL", forceKillAfter: 100,
  }))
  const ready = yield* Deferred.make<void>()
  const admitted = yield* Deferred.make<void>()
  const messages = new Array<typeof Envelope.Type>()
  const state = { pending: "", bytes: 0, containmentKill: false }
  const decoder = new TextDecoder()
  const output = yield* Effect.forkChild(child.stdout.pipe(Stream.runForEach((chunk) => Effect.gen(function* () {
    state.bytes += chunk.length
    if (state.bytes > maxBytes) return yield* Effect.die("CodeMode fixture stdout exceeded 64KiB")
    const lines = (state.pending + decoder.decode(chunk, { stream: true })).split("\n")
    state.pending = lines.pop() ?? ""
    yield* Effect.forEach(lines.filter(Boolean), (line) => Effect.gen(function* () {
      const message = Schema.decodeUnknownSync(Envelope)(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(line))
      messages.push(message)
      if (message.type === "FIXTURE_READY") yield* Deferred.succeed(ready, undefined)
      if (message.type === "CPU_PHASE_ADMITTED") yield* Deferred.succeed(admitted, undefined)
    }))
  }))))
  const errorOutput = yield* Effect.forkChild(AppProcess.collectStream(child.stderr, maxBytes))
  const exited = yield* Effect.forkChild(Effect.exit(child.exitCode))
  const started = yield* Effect.raceFirst(
    Fiber.join(exited).pipe(Effect.as(false)),
    Deferred.await(cpu ? admitted : ready).pipe(Effect.as(true)),
  ).pipe(Effect.timeout("30 seconds"))
  const exit = started
    ? yield* Effect.raceFirst(
        Fiber.join(exited),
        Effect.sleep(watchdogMs).pipe(
          Effect.andThen(Effect.sync(() => { state.containmentKill = true })),
          Effect.andThen(child.kill({ killSignal: "SIGKILL" })),
          Effect.andThen(Fiber.join(exited)),
        ),
      )
    : yield* Fiber.join(exited)
  yield* Fiber.join(output)
  const errors = yield* Fiber.join(errorOutput)
  return {
    messages, containmentKill: state.containmentKill, exitCode: Exit.isSuccess(exit) ? exit.value : undefined,
    stderr: errors.buffer.toString(),
    stderrTruncated: errors.truncated, result: messages.find((message) => message.type === "RESULT")?.payload,
  }
})

type Report = Effect.Success<ReturnType<typeof runChild>>
function assertSetup(report: Report, cpu = false) {
  expect(report.stderrTruncated).toBe(false)
  expect(report.messages.filter((message) => message.type === "FIXTURE_ERROR")).toEqual([])
  expect(report.messages.some((message) => message.type === "FIXTURE_READY")).toBe(true)
  if (cpu) {
    expect(report.messages.some((message) => message.type === "WARMUP_READY")).toBe(true)
    const mark = report.messages.find((message) => message.type === "CPU_PHASE_ADMITTED")
    expect(mark, "SETUP: actual mark tool must admit the CPU phase").toBeDefined()
    const timing = Schema.decodeUnknownSync(Schema.Struct({ elapsedToMark: Schema.Number }))(mark?.payload)
    expect(timing.elapsedToMark, "SETUP: CPU phase needs at least 750ms of the unchanged 1500ms product budget")
      .toBeLessThan(750)
    expect(timing.elapsedToMark).toBeGreaterThanOrEqual(0)
  }
}

const run = <A, E>(body: Effect.Effect<A, E, AppProcess.Service | Scope.Scope>) =>
  Effect.runPromise(body.pipe(Effect.scoped, Effect.provide(layer)))

const compiled = Effect.gen(function* () {
  const directory = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(path.join(tmpdir(), "codemode-deadline-build-"))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
  const worker = path.join(source, "worker-entry.js")
  const workerExists = yield* Effect.promise(() => Bun.file(worker).exists())
  const build = yield* Effect.promise(() => Bun.build({
    entrypoints: [path.join(source, "index.ts"), ...(workerExists ? [worker] : [])],
    root: source, naming: { entry: "[name].js" }, outdir: directory, target: "bun", splitting: false,
  }))
  expect(build.success).toBe(true)
  expect(build.logs.filter((entry) => entry.level === "error")).toEqual([])
  expect(yield* Effect.promise(() => Bun.file(path.join(directory, "index.js")).exists())).toBe(true)
  if (workerExists)
    expect(yield* Effect.promise(() => Bun.file(path.join(directory, "worker-entry.js")).exists())).toBe(true)
  return path.join(directory, "index.js")
})

const ordinary = {
  literal: true, dynamic: ["ABB", "A", "BB"], state: ["abb", 0, 3, "abbb", 4, 8],
  named: ["ab", "42"], replaced: "a[1]b[22]", matches: [["1", "1", 1], ["22", "22", 3]],
  search: 1, split: ["a", "b", ""], substitution: "hi [o]",
}

for (const artifact of ["source", "compiled"] as const) {
  test(`CONTROL E10 ${artifact}: real public CodeMode regex/String/callback semantics`, () => {
    expectSpawn(import.meta.path)
    return run(Effect.gen(function* () {
      const index = artifact === "compiled" ? yield* compiled : path.join(source, "index.ts")
      const report = yield* runChild(index, "ordinary")
      assertSetup(report)
      expect(report.result).toMatchObject({ result: { ok: true, value: ordinary, toolCalls: [{ name: "decorate" }, { name: "decorate" }] } })
      expect(report.containmentKill).toBe(false)
      expect(report.exitCode).toBe(0)
    }))
  }, 120_000)
}

test("CONTROL E10 source: actual Effect service, hooks, receipts and maxToolCalls remain authoritative", () => {
  expectSpawn(import.meta.path)
  return run(Effect.gen(function* () {
    const report = yield* runChild(path.join(source, "index.ts"), "services")
    assertSetup(report)
    expect(report.result).toMatchObject({
      result: { ok: true, value: "host-value", toolCalls: [{ name: "value" }] },
      budget: { ok: false, error: { kind: "ToolCallLimitExceeded" }, toolCalls: [{ name: "value" }] },
      firstTrace: ["start:0:value:host-value", "run:host-value", "end:0:value:success:host-value"],
      budgetTrace: ["start:0:value:budget-value", "run:budget-value", "end:0:value:success:budget-value"],
    })
    expect(report.containmentKill).toBe(false)
    expect(report.exitCode).toBe(0)
  }))
}, 120_000)

test("CONTROL E10 source: actual host tool distinguishes undefined properties and sparse slots before JSON reporting", () => {
  expectSpawn(import.meta.path)
  return run(Effect.gen(function* () {
    const report = yield* runChild(path.join(source, "index.ts"), "arguments")
    assertSetup(report)
    expect(report.result).toMatchObject({ result: { ok: true, value: {
      present: true, absent: true, presentUndefined: true, sparseHole: true,
      explicitSlot: true, slotUndefined: true, length: 3, last: "last",
    }, toolCalls: [{ name: "inspect" }] } })
    expect(report.containmentKill).toBe(false)
    expect(report.exitCode).toBe(0)
  }))
}, 120_000)

test("CONTROL E10 source: safe tool errors survive while private causes stay hidden", () => {
  expectSpawn(import.meta.path)
  return run(Effect.gen(function* () {
    const report = yield* runChild(path.join(source, "index.ts"), "errors")
    assertSetup(report)
    expect(report.result).toMatchObject({
      result: { ok: false, error: { kind: "ToolFailure", message: "Safe refusal" } },
      hidden: { ok: false, error: { kind: "ToolFailure", message: "Tool execution failed" } },
    })
    expect(JSON.stringify(report.result)).not.toContain("PRIVATE_CODEMODE_DEADLINE_CAUSE")
    expect(report.stderr).not.toContain("PRIVATE_CODEMODE_DEADLINE_CAUSE")
    expect(report.containmentKill).toBe(false)
    expect(report.exitCode).toBe(0)
  }))
}, 120_000)

test("CONTROL E10 source: exact Effect reuse and concurrent budgets keep distinct real receipts", () => {
  expectSpawn(import.meta.path)
  return run(Effect.gen(function* () {
    const report = yield* runChild(path.join(source, "index.ts"), "reuse")
    assertSetup(report)
    expect(report.result).toMatchObject({
      results: [
        { ok: true, value: "left", toolCalls: [{ name: "value" }] },
        { ok: true, value: "right", toolCalls: [{ name: "value" }] },
      ],
      repeated: { ok: true, value: "again", toolCalls: [{ name: "value" }] }, distinctReceipts: true,
    })
    expect(report.containmentKill).toBe(false)
    expect(report.exitCode).toBe(0)
  }))
}, 120_000)

for (const scenario of ["literal-test", "dynamic-exec", "string-match", "replace-callback", "match-all"] as const) {
  test(`CPU E10 source ${scenario}: product deadline settles while host heartbeats continue`, () => {
    expectSpawn(import.meta.path)
    return run(Effect.gen(function* () {
      yield* assertDeadline(path.join(source, "index.ts"), scenario)
    }))
  }, 120_000)
}

test("CPU E10 compiled literal-test: bundled public index and adjacent worker settle and exit naturally", () => {
  expectSpawn(import.meta.path)
  return run(Effect.gen(function* () {
    const index = yield* compiled
    yield* assertDeadline(index, "literal-test")
  }))
}, 120_000)

const assertDeadline = Effect.fn("CodeModeDeadline.assertDeadline")(function* (index: string, scenario: string) {
  const report = yield* runChild(index, scenario, true)
  assertSetup(report, true)
  // On the old implementation the marked CPU phase stalls this child. Killing it is containment, never enforcement.
  expect(report.result, "CodeMode must produce a result; an external watchdog kill is not its deadline").toBeDefined()
  expect(report.result).toMatchObject({
    result: {
      ok: false, error: { kind: "TimeoutExceeded" }, logs: expect.arrayContaining(["regex-phase"]),
      toolCalls: expect.arrayContaining([{ name: "mark" }, { name: "slow" }]),
    },
    facts: { heartbeats: expect.any(Number), slowCompleted: 0, slowInterrupted: 1, afterCalls: 0 },
    trace: expect.arrayContaining(["start:slow", "start:mark", "end:mark:success"]),
  })
  const facts = Schema.decodeUnknownSync(Schema.Struct({
    facts: Schema.Struct({ heartbeats: Schema.Number, elapsedAfterMarkMs: Schema.Number, maxGapMs: Schema.Number }),
    result: Schema.Struct({ toolCalls: Schema.Array(Schema.Struct({ name: Schema.String })) }),
    trace: Schema.Array(Schema.String),
  }))(report.result)
  expect(facts.facts.heartbeats).toBeGreaterThanOrEqual(3)
  expect(facts.facts.elapsedAfterMarkMs).toBeGreaterThanOrEqual(250)
  expect(facts.facts.elapsedAfterMarkMs).toBeLessThan(3000)
  expect(facts.facts.maxGapMs).toBeLessThan(750)
  expect(report.result).not.toMatchObject({ result: { logs: expect.arrayContaining(["regex-completed"]) } })
  expect(report.messages.some((message) => message.type === "HEARTBEAT")).toBe(true)
  expect(facts.result.toolCalls).toHaveLength(2)
  expect(facts.trace.some((entry) => entry.startsWith("end:slow"))).toBe(false)
  expect(report.containmentKill).toBe(false)
  expect(report.exitCode).toBe(0)
})

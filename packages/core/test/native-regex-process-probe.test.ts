import { expect, test } from "bun:test"
import path from "node:path"
import { Cause, Deferred, Effect, Exit, Fiber, Option, Schema, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { AppProcess } from "../src/process"
import { expectSpawn } from "./fixture/omni-expect"

const Envelope = Schema.Struct({ type: Schema.Literals(["CPU_ENTER", "CPU_DONE"]), payload: Schema.Unknown })
const Enter = Schema.Struct({ pid: Schema.Number, patternBytes: Schema.Number, subjectBytes: Schema.Number })
const layer = AppNodeBuilder.build(AppProcess.node)
const maxBytes = 64 * 1024

const waitUntil = (deadline: number): Effect.Effect<void> => Effect.suspend(() => {
  const remaining = deadline - performance.now()
  return remaining > 0 ? Effect.sleep(Math.ceil(remaining)).pipe(Effect.andThen(() => waitUntil(deadline))) : Effect.void
})

test("PROBE ONLY E10 owned OS process SIGKILL during native regex CPU", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(Effect.gen(function* () {
    const processes = yield* AppProcess.Service
    const admittedAt = performance.now()
    const child = yield* processes.spawn(ChildProcess.make(process.execPath, [
      path.join(import.meta.dir, "fixture/native-regex-process-probe.mjs"),
    ], { stdin: "ignore", stdout: "pipe", stderr: "pipe", killSignal: "SIGKILL", forceKillAfter: 0 }))
    const entered = yield* Deferred.make<void>()
    const outerReached = yield* Deferred.make<void>()
    const messages = new Array<typeof Envelope.Type>()
    const state = {
      bytes: 0, pending: "", enterMs: undefined as number | undefined,
      liveBeforeKill: undefined as boolean | undefined, liveAfterKill: undefined as boolean | undefined,
      productKillMs: undefined as number | undefined, productKillJoinedMs: undefined as number | undefined,
      exitObservedMs: undefined as number | undefined, joinedMs: undefined as number | undefined,
      outerWatchdog: false, readersJoined: false, heartbeats: 0, lastHeartbeat: admittedAt, maxGapMs: 0,
    }
    const decoder = new TextDecoder()
    const output = yield* Effect.forkChild(child.stdout.pipe(Stream.runForEach((chunk) => Effect.gen(function* () {
      state.bytes += chunk.length
      if (state.bytes > maxBytes) return yield* Effect.die("PROBE SETUP: stdout exceeds64KiB")
      const lines = (state.pending + decoder.decode(chunk, { stream: true })).split("\n")
      state.pending = lines.pop() ?? ""
      yield* Effect.forEach(lines.filter(Boolean), (line) => Effect.gen(function* () {
        const message = Schema.decodeUnknownSync(Envelope)(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(line))
        messages.push(message)
        if (messages.length > 4) return yield* Effect.die("PROBE SETUP: too many child records")
        if (message.type === "CPU_ENTER") {
          state.enterMs = performance.now() - admittedAt
          yield* Deferred.succeed(entered, undefined)
        }
      }))
    }))))
    const errorOutput = yield* Effect.forkChild(AppProcess.collectStream(child.stderr, maxBytes))
    const exited = yield* Effect.forkChild(Effect.exit(child.exitCode).pipe(Effect.tap(() => Effect.sync(() => {
      state.exitObservedMs = performance.now() - admittedAt
    }))))
    const heartbeat = yield* Effect.forkChild(Effect.forever(Effect.sleep(50).pipe(Effect.andThen(Effect.sync(() => {
      const now = performance.now()
      state.heartbeats++
      state.maxGapMs = Math.max(state.maxGapMs, now - state.lastHeartbeat)
      state.lastHeartbeat = now
    })))))
    const productKill = yield* Effect.forkChild(Effect.gen(function* () {
      yield* waitUntil(admittedAt + 1500)
      state.liveBeforeKill = yield* child.isRunning
      if (!state.liveBeforeKill) return
      state.productKillMs = performance.now() - admittedAt
      yield* child.kill({ killSignal: "SIGKILL", forceKillAfter: 0 })
      state.productKillJoinedMs = performance.now() - admittedAt
      state.liveAfterKill = yield* child.isRunning
    }))
    const outerWatchdog = yield* Effect.forkChild(Effect.gen(function* () {
      yield* waitUntil(admittedAt + 6500)
      state.outerWatchdog = true
      yield* Deferred.succeed(outerReached, undefined)
      yield* child.kill({ killSignal: "SIGKILL", forceKillAfter: 0 })
    }))
    const startup = yield* Effect.raceAll([
      Deferred.await(entered).pipe(Effect.as(true)), Fiber.join(exited).pipe(Effect.as(false)),
      Deferred.await(outerReached).pipe(Effect.as(false)),
    ]).pipe(Effect.timeout("30 seconds"))
    const completed = yield* Effect.gen(function* () {
      const [exit, , errors] = yield* Effect.all([Fiber.join(exited), Fiber.join(output), Fiber.join(errorOutput)], { concurrency: "unbounded" })
      yield* Fiber.join(productKill)
      state.readersJoined = true
      state.joinedMs = performance.now() - admittedAt
      return { exit, errors }
    })
    yield* Fiber.interrupt(outerWatchdog)
    yield* Fiber.interrupt(heartbeat)
    state.maxGapMs = Math.max(state.maxGapMs, performance.now() - state.lastHeartbeat)
    const enter = Schema.decodeUnknownOption(Enter)(messages.find((message) => message.type === "CPU_ENTER")?.payload)
    const terminal = Exit.isFailure(completed.exit) ? Cause.squash(completed.exit.cause) : undefined
    const terminalMessage = terminal instanceof Error ? terminal.message : terminal === undefined ? "" : String(terminal)
    const witness = `E10_OS_PROCESS_CAPABILITY ${JSON.stringify({
      purpose: "diagnostic-not-CodeMode-green", pid: Number(child.pid), startup, requestedSignal: "SIGKILL",
      enter: Option.isSome(enter) ? enter.value : null, enterMs: state.enterMs ?? null,
      liveBeforeKill: state.liveBeforeKill ?? null, liveAfterKill: state.liveAfterKill ?? null,
      productKillMs: state.productKillMs ?? null, productKillJoinedMs: state.productKillJoinedMs ?? null,
      exitObservedMs: state.exitObservedMs ?? null, joinedMs: state.joinedMs ?? null,
      exitCode: Exit.isSuccess(completed.exit) ? Number(completed.exit.value) : null,
      exitSignalFromError: terminalMessage.includes("SIGKILL") ? "SIGKILL" : null,
      terminalError: terminalMessage.slice(0, 180), outerWatchdog: state.outerWatchdog,
      readersJoined: state.readersJoined, heartbeats: state.heartbeats, maxGapMs: state.maxGapMs,
      cpuDone: messages.some((message) => message.type === "CPU_DONE"),
      stdoutBytes: state.bytes, stderrBytes: completed.errors.buffer.length, stderrTruncated: completed.errors.truncated,
    })}\n`
    if (Buffer.byteLength(witness) > 4096) return yield* Effect.die("PROBE SETUP: witness exceeds4KiB")
    yield* Effect.promise(() => Bun.stderr.write(witness))
    expect(startup).toBe(true)
    expect(Option.isSome(enter)).toBe(true)
    if (Option.isNone(enter) || state.enterMs === undefined) throw new Error("Expected actual CPU_ENTER")
    expect(Number(child.pid)).toBeGreaterThan(0)
    expect(enter.value.pid).toBe(Number(child.pid))
    expect(enter.value.patternBytes).toBe(14340)
    expect(enter.value.subjectBytes).toBe(8 * 1024 * 1024)
    expect(state.enterMs).toBeGreaterThanOrEqual(0)
    expect(state.enterMs).toBeLessThan(750)
    expect(state.liveBeforeKill).toBe(true)
    expect(state.liveAfterKill).toBe(false)
    expect(state.productKillJoinedMs).toBeDefined()
    expect(state.exitObservedMs).toBeDefined()
    expect(state.readersJoined).toBe(true)
    expect(state.outerWatchdog).toBe(false)
    expect(messages.some((message) => message.type === "CPU_DONE")).toBe(false)
    expect(state.heartbeats).toBeGreaterThanOrEqual(3)
    expect(completed.errors.truncated).toBe(false)
    // Elapsed times and platform-dependent signal/code are observations, not CodeMode deadline assertions.
  }).pipe(Effect.scoped, Effect.provide(layer)))
}, 120_000)
